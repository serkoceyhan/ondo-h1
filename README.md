# Ondo H1 · Interactive 3D Headphone Experience

A scroll-driven product page for a fictional pair of headphones. As you scroll, the Ondo H1 comes apart layer by layer while the camera tours the driver, battery, noise-cancelling board and cushions. The headphones are modelled entirely in code with Three.js — no 3D model files.

## Features

- **Exploded view on scroll:** every section has its own camera angle, focus point and explode amount, blended smoothly as you scroll.
- **Realistic rendering:** procedural studio environment for reflections, physically based materials (clear-coated shell, brushed aluminium, protein leather), soft shadows.
- **Highlighted parts with live labels:** the part being described glows copper and gets a label that follows it in 3D.
- **Drag to rotate, click to jump:** drag the model to any angle; click a part to scroll to its section.
- **Finish picker:** Graphite, Sand and Midnight change the shell and leather in real time.
- **Responsive:** on phones the model sits on top and the text moves into glass panels below.
- **Accessible:** respects `prefers-reduced-motion`, keyboard-friendly navigation, visible focus states.

## Run it

No build step and no internet needed: Three.js is bundled in `js/vendor/`.

- Extract the folder first, then open `index.html` in a browser, or
- In VS Code, install the **Live Server** extension, right-click `index.html` → *Open with Live Server*.

## Project structure

```
ondo-h1/
├── index.html      # Markup and copy
├── css/style.css   # Design tokens, typography, responsive layout
├── js/main.js      # Scene, procedural model, scroll timeline, interactions
└── js/vendor/      # Three.js r128 (MIT licence)
```

## Customise

In `js/main.js`:

- **`K`** — one keyframe per section: explode amount (`e`), orbit angles (`th`, `ph`), distance (`d`), focus (`tx`, `ty`), screen offset (`ox`, `oy`), highlighted part (`hl`).
- **`LABELS`** — text on the floating part labels.
- **`layout(e)`** — how far each part travels when the cup opens.
- **`makeCup(s)`** — ear cup geometry; add or swap parts here.
- **`makeEnvironment()`** — the softboxes that create the reflections.

In `css/style.css`, the `:root` tokens control colours and fonts.

## Deploy with GitHub Pages

1. Push the folder to a GitHub repository.
2. Go to **Settings → Pages**.
3. Set *Source* to the `main` branch and the `/ (root)` folder.
4. After a minute the site is live at `https://<username>.github.io/<repo>/`.

## Built with

HTML · CSS · JavaScript · [Three.js](https://threejs.org/) r128 · WebGL

---

*Ondo is a fictional brand. This project is a 3D web experience concept.*
