import gsap from 'gsap';
import { sound } from './sound.js';
/**
 * Lógica del Senet: reglas, turnos, tablillas 3D, raycasting e IA.
 * main.js llama a initGame(world) con la escena ya construida.
 */
export function initGame(world) {
  const {
    THREE,
    scene,
    camera,
    renderer,
    controls,
    tileMeshes,
    pieces,
    BOARD_TOP_Y,
    SPECIAL_SQUARES,
    squareToPosition,
    setTileGlow,
    addUpdater,
  } = world;

  const dom = renderer.domElement;
  const $ = (sel) => document.querySelector(sel);

  /* ======================================================================
     CONSTANTES
     ====================================================================== */
  const NAMES = { 1: 'Marfil', 2: 'Arhestan' }; // Arhestan juega con las fichas de ébano
  const HUMAN = 1; // Marfil lo controla la persona; Ébano es la IA
  const EXIT = 31; // una ficha sale al llegar exactamente a 31
  const SAFE = new Set([26, 28, 29, 30]); // casillas donde no se puede desplazar
  const TRAY_Y = -0.5; // las fichas liberadas descansan en el borde del pedestal
  const TRAY_Z = 2.47;
  const STICK_Z = 4.3;
  const STICK_Y = -1.455;

  const other = (p) => (p === 1 ? 2 : 1);

  /* ======================================================================
     ESTADO
     ====================================================================== */
  const board = new Array(31).fill(0); // board[1..30] = 0 | 1 | 2
  const pieceAt = new Array(31).fill(null);
  const borne = { 1: 0, 2: 0 }; // fichas liberadas

  let current = 1;
  let state = 'idle'; // idle | rolling | selecting | thinking | moving | passing | ended
  let lastRoll = 0;
  let lastExtra = false;
  let moves = [];
  let moveByPiece = new Map();
  let hovered = null;
  let gameId = 0;
  let master = null;
  let rollTl = null;

  /* ======================================================================
     ELEMENTOS DEL HUD
     ====================================================================== */
   const rollBtn = $('#btn-roll');
  const mRollBtn = $('#m-btn-roll');
  const logEl = $('#game-log');
  const chips = [...document.querySelectorAll('.stick-chip')]; // escritorio + móvil (cada uno con data-stick)

  // Cada dato del HUD existe dos veces (escritorio y móvil): se actualizan juntos
  const rollResultEls = ['#roll-result', '#m-roll-result'].map((s) => $(s)).filter(Boolean);
  const rollExtraEls = ['#roll-extra', '#m-roll-extra'].map((s) => $(s)).filter(Boolean);
  const setRollResult = (v) => rollResultEls.forEach((e) => (e.textContent = v));
  const setRollExtra = (v) => rollExtraEls.forEach((e) => (e.textContent = v));

  const setStatus = (text) => {
    $('#status-text').textContent = text;
    const m = $('#m-status');
    if (m) m.textContent = text;
  };
  const setRollEnabled = (on) => {
    rollBtn.disabled = !on;
    if (mRollBtn) mRollBtn.disabled = !on;
  };

  function addLog(text, cls = '') {
    const li = document.createElement('li');
    li.textContent = text;
    if (cls) li.className = cls;
    logEl.prepend(li);
    while (logEl.children.length > 40) logEl.lastChild.remove();
    gsap.from(li, { autoAlpha: 0, x: -14, duration: 0.4, ease: 'power2.out' });
  }
  const pLog = (p) => (p === 1 ? 'log-p1' : 'log-p2');

   function updateHud() {
    $('#p1-score').textContent = borne[1];
    $('#p2-score').textContent = borne[2];
    const playing = state !== 'ended';
    const p2Active = playing && current === 2 && state !== 'thinking';
    const p2Thinking = playing && current === 2 && state === 'thinking';

    $('#player-1-card').classList.toggle('is-active', playing && current === 1);
    const p2Card = $('#player-2-card');
    p2Card.classList.toggle('is-active', p2Active);
    p2Card.classList.toggle('is-thinking', p2Thinking);
    $('#turn-indicator').textContent = playing ? `Turno de ${NAMES[current]}` : 'Partida terminada';

    // HUD móvil
    $('#m-p1-score').textContent = borne[1];
    $('#m-p2-score').textContent = borne[2];
    $('#m-p1').classList.toggle('is-active', playing && current === 1);
    $('#m-p2').classList.toggle('is-active', p2Active);
    $('#m-p2').classList.toggle('is-thinking', p2Thinking);
  }

  function later(seconds, fn) {
    const g = gameId;
    return gsap.delayedCall(seconds, () => {
      if (g === gameId) fn();
    });
  }

 /* ======================================================================
     CONTROL DE SONIDO (SWITCH EN PANEL IZQUIERDO)
     ===================================================================== */
    const soundSwitch = $('#btn-sound-switch');
  const mSound = $('#m-btn-sound');
  const soundWaves = document.querySelectorAll('#sound-svg-icon .sound-wave');
  const soundX = $('#sound-x');

  function syncSoundUI(active) {
    for (const el of [soundSwitch, mSound]) el?.setAttribute('aria-checked', active ? 'true' : 'false');
    soundWaves.forEach((w) => (w.style.display = active ? '' : 'none'));
    if (soundX) soundX.style.display = active ? 'none' : '';
  }

  function toggleSound() {
    const active = sound.toggleMute(); // true = suena, false = mute
    syncSoundUI(active);
    if (active) sound.playPieceMove(); // pequeño "toc" de confirmación
  }

  soundSwitch?.addEventListener('click', toggleSound);
  mSound?.addEventListener('click', toggleSound);
  syncSoundUI(!sound.muted); // respeta el silencio guardado de otra sesión

  // Crea un Sprite 3D con el jeroglífico "𓂻" (caminar/mover) para las fichas seleccionables
 // Crea un Sprite 3D con el jeroglífico "𓂻" relleno y con borde dorado brillante
  function makeSelectionSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');

    // Halo radial suave detrás del símbolo para darle profundidad
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 56);
    grad.addColorStop(0, 'rgba(173, 147, 76, 0.85)'); // Fondo oscuro semitransparente para contraste
    grad.addColorStop(0.5, 'rgba(212, 175, 55, 0.35)');
    grad.addColorStop(1, 'rgba(212, 175, 55, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    // Configuración de tipografía y sombra exterior para el jeroglífico
    ctx.font = '700 58px "Noto Sans Egyptian Hieroglyphs", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(161, 127, 62, 0.9)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;

    // 1. Relleno interior con un tono dorado cálido y brillante muy legible
    ctx.fillStyle = '#ffea9f'; 
    ctx.fillText('𓂻', 64, 58);

    // 2. Borde exterior oscuro/dorado para definir bien la silueta
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#5a3d0b';
    ctx.strokeText('𓂻', 64, 58);
    // Pequeño triángulo indicador inferior sólido
    ctx.fillStyle = '#f3d77a';
    ctx.strokeStyle = '#5a3d0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(52, 94);
    ctx.lineTo(76, 94);
    ctx.lineTo(64, 108);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.65, 0.65, 1);
    sprite.position.y = 1.15;
    sprite.visible = false;
    return sprite;
  }

  // Adjuntamos un marcador a cada pieza de Marfil (jugador 1)
  const pieceMarkers = new Map();
  for (const p of pieces) {
    if (p.userData.player === HUMAN) {
      const marker = makeSelectionSprite();
      p.add(marker);
      pieceMarkers.set(p, marker);
    }
  }
  /* ======================================================================
     CAMBIO DE ESTILOS DE FICHA (MARFIL)
     ====================================================================== */
  // 3 perfiles de tornno (LatheGeometry) diferentes para las fichas claras
  const STYLES_PROFILE = [
    // Estilo 0: Carrete clásico
    [ [0,0], [0.38,0], [0.4,0.04], [0.38,0.09], [0.22,0.14], [0.18,0.28], [0.22,0.4], [0.34,0.46], [0.35,0.54], [0.29,0.6], [0.16,0.63], [0,0.64] ],
    // Estilo 1: Cilindro escalonado con cúpula
    [ [0,0], [0.36,0], [0.36,0.12], [0.28,0.14], [0.28,0.32], [0.36,0.34], [0.36,0.48], [0.26,0.52], [0.22,0.64], [0,0.66] ],
    // Estilo 2: Cono truncado faraónico con anillos
    [ [0,0], [0.4,0], [0.35,0.15], [0.25,0.22], [0.27,0.36], [0.2,0.42], [0.22,0.56], [0.12,0.62], [0,0.65] ]
  ];

  const STYLE_NAMES = ['Carrete Clásico', 'Cilindro Anillado', 'Cono Faraónico'];
  let currentPieceStyleIndex = 0;

  const btnChangeStyle = $('#btn-change-style');
  
  function updatePlayerPiecesGeometry(styleIndex) {
    const profile = STYLES_PROFILE[styleIndex].map(([r, y]) => new THREE.Vector2(r, y));
    
    pieces.forEach((p) => {
      if (p.userData.player === 1) {
        // Encontramos el mesh principal de la pieza (el hijo 0)
        const mainMesh = p.children[0];
        if (mainMesh) {
          mainMesh.geometry.dispose();
          mainMesh.geometry = new THREE.LatheGeometry(profile, 56);
        }
      }
    });

    addLog(`Estilo de fichas de Marfil cambiado a: ${STYLE_NAMES[styleIndex]}`, 'log-special');
    sound.playPieceMove();
  }

  function cycleStyle() {
    currentPieceStyleIndex = (currentPieceStyleIndex + 1) % STYLES_PROFILE.length;
    updatePlayerPiecesGeometry(currentPieceStyleIndex);
    // Animación rápida de pulso en la tarjeta al cambiar
    gsap.fromTo('#player-1-card, #m-p1', { scale: 0.96 }, { scale: 1, duration: 0.3, ease: 'back.out(1.7)' });
  }
  btnChangeStyle?.addEventListener('click', cycleStyle);
  $('#m-btn-style')?.addEventListener('click', cycleStyle);
  /* ======================================================================
     REGLAS
     ====================================================================== */
  const isProtected = (sq, player) => board[sq - 1] === player || board[sq + 1] === player;

  /** ¿Hay 3 o más fichas rivales seguidas entre from y to (sin incluirlos)? */
  function isBlocked(from, to, enemy) {
    let run = 0;
    for (let s = from + 1; s < to; s++) {
      if (board[s] === enemy) {
        run++;
        if (run >= 3) return true;
      } else run = 0;
    }
    return false;
  }

  /** Casilla de renacimiento: la 15 o la primera libre anterior. */
  function findReturnSquare() {
    for (let r = 15; r >= 1; r--) if (board[r] === 0) return r;
    return 0;
  }

  function getMoves(player, roll) {
    const enemy = other(player);
    const out = [];
    for (let sq = 1; sq <= 30; sq++) {
      if (board[sq] !== player) continue;
      const target = sq + roll;
      if (target > EXIT) continue; // no se puede sobrepasar la salida
      if (sq < 26 && target > 26) continue; // hay que detenerse en la casilla 26
      if (isBlocked(sq, Math.min(target, EXIT), enemy)) continue;

      const base = { piece: pieceAt[sq], from: sq, to: target };

      if (target === EXIT) {
        out.push({ ...base, kind: 'off' });
        continue;
      }
      const occupant = board[target];
      if (occupant === player) continue;
      if (occupant === enemy) {
        if (SAFE.has(target) || isProtected(target, enemy)) continue;
        out.push({ ...base, kind: 'swap' });
      } else if (target === 27) {
        const ret = findReturnSquare();
        if (!ret) continue;
        out.push({ ...base, kind: 'water', ret });
      } else {
        out.push({ ...base, kind: 'move' });
      }
    }
    return out;
  }

  /* ======================================================================
     IA (heurística sencilla)
     ====================================================================== */
  function scoreMove(m, player) {
    let s = Math.random() * 4;
    if (m.kind === 'off') return s + 120;
    if (m.kind === 'water') return s - 70;
    s += lastRoll * 2;
    if (m.to === 26) s += 35;
    if (m.to >= 28) s += 18;
    if (m.to === 15) s += 3;
    if (m.kind === 'swap') s += 14 + lastRoll * 3;
    if (board[m.to - 1] === player || board[m.to + 1] === player) s += 7; // queda protegida
    const hadBuddy = board[m.from - 1] === player || board[m.from + 1] === player;
    if (hadBuddy) s -= 4; // deja una ficha sola
    return s;
  }
  const aiChoose = (list) => list.reduce((best, m) => (scoreMove(m, current) > scoreMove(best, current) ? m : best));

  /* ======================================================================
     TABLILLAS 3D (se lanzan sobre la arena, frente al pedestal)
     ====================================================================== */
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4a26, roughness: 0.7 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xefe0b0, roughness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x241408, roughness: 0.5 });
  const stickGeo = new THREE.BoxGeometry(0.26, 0.07, 1.25);

  const sticks = Array.from({ length: 4 }, () => {
    // orden de caras: +x, -x, +y (clara), -y (oscura), +z, -z
    const m = new THREE.Mesh(stickGeo, [woodMat, woodMat, lightMat, darkMat, woodMat, woodMat]);
    m.castShadow = true;
    m.visible = false;
    scene.add(m);
    return m;
  });

  // suelo invisible que solo recibe las sombras de las tablillas
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.ShadowMaterial({ opacity: 0.35 }));
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.y = -1.49;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  function throwSticks(lights, onDone) {
    sticks.forEach((s) => gsap.killTweensOf([s.position, s.rotation]));
    const tl = gsap.timeline({ onComplete: onDone });
    sticks.forEach((s, i) => {
      const x = (i - 1.5) * 1.05 + (Math.random() - 0.5) * 0.25;
      const z = STICK_Z + (Math.random() - 0.5) * 0.35;
      const t0 = i * 0.05;
      const spins = 2 + Math.floor(Math.random() * 2);
      s.visible = true;
      s.position.set((i - 1.5) * 0.4, 1.4, 2.9);
      s.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      tl.to(s.position, { x, z, duration: 1.0, ease: 'power1.out' }, t0)
        .to(s.position, { y: 2.8, duration: 0.4, ease: 'power2.out' }, t0)
        .to(s.position, { y: STICK_Y, duration: 0.6, ease: 'bounce.out' }, t0 + 0.4)
        .to(
          s.rotation,
          {
            x: (lights[i] ? 0 : Math.PI) + Math.PI * 2 * spins, // cara clara arriba = giro par
            y: (Math.random() - 0.5) * 0.7,
            z: 0,
            duration: 1.0,
            ease: 'power2.out',
          },
          t0,
      );
      tl.call(() => sound.playStickClack(), null, t0 + 0.42);
    });
    return tl;
  }

  /* ======================================================================
     FLUJO DE TURNOS
     ====================================================================== */
  function startTurn() {
    state = 'idle';
    moves = [];
    moveByPiece = new Map();
    hovered = null;
    refreshGlows();
    updateHud();
    if (current === HUMAN) {
      setRollEnabled(true);
      setStatus('Lanza las tablillas para continuar.');
    } else {
      setRollEnabled(false);
      setStatus(`${NAMES[current]} se prepara para lanzar…`);
      later(1.1, roll);
    }
  }

  function switchPlayer() {
    current = other(current);
    startTurn();
  }

  function roll() {
    if (state !== 'idle') return;
    state = 'rolling';
    setRollEnabled(false);
    setStatus('Las tablillas giran en el aire…');

    const lights = Array.from({ length: 4 }, () => Math.random() < 0.5);
    const count = lights.filter(Boolean).length;
    const value = count === 0 ? 5 : count;
    lastRoll = value;
    lastExtra = value === 1 || value === 4 || value === 5;

     setRollResult('…');
    setRollExtra('');
    chips.forEach((c) => {
      c.classList.remove('is-light', 'is-dark');
      c.classList.add('is-rolling');
    });

    const g = gameId;
    rollTl = throwSticks(lights, () => {
      if (g !== gameId) return;
   chips.forEach((c) => {
        c.classList.remove('is-rolling');
        c.classList.add(lights[Number(c.dataset.stick)] ? 'is-light' : 'is-dark');
      });
      setRollResult(value);
      setRollExtra(lastExtra ? '✦ ¡Tirada extra!' : '');
      gsap.fromTo(rollResultEls, { scale: 1.7, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(2)' });
      
      addLog(`${NAMES[current]} saca un ${value}${lastExtra ? ' y repetirá turno' : ''}.`, pLog(current));
      if (lastExtra) sound.playMysticChime(false);
      afterRoll();
    });
  }

  function afterRoll() {
    moves = getMoves(current, lastRoll);

    if (!moves.length) {
      state = 'passing';
      addLog(`${NAMES[current]} no tiene movimientos y pierde el turno.`, pLog(current));
      setStatus('Sin movimientos posibles. Se pasa el turno.');
      later(1.5, switchPlayer);
      return;
    }

    if (current === HUMAN) {
      state = 'selecting';
      moveByPiece = new Map(moves.map((m) => [m.piece, m]));
      setStatus(`Sacaste un ${lastRoll}. Elige una ficha resaltada para moverla.`);
      refreshGlows();
    } else {
      state = 'thinking';
      updateHud();
      setStatus(`${NAMES[current]} medita su jugada…`);
      later(1.1, () => executeMove(aiChoose(moves)));
    }
  }

  /* ======================================================================
     EJECUCIÓN Y ANIMACIÓN DE MOVIMIENTOS
     ====================================================================== */
  const trayPos = (player, slot) => new THREE.Vector3((slot - 2) * 1.0, TRAY_Y, player === 1 ? TRAY_Z : -TRAY_Z);

  function arcMove(obj, dest, { lift = 0.9, duration = 0.75 } = {}) {
    const peak = Math.max(obj.position.y, dest.y) + lift;
    return gsap
      .timeline()
      .to(obj.position, { y: peak, duration: duration * 0.3, ease: 'power2.out' })
      .to(obj.position, { x: dest.x, z: dest.z, duration: duration * 0.5, ease: 'power1.inOut' })
      .to(obj.position, { y: dest.y, duration: duration * 0.3, ease: 'power2.in' });
  }

  /** Actualiza el estado lógico (tablero y fichas) antes de animar. */
  function applyLogic(m) {
    const pl = current;
    board[m.from] = 0;
    pieceAt[m.from] = null;

    if (m.kind === 'off') {
      m.piece.userData.square = null;
      m.traySlot = borne[pl];
      borne[pl]++;
    } else if (m.kind === 'swap') {
      const enemyPiece = pieceAt[m.to];
      board[m.from] = other(pl);
      pieceAt[m.from] = enemyPiece;
      enemyPiece.userData.square = m.from;
      board[m.to] = pl;
      pieceAt[m.to] = m.piece;
      m.piece.userData.square = m.to;
      m.swapped = enemyPiece;
    } else if (m.kind === 'water') {
      board[m.ret] = pl;
      pieceAt[m.ret] = m.piece;
      m.piece.userData.square = m.ret;
    } else {
      board[m.to] = pl;
      pieceAt[m.to] = m.piece;
      m.piece.userData.square = m.to;
    }
  }

  function logMove(m) {
    const n = NAMES[current];
    const cls = pLog(current);
    if (m.kind === 'off') {
      addLog(`${n} libera una ficha (${borne[current]}/5).`, 'log-special');
    } else if (m.kind === 'swap') {
      addLog(`${n} desplaza a una ficha de ${NAMES[other(current)]} en la casilla ${m.to}.`, cls);
    } else if (m.kind === 'water') {
      addLog(`${n} cae en la Casa de las Aguas y renace en la casilla ${m.ret}.`, 'log-special');
    } else {
      addLog(`${n} mueve de la casilla ${m.from} a la ${m.to}.`, cls);
      if (SPECIAL_SQUARES[m.to] && m.to !== 27) addLog(`${n} alcanza la ${SPECIAL_SQUARES[m.to]}.`, 'log-special');
    }
  }

  function executeMove(m) {
    if (state !== 'selecting' && state !== 'thinking') return;
    state = 'moving';
    setRollEnabled(false);

    // asentar las fichas que flotaban como "seleccionables"
    for (const mv of moves) if (mv.piece !== m.piece) mv.piece.position.y = BOARD_TOP_Y;
    hovered = null;
    dom.style.cursor = 'default';
    moves = [];
    moveByPiece = new Map();
    refreshGlows();

    const mover = current;
    applyLogic(m);
    logMove(m);
    updateHud();
    if (m.kind === 'swap') sound.playSwap();
    else if (m.kind === 'water') sound.playWater();
    else sound.playPieceMove();
    setStatus(`${NAMES[mover]} mueve su ficha…`);

    const g = gameId;
    master = gsap.timeline({
      onComplete: () => {
        if (g === gameId) afterMove(m, mover);
      },
    });

    if (m.kind === 'off') {
      master.add(arcMove(m.piece, trayPos(mover, m.traySlot), { lift: 1.1, duration: 0.9 }));
    } else if (m.kind === 'swap') {
      master.add(arcMove(m.piece, squareToPosition(m.to)));
      master.add(arcMove(m.swapped, squareToPosition(m.from), { lift: 0.5 }), 0);
    } else if (m.kind === 'water') {
      master.add(arcMove(m.piece, squareToPosition(27)));
      master.call(() => setTileGlow(27, 0x4fc3e8, 0.8));
      master.to({}, { duration: 0.6 });
      master.add(arcMove(m.piece, squareToPosition(m.ret), { lift: 1.5, duration: 1.0 }));
      master.call(() => setTileGlow(27, null));
    } else {
      master.add(arcMove(m.piece, squareToPosition(m.to)));
    }
  }

  function afterMove(m, mover) {
    updateHud();
    if (borne[mover] === 5) return endGame(mover);
    maybeTaunt(m, mover);
    if (lastExtra) {
      addLog(`${NAMES[current]} repite turno.`, 'log-special');
      return startTurn();
    }
    switchPlayer();
  }

  /* ======================================================================
     FARAÓN ARHESTAN I: frases de suficiencia (ventaja) e insultos (desventaja)
     ====================================================================== */
     const VOICE_DIR = `${import.meta.env.BASE_URL}audio/faraon`;// public/audio/faraon/
  // Cuántos audios hay grabados por tipo. Ahora 0: todo funciona solo con texto.
  const VOICES_READY = { ahead: 0, behind: 0 };

  // La frase nº 1 de la lista usa ahead-01.mp3, la nº 2 ahead-02.mp3, etc.
  const voiceFile = (mood, i) =>
    i < VOICES_READY[mood] ? `${VOICE_DIR}/${mood}-${String(i + 1).padStart(2, '0')}.mp3` : null;
  const TAUNTS = {
    ahead: [
      'Juegas con la elegancia de un camello.',
      'Hasta las momias se mueven con más gracia que tú.',
      'El Nilo corre a mi favor, mortal.',
      'Observa y aprende, aprendiz de escriba.',
      'Mi sombra juega mejor que tú.',
      'Qué encantadora torpeza. Continúa, me divierte.',
      'Ra en persona aplaudiría esta jugada.',
      'Incluso un escarabajo calcularía mejor sus pasos.',
      'Esta partida ya está escrita en mi sarcófago.',
      'Los dioses sonríen... a mí, por supuesto.',
    ],
    behind: [
      'Tu suerte es tan breve como la lluvia en el Sahara.',
      'Disfruta este instante, plebeyo: la arena siempre regresa a su dueño.',
      'Un golpe de fortuna no convierte a un campesino en faraón.',
      'Hasta Anubis bosteza ante tu estrategia.',
      'Qué audacia la tuya, con tan poco linaje.',
      'Ni los chacales del desierto celebrarían esa jugada.',
      'Los dioses cobran con intereses, mortal. Ya lo verás.',
      'Te perdono la insolencia: la ignorancia también es una forma de inocencia.',
      'Presumes como un escriba que acaba de aprender a contar.',
      'Tu victoria es como tu sombra: pasajera y sin sustancia.',
    ],
  };
  const phraseBag = { ahead: [], behind: [] }; // baraja: no se repite hasta agotar las 10
  const tauntEl = $('#taunt');
  const tauntText = $('#taunt-text');
  let tauntTl = null;
  let turnsSinceTaunt = 99;
  gsap.set(tauntEl, { autoAlpha: 0 });

   function nextPhrase(mood) {
    if (!phraseBag[mood].length) {
      phraseBag[mood] = TAUNTS[mood]
        .map((text, i) => ({ text, audio: voiceFile(mood, i) }))
        .sort(() => Math.random() - 0.5);
    }
    return phraseBag[mood].pop();
  }

  let tauntHideTween = null;

  function hideTaunt(delay) {
    tauntHideTween?.kill(); // solo mata la orden de ocultar anterior, no la de mostrar
    tauntHideTween = gsap.to(tauntEl, { autoAlpha: 0, duration: 0.7, ease: 'power1.in', delay });
  }

  function say(mood) {
    const { text, audio } = nextPhrase(mood);
    tauntText.textContent = `«${text}»`;
    addLog(`Faraón Arhestan I: «${text}»`, 'log-p2');

    tauntTl?.kill();
    tauntHideTween?.kill();
    tauntTl = gsap.fromTo(tauntEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: 'power2.out' });

    // voz y texto aparecen a la vez; el texto se oculta 0.8 s después de que termine la voz
    const voiced = sound.playVoice(audio, () => hideTaunt(0.8));
    if (!voiced) hideTaunt(4.7); // 0.5 de aparición + unos 4 s de lectura

    turnsSinceTaunt = 0;
  }

  /** Progreso de un jugador: suma de casillas recorridas + 31 por ficha liberada. */
  function progress(player) {
    let s = borne[player] * 31;
    for (let sq = 1; sq <= 30; sq++) if (board[sq] === player) s += sq;
    return s;
  }

  function maybeTaunt(m, mover) {
    turnsSinceTaunt++;
    const diff = progress(2) - progress(1); // positivo = Arhestan va ganando
    let mood = diff >= 14 ? 'ahead' : diff <= -14 ? 'behind' : null;
    let chance = mood ? 0.5 : 0;

    // jugadas llamativas: reacciona casi siempre
    if (m.kind === 'swap') {
      mood = mover === 2 ? 'ahead' : 'behind';
      chance = 0.85;
    } else if (m.kind === 'water') {
      mood = mover === 1 ? 'ahead' : 'behind';
      chance = 0.85;
    }

    if (!mood) return;
    if (chance < 0.85 && turnsSinceTaunt < 2) return; // evita hablar en cada turno
    if (Math.random() < chance) say(mood);
  }

  /* ======================================================================
     FIN DE PARTIDA
     ====================================================================== */
  function endGame(winner) {
    state = 'ended';
    setRollEnabled(false);
    updateHud();
    setStatus(`${NAMES[winner]} ha guiado a todas sus almas hasta la eternidad.`);
    addLog(`¡${NAMES[winner]} gana la partida!`, 'log-special');
    if (winner === HUMAN) sound.playMysticChime(true);
    else sound.playDefeat();
    say(winner === 2 ? 'ahead' : 'behind');
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;

    const el = document.createElement('div');
    el.id = 'victory';
    el.className = 'fixed inset-0 z-40 flex items-end justify-center pb-24 pointer-events-none';
    el.innerHTML = `
      <div class="glass-strong pointer-events-auto rounded-3xl px-10 py-8 text-center">
        <p class="text-[0.65rem] uppercase tracking-[0.4em] text-gold">El alma alcanzó la eternidad</p>
        <h2 class="mt-2 font-display text-4xl tracking-widest text-gold-gradient">¡Victoria de ${NAMES[winner]}!</h2>
        <button id="btn-again" class="btn-gold mt-6">Jugar de nuevo</button>
      </div>`;
    document.body.appendChild(el);
    gsap.from(el.firstElementChild, { autoAlpha: 0, y: 40, scale: 0.9, duration: 0.8, ease: 'back.out(1.6)' });
    $('#btn-again').addEventListener('click', newGame);
  }

  /* ======================================================================
     RESALTADOS, HOVER Y RAYCASTING
     ====================================================================== */
 function refreshGlows() {
    for (let n = 1; n <= 30; n++) setTileGlow(n, null);
    for (const marker of pieceMarkers.values()) marker.visible = false;

    if (state !== 'selecting') return;
    for (const m of moves) {
      setTileGlow(m.from, 0xaa771c, 0.35);
      const marker = pieceMarkers.get(m.piece);
      if (marker) marker.visible = true;
    }
    if (hovered) {
      setTileGlow(hovered.from, 0xd4af37, 0.75);
      if (typeof hovered.to === 'number' && hovered.to <= 30) {
        const color = hovered.kind === 'swap' ? 0xd9533a : hovered.kind === 'water' ? 0x4fc3e8 : 0xf3d77a;
        setTileGlow(hovered.to, color, 0.75);
      }
    }
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pick(ev) {
    if (state !== 'selecting') return null;
    const rect = dom.getBoundingClientRect();
    pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);

    const targetSquares = new Map(moves.filter((m) => m.to <= 30).map((m) => [m.to, m]));
    const candidates = [
      ...moves.map((m) => m.piece),
      ...tileMeshes.filter((t) => targetSquares.has(t.userData.square)),
    ];

    for (const hit of raycaster.intersectObjects(candidates, true)) {
      let o = hit.object;
      while (o) {
        if (o.userData?.isPiece && moveByPiece.has(o)) return moveByPiece.get(o);
        if (o.userData?.isTile && targetSquares.has(o.userData.square)) return targetSquares.get(o.userData.square);
        o = o.parent;
      }
    }
    return null;
  }

  function setHover(m) {
    if (hovered === m) return;
    hovered = m;
    dom.style.cursor = m ? 'pointer' : 'default';
    refreshGlows();
    if (!m) return setStatus(`Sacaste un ${lastRoll}. Elige una ficha resaltada para moverla.`);
    if (m.kind === 'swap') setStatus(`Casilla ${m.from} → ${m.to}: desplazarás una ficha rival.`);
    else if (m.kind === 'water') setStatus(`¡Cuidado! La casilla 27 te devolverá a la ${m.ret}.`);
    else if (m.kind === 'off') setStatus('Esta ficha saldrá del tablero.');
    else setStatus(`Mover de la casilla ${m.from} a la ${m.to}.`);
  }

  let downX = 0;
  let downY = 0;
  dom.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });
  dom.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // fue un arrastre de cámara
    const m = pick(e);
    if (m) executeMove(m);
  });
  dom.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    if (state !== 'selecting') {
      if (hovered) setHover(null);
      return;
    }
    setHover(pick(e));
  });
  dom.addEventListener('pointerleave', () => hovered && setHover(null));
/* ======================================================================
     TOOLTIP DE CASILLAS ESPECIALES
     ====================================================================== */
  const SPECIAL_INFO = {
    15: { title: '15 · Casa del Renacimiento (☥)', desc: 'Punto de retorno para las fichas que caen en las aguas.' },
    26: { title: '26 · Casa de la Felicidad', desc: 'Parada obligatoria antes del tramo final. Sales con un 5.' },
    27: { title: '27 · Casa de las Aguas', desc: 'Trampa: devuelve tu ficha a la casilla 15 (o anterior libre).' },
    28: { title: '28 · Casa de las Tres Verdades', desc: 'Casilla segura. Necesitas sacar exactamente un 3 para salir.' },
    29: { title: '29 · Casa de Re-Atum', desc: 'Casilla segura. Necesitas sacar exactamente un 2 para salir.' },
    30: { title: '30 · Casa de Horus', desc: 'Última casilla segura. Necesitas sacar exactamente un 1 para salir.' },
  };

  const tooltipEl = $('#tile-tooltip');
  const tooltipTitle = $('#tooltip-title');
  const tooltipDesc = $('#tooltip-desc');

  function updateTileTooltip(ev) {
    if (ev.buttons) {
      tooltipEl.classList.add('hidden');
      return;
    }
    const rect = dom.getBoundingClientRect();
    pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(tileMeshes, false);
    const sq = hits[0]?.object?.userData?.square;
    const info = SPECIAL_INFO[sq];

    if (!info) {
      tooltipEl.classList.add('hidden');
      return;
    }

    tooltipTitle.textContent = info.title;
    tooltipDesc.textContent = info.desc;
    tooltipEl.classList.remove('hidden');

    // Posiciona el tooltip junto al cursor evitando que se salga de la pantalla
    const x = Math.min(window.innerWidth - 270, ev.clientX + 16);
    const y = Math.min(window.innerHeight - 90, ev.clientY + 16);
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
  }

  dom.addEventListener('pointermove', updateTileTooltip);
  dom.addEventListener('pointerleave', () => tooltipEl.classList.add('hidden'));
  // las fichas seleccionables flotan suavemente
  addUpdater((dt, t) => {
    if (state !== 'selecting') return;
    for (const m of moves) {
      const isHov = m === hovered;
      const lift = (isHov ? 0.22 : 0.06) + 0.04 * Math.sin(t * 4 + m.from);
      const p = m.piece.position;
      p.y += (BOARD_TOP_Y + lift - p.y) * Math.min(1, dt * 10);

      const marker = pieceMarkers.get(m.piece);
      if (marker) {
        marker.position.y = 1.12 + 0.08 * Math.sin(t * 5 + m.from);
        const s = isHov ? 0.85 : 0.65;
        marker.scale.set(s, s, 1);
      }
    }
  });

  /* ======================================================================
     NUEVA PARTIDA
     ====================================================================== */
  function syncFromPieces() {
    board.fill(0);
    pieceAt.fill(null);
    for (const p of pieces) {
    
      const sq = p.userData.square;
      if (sq) {
        board[sq] = p.userData.player;
        pieceAt[sq] = p;
      }
    }
  }

  function newGame() {
    gameId++;
    sound.init(); 
    sound.playPiecesCascade();
    master?.kill();
    rollTl?.kill();
    tauntTl?.kill();
    tauntHideTween?.kill();
    sound.stopVoice();
    gsap.killTweensOf(rollResultEls);
    sticks.forEach((s) => {
      gsap.killTweensOf([s.position, s.rotation]);
      s.visible = false;
    });
    $('#victory')?.remove();
    tauntTl?.kill();
    gsap.set(tauntEl, { autoAlpha: 0 });
    turnsSinceTaunt = 99;
    controls.autoRotate = false;
    dom.style.cursor = 'default';

    borne[1] = borne[2] = 0;
    board.fill(0);
    pieceAt.fill(null);

    // Marfil en las casillas impares y Ébano en las pares
    const reset = gsap.timeline();
    pieces.forEach((p, i) => {
      gsap.killTweensOf(p.position);
      const sq = p.userData.player === 1 ? p.userData.id * 2 + 1 : p.userData.id * 2 + 2;
      p.userData.square = sq;
      board[sq] = p.userData.player;
      pieceAt[sq] = p;
      
      reset.add(arcMove(p, squareToPosition(sq), { lift: 1.2, duration: 0.8 }), i * 0.05);
    });
    master = reset;

    logEl.innerHTML = '';
    addLog('Comienza una nueva partida. Marfil abre el juego.', 'log-special');
    chips.forEach((c) => c.classList.remove('is-light', 'is-dark', 'is-rolling'));
    setRollResult('–');
    setRollExtra('');

    current = 1;
    startTurn();
  }

  /* ======================================================================
     ARRANQUE
     ====================================================================== */
    const onRollClick = () => {
    if (current === HUMAN && state === 'idle') roll();
  };
  rollBtn.addEventListener('click', onRollClick);
  mRollBtn?.addEventListener('click', onRollClick);
  $('#btn-new-game').addEventListener('click', newGame);
  $('#m-btn-new')?.addEventListener('click', newGame);

  syncFromPieces();
  addLog('Las puertas del Duat se abren. Marfil comienza.', 'log-special');
  startTurn();
}