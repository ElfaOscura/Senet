<div align="center">

# ☥ SENET · El Juego de los Pasajes

**Una recreación interactiva en 3D del antiguo juego de mesa egipcio, ambientada en el viaje del alma a través del Duat.**

[![Jugar ahora](https://img.shields.io/badge/▶_JUGAR_AHORA-D4AF37?style=for-the-badge&logoColor=black)](https://elfaoscura.github.io/Senet/)

[![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![GSAP](https://img.shields.io/badge/GSAP-88CE02?style=for-the-badge&logo=greensock&logoColor=black)](https://greensock.com/gsap/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

</div>

---

## 🏺 Sobre el proyecto

Senet es uno de los juegos de mesa más antiguos que se conocen: se jugaba en el Antiguo Egipto hace más de 5000 años y representaba el viaje del alma hacia la vida eterna. En esta versión te enfrentas al **Faraón Arhestan I**, un bot con personalidad que celebra sus ventajas y se burla de tus errores, sobre un tablero de granito, mármol y oro iluminado por antorchas.

Todo el escenario, las texturas y los efectos de sonido se generan en el propio navegador: **no hay modelos 3D, imágenes ni archivos de audio pesados**. La única excepción son las voces del Faraón, que son opcionales (ver [Voces del Faraón](#-voces-del-faraón)).

---

## ✨ Características

- **Escenario 3D procedural (Three.js):** tablero de granito negro pulido, mármol veteado, arena del desierto con relieve y antorchas con luz parpadeante.
- **Tablillas 3D con física:** las cuatro tablillas se lanzan sobre la arena, rebotan y dan el resultado de la tirada.
- **Personalización de fichas:** cambia en tiempo real el diseño de las fichas de Marfil entre *Carrete Clásico*, *Cilindro Anillado* y *Cono Faraónico* (`LatheGeometry`, con detalles en oro).
- **Motor de audio procedural (Web Audio API):** impactos de madera, fichas que caen en cascada, chapoteos y acordes en escala Hijaz, todo sintetizado en tiempo real, con reverberación de sala de templo.
- **Bot con personalidad:** el Faraón Arhestan I juega con una heurística propia y comenta la partida con 20 frases según vaya ganando o perdiendo.
- **Voces opcionales:** cada frase del Faraón puede tener su propio archivo de audio, que suena a la vez que aparece el texto.
- **Interfaz adaptativa (glassmorphism):**
  - **Escritorio:** paneles laterales con jugadores y turno, tablillas, crónica de la partida, papiro de reglas e indicadores jeroglíficos (`𓂻`) sobre las fichas jugables.
  - **Móvil:** HUD propio: barra superior con jugadores y puntuación, tablillas y resultado en la esquina, frases del Faraón arriba al centro y barra inferior flotante con sonido, diseño de ficha, lanzar tablillas y nueva partida.
- **Tooltips informativos** sobre las casillas sagradas.
- **Sonido con interruptor** que recuerda tu preferencia entre sesiones.

---

## 🎮 Cómo se juega

### Controles

| Acción | Escritorio | Móvil |
| --- | --- | --- |
| Girar la cámara | Arrastrar con el ratón | Arrastrar con un dedo |
| Zoom | Rueda del ratón | Pellizcar |
| Mover una ficha | Clic en una ficha resaltada | Toque en una ficha resaltada |
| Ver info de una casilla sagrada | Pasar el cursor | — |

### Reglas rápidas

1. **Objetivo:** ser el primero en sacar tus **5 fichas** del tablero recorriendo las 30 casillas en forma de serpiente.
2. **Las tablillas:** se lanzan 4 tablillas de doble cara. Las caras claras indican el avance (`1`, `2`, `3` o `4`), y si todas caen oscuras, avanzas `5`. Sacar `1`, `4` o `5` otorga **tirada extra**.
3. **Intercambios:** si caes sobre una ficha rival aislada, intercambian posiciones.
4. **Protección y bloqueos:** dos fichas del mismo color juntas están protegidas. Tres o más seguidas forman un bloqueo que no se puede saltar.
5. **Casillas sagradas:** las fichas en las casillas 26, 28, 29 y 30 no pueden ser desplazadas.
6. **Sin movimientos:** si no tienes ninguna jugada legal, pierdes el turno.

### Casillas especiales

| Casilla | Nombre | Efecto |
| :---: | --- | --- |
| 15 | Casa del Renacimiento ☥ | A ella vuelven las fichas que caen en las aguas. |
| 26 | Casa de la Felicidad | Parada obligatoria. Se sale con un `5` exacto. |
| 27 | Casa de las Aguas | Trampa: devuelve la ficha a la casilla 15 (o a la primera libre anterior). |
| 28 | Casa de las Tres Verdades | Casilla segura. Se sale con un `3` exacto. |
| 29 | Casa de Re-Atum | Casilla segura. Se sale con un `2` exacto. |
| 30 | Casa de Horus | Casilla segura. Se sale con un `1` exacto. |

> Las reglas originales del Senet se perdieron con el tiempo. Esta versión sigue la reconstrucción más aceptada por los egiptólogos modernos.

---

## 🚀 Instalación y uso local

Necesitas [Node.js](https://nodejs.org/) 18 o superior.

```bash
# 1. Clona el repositorio
git clone https://github.com/ElfaOscura/Senet.git
cd Senet

# 2. Instala las dependencias
npm install

# 3. Inicia el servidor de desarrollo
npm run dev

# 4. Compila para producción (genera la carpeta dist/)
npm run build

# 5. (Opcional) Previsualiza la versión compilada
npm run preview
```

---

## 🎙️ Voces del Faraón

Cada frase del Faraón puede reproducir un archivo de audio al mismo tiempo que se muestra el texto. Mientras no haya archivos, el juego funciona igual, solo con texto.

**1. Guarda los audios** en `public/audio/faraon/` con este formato:

```
public/audio/faraon/
  ahead-01.mp3  …  ahead-10.mp3     (cuando el Faraón va ganando)
  behind-01.mp3 …  behind-10.mp3    (cuando va perdiendo)
```

**2. Indica cuántos hay listos** en `src/game.js`:

```js
const VOICES_READY = { ahead: 10, behind: 10 };
```

Si solo tienes los primeros, pon la cantidad que haya (por ejemplo `ahead: 4`): esas sonarán y las demás saldrán solo con texto.

El número de cada archivo es la posición de la frase en la lista (`TAUNTS` en `src/game.js`). **No reordenes ni borres frases después de grabar**; si quieres añadir más, ponlas al final.

<details>
<summary><b>Guion para el actor de voz (20 frases)</b></summary>

**Cuando el Faraón va ganando** (`ahead`)

| Archivo | Frase |
| --- | --- |
| `ahead-01.mp3` | Juegas con la elegancia de un camello. |
| `ahead-02.mp3` | Hasta las momias se mueven con más gracia que tú. |
| `ahead-03.mp3` | El Nilo corre a mi favor, mortal. |
| `ahead-04.mp3` | Observa y aprende, aprendiz de escriba. |
| `ahead-05.mp3` | Mi sombra juega mejor que tú. |
| `ahead-06.mp3` | Qué encantadora torpeza. Continúa, me divierte. |
| `ahead-07.mp3` | Ra en persona aplaudiría esta jugada. |
| `ahead-08.mp3` | Incluso un escarabajo calcularía mejor sus pasos. |
| `ahead-09.mp3` | Esta partida ya está escrita en mi sarcófago. |
| `ahead-10.mp3` | Los dioses sonríen... a mí, por supuesto. |

**Cuando el Faraón va perdiendo** (`behind`)

| Archivo | Frase |
| --- | --- |
| `behind-01.mp3` | Tu suerte es tan breve como la lluvia en el Sahara. |
| `behind-02.mp3` | Disfruta este instante, plebeyo: la arena siempre regresa a su dueño. |
| `behind-03.mp3` | Un golpe de fortuna no convierte a un campesino en faraón. |
| `behind-04.mp3` | Hasta Anubis bosteza ante tu estrategia. |
| `behind-05.mp3` | Qué audacia la tuya, con tan poco linaje. |
| `behind-06.mp3` | Ni los chacales del desierto celebrarían esa jugada. |
| `behind-07.mp3` | Los dioses cobran con intereses, mortal. Ya lo verás. |
| `behind-08.mp3` | Te perdono la insolencia: la ignorancia también es una forma de inocencia. |
| `behind-09.mp3` | Presumes como un escriba que acaba de aprender a contar. |
| `behind-10.mp3` | Tu victoria es como tu sombra: pasajera y sin sustancia. |

</details>

---


## 🛠️ Tecnologías

- **Vite**: empaquetador y entorno de desarrollo.
- **Three.js**: renderizado WebGL, materiales PBR, sombras suaves y geometrías procedurales.
- **GSAP**: cámara, arcos de movimiento de fichas, lanzamiento de tablillas y transiciones de interfaz.
- **Tailwind CSS v4**: estilos, diseño responsivo y efectos *glassmorphism*.
- **Web Audio API**: síntesis de audio en tiempo real.
- **Particles.js** (CDN): polvo flotante ambiental.

---

## ☕ Apoya el proyecto

Si te gustó este juego o te resultó útil el código, puedes invitarme un café para seguir creando proyectos interactivos:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/elfaoscura)

---

<div align="center">

*Hecho con 💛 y sabiduría antigua por [ElfaOscura](https://github.com/ElfaOscura).*

</div>