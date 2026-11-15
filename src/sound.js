/**
 * Motor de sonido sintetizado (Web Audio API), sin archivos de audio.
 *
 * Cadena de salida:
 *   voz → (paneo) → bus seco ──────────────┐
 *               └→ envío → reverb ─────────┴→ volumen maestro → limitador → altavoces
 *
 * Reglas:
 *  - El navegador bloquea el audio hasta que hay un gesto del usuario. Mientras tanto
 *    los sonidos se DESCARTAN (no se encolan), para que no estallen todos juntos
 *    cuando el contexto por fin arranca.
 *  - Los métodos play*() son síncronos y nunca esperan: o suenan ya, o no suenan.
 *  - El desbloqueo se gestiona aquí mismo (pointerdown, click, touchend, keydown).
 *  - Todos los play*() aceptan { delay, gain, pan }: segundos de retardo, multiplicador
 *    de volumen y paneo estéreo (-1 izquierda … 1 derecha).
 */
const MUTE_KEY = 'senet:muted';
const VOLUME_KEY = 'senet:volume';
const MASTER_GAIN = 0.8; // deja margen antes del limitador

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Variación aleatoria ±amount: ningún golpe suena exactamente igual que el anterior. */
const jitter = (amount = 0.05) => 1 + (Math.random() * 2 - 1) * amount;

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = readStorage(MUTE_KEY) === '1';
    const v = parseFloat(readStorage(VOLUME_KEY));
    this.volume = Number.isFinite(v) ? clamp(v, 0, 1) : 1;
    this._noise = null;
    this._installUnlock();
  }

  /* ----------------------------------------------------------------------
     Contexto y desbloqueo
     ---------------------------------------------------------------------- */

  /** Escucha varios gestos: en iOS, pointerdown solo no basta; touchend/click sí. */
  _installUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = () => this.init();
    for (const type of ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown']) {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    }
  }

  /** Crea el contexto (si falta) y pide reactivarlo. Síncrono: no espera a resume(). */
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this._buildGraph();
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    return this.ctx.state === 'running';
  }

  /** Volumen maestro → limitador → altavoces, más un bus seco y otro de reverb. */
  _buildGraph() {
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = MASTER_GAIN * this.volume;

    // el compresor, con ratio alto y ataque rápido, hace de limitador: evita saturar
    // cuando se solapan muchas voces (16 impactos de tablillas, 10 fichas cayendo…)
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 4;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    this.master.connect(limiter);
    limiter.connect(c.destination);

    this.dry = c.createGain();
    this.dry.connect(this.master);

    // reverb ligera de sala de templo (respuesta al impulso sintética)
    const convolver = c.createConvolver();
    convolver.buffer = this._makeImpulse(1.8, 2.6);
    const wet = c.createGain();
    wet.gain.value = 0.6;
    this.reverbIn = c.createGain();
    this.reverbIn.connect(convolver);
    convolver.connect(wet);
    wet.connect(this.master);
  }

  /** Ruido estéreo con caída exponencial y un filtro suave para que la cola no silbe. */
  _makeImpulse(seconds, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += ((Math.random() * 2 - 1) - lp) * 0.25;
        d[i] = lp * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /** Buffer de ruido blanco, creado una sola vez y reutilizado por todos los golpes. */
  _noiseBuffer() {
    if (!this._noise) {
      const c = this.ctx;
      const len = Math.floor(c.sampleRate * 0.6);
      this._noise = c.createBuffer(1, len, c.sampleRate);
      const d = this._noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this._noise;
  }

  /** ¿Se puede sonar ahora mismo? (sin silencio y con el audio ya desbloqueado) */
  _canPlay() {
    return !this.muted && !!this.ctx && this.ctx.state === 'running';
  }

  _at(delay = 0) {
    return this.ctx.currentTime + delay;
  }

  toggleMute() {
    this.muted = !this.muted;
    writeStorage(MUTE_KEY, this.muted ? '1' : '0');
    if (this.muted) this.stopVoice();
    return !this.muted; // true = suena
  }

  /** Volumen general 0..1 (se guarda). Listo para conectar a un control deslizante. */
  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    writeStorage(VOLUME_KEY, String(this.volume));
    if (this.master) this.master.gain.setTargetAtTime(MASTER_GAIN * this.volume, this.ctx.currentTime, 0.02);
  }

  /* ----------------------------------------------------------------------
     Voces básicas
     ---------------------------------------------------------------------- */

  /** Conecta una voz al bus seco, con paneo opcional y un envío a la reverb. */
  _out(node, { pan = 0, wet = 0 } = {}) {
    const c = this.ctx;
    let tail = node;
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      tail.connect(p);
      tail = p;
    }
    tail.connect(this.dry);
    if (wet > 0) {
      const send = c.createGain();
      send.gain.value = wet;
      tail.connect(send);
      send.connect(this.reverbIn);
    }
  }

  /** Oscilador con caída de tono, ataque corto (sin chasquidos) y filtro paso bajo opcional. */
  _tone({ t, type = 'sine', f0, f1 = f0, dur, vol, attack = 0.004, lowpass = 0, pan = 0, wet = 0 }) {
    const c = this.ctx;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);

    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vol, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    let tail = osc;
    if (lowpass) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      osc.connect(f);
      tail = f;
    }
    tail.connect(env);
    this._out(env, { pan, wet });
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Ráfaga de ruido filtrado (el "crujido" del impacto, soplidos, agua…). */
  _noiseHit({ t, dur, vol, type = 'bandpass', f0, f1 = f0, q = 1, attack = 0.002, pan = 0, wet = 0 }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer();

    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(f1, t + dur);

    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vol, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter);
    filter.connect(env);
    this._out(env, { pan, wet });
    // empieza en un punto aleatorio del buffer: cada golpe suena distinto
    src.start(t, Math.random() * 0.1, dur + 0.02);
  }

  /* ----------------------------------------------------------------------
     Efectos del juego
     ---------------------------------------------------------------------- */

  /** Golpe seco de madera al caer o rebotar una tablilla. */
  playStickClack({ delay = 0, gain = 1, pan = 0 } = {}) {
    if (!this._canPlay()) return;
    const t = this._at(delay);
    // cuerpo de madera (tono grave que cae) + "clic" seco del impacto
    this._tone({
      t,
      type: 'triangle',
      f0: 260 + Math.random() * 90,
      f1: 70 * jitter(0.1),
      dur: 0.09,
      vol: 0.28 * gain,
      attack: 0.005,
      pan,
      wet: 0.08,
    });
    this._noiseHit({ t, dur: 0.03, vol: 0.16 * gain, f0: 2200 * jitter(0.15), q: 1.4, pan, wet: 0.05 });
  }

  /** Ficha que se asienta sobre la mesa (marfil/piedra). pitch < 1 = más grave. */
  playPieceMove({ delay = 0, gain = 1, pan = 0, pitch = 1 } = {}) {
    if (!this._canPlay()) return;
    const t = this._at(delay);
    this._tone({
      t,
      f0: 150 * pitch * jitter(0.04),
      f1: 55 * pitch,
      dur: 0.18,
      vol: 0.36 * gain,
      attack: 0.012,
      pan,
      wet: 0.1,
    });
    this._noiseHit({ t, type: 'lowpass', f0: 1200, dur: 0.05, vol: 0.12 * gain, pan, wet: 0.05 });
  }

  /** Soplido suave al levantar una ficha: da respuesta inmediata al clic. */
  playPieceLift({ delay = 0, gain = 1, pan = 0 } = {}) {
    if (!this._canPlay()) return;
    this._noiseHit({
      t: this._at(delay),
      f0: 450,
      f1: 1300,
      q: 0.9,
      dur: 0.13,
      vol: 0.09 * gain,
      attack: 0.03,
      pan,
      wet: 0.05,
    });
  }

  /** Intercambio/captura: dos notas que caen, con ataque suave y algo de filtro. */
  playSwap({ delay = 0, gain = 1, pan = 0 } = {}) {
    if (!this._canPlay()) return;
    const t = this._at(delay);
    [320, 240].forEach((freq, i) => {
      this._tone({
        t: t + i * 0.09,
        type: 'sawtooth',
        f0: freq * jitter(0.03),
        f1: 90,
        dur: 0.15,
        vol: 0.12 * gain,
        attack: 0.005,
        lowpass: 1400,
        pan,
        wet: 0.12,
      });
    });
  }

  /** Chapoteo al caer en la Casa de las Aguas (27). */
  playWater({ delay = 0, gain = 1, pan = 0 } = {}) {
    if (!this._canPlay()) return;
    const t = this._at(delay);
    this._noiseHit({ t, f0: 900, f1: 220, q: 3.5, dur: 0.45, vol: 0.25 * gain, attack: 0.004, pan, wet: 0.4 });
    this._tone({ t, f0: 520 * jitter(0.05), f1: 170, dur: 0.12, vol: 0.14 * gain, attack: 0.004, pan, wet: 0.4 });
  }

  /** Acorde místico (escala Hijaz) para tiradas extra o victoria del jugador. */
  playMysticChime(isVictory = false, { delay = 0, gain = 1 } = {}) {
    if (!this._canPlay()) return;
    const t = this._at(delay);
    const notes = isVictory ? [293.66, 311.13, 369.99, 440.0, 587.33] : [293.66, 369.99, 440.0];
    notes.forEach((freq, idx) => {
      this._tone({
        t: t + idx * 0.08,
        f0: freq,
        dur: isVictory ? 1.4 : 0.65,
        vol: 0.14 * gain,
        attack: 0.04,
        wet: 0.45,
      });
    });
  }

  /** Derrota: notas descendentes, graves y apagadas (cuando gana Arhestan). */
  playDefeat({ delay = 0, gain = 1 } = {}) {
    if (!this._canPlay()) return;
    const t = this._at(delay);
    const notes = [440.0, 369.99, 311.13, 293.66, 220.0]; // La, Fa#, Mi♭, Re, La grave
    notes.forEach((freq, idx) => {
      const last = idx === notes.length - 1;
      this._tone({
        t: t + idx * 0.22,
        type: 'triangle',
        f0: freq,
        f1: freq * 0.96, // leve caída de tono
        dur: last ? 1.8 : 0.9, // la última nota se alarga y se apaga despacio
        vol: (last ? 0.2 : 0.15) * gain,
        attack: 0.04,
        lowpass: 1800,
        wet: 0.35,
      });
    });
  }
    /** Cascada de fichas que caen sobre el tablero (intro y nueva partida). */
  playPiecesCascade({ delay = 0, gain = 1 } = {}) {
    if (!this._canPlay()) return;
    const t = this._at(delay);
    for (let i = 0; i < 10; i++) {
      this.playPieceMove({
        delay: delay + i * 0.07 + Math.random() * 0.02, // mismo escalonado que la animación (stagger 0.07)
        gain: 0.55 * gain,
        pan: (Math.random() - 0.5) * 0.8,
        pitch: 0.9 + Math.random() * 0.3,
      });
    }
  }
    /* ----------------------------------------------------------------------
     Voz del Faraón (archivos de audio externos)
     ---------------------------------------------------------------------- */

  /**
   * Reproduce un archivo de voz. Corta la voz anterior si seguía sonando.
   * onEnd se llama al terminar (o si falla). Devuelve false si no suena nada
   * (sin url o en silencio), para que quien llama use un temporizador.
   */
  playVoice(url, onEnd) {
    this.stopVoice();
    if (!url || this.muted) return false;

    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = clamp(this.volume, 0, 1);

    const token = {};
    this._voiceToken = token;
    const finish = () => {
      if (this._voiceToken !== token) return; // ya fue reemplazada o detenida
      this._voice = null;
      this._voiceToken = null;
      onEnd?.();
    };
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', finish, { once: true });

    this._voice = audio;
    audio.play().catch(finish); // bloqueado por el navegador o archivo inexistente
    return true;
  }

  stopVoice() {
    if (this._voice) {
      this._voiceToken = null; // evita que dispare onEnd
      this._voice.pause();
      this._voice = null;
    }
  }
}

export const sound = new SoundEngine();