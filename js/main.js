// Ondo H1 — 3D scene, scroll-driven exploded view and interactions (Three.js r128)
(function () {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('scene');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    document.body.classList.add('no-webgl');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0a0a0c, 1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0a0c, 11, 22);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);

  // ---------- Studio environment for realistic reflections ----------
  (function makeEnvironment() {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(24, 14, 24), new THREE.MeshBasicMaterial({ color: 0x101114, side: THREE.BackSide })));
    const softbox = (w, h, pos, intensity, color) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color || 0xffffff).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(pos[0], pos[1], pos[2]);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    softbox(10, 3, [0, 6.5, 1], 1.6);               // overhead strip
    softbox(3, 7, [-10, 1, 4], 1.1);                // left key
    softbox(3, 7, [10, 0.5, -2], 0.9, 0xffd6b0);   // warm right
    softbox(8, 2, [0, -1, -11], 0.8, 0x9db2ff);    // cool back rim
    softbox(6, 2, [2, -6.5, 6], 0.25);               // floor bounce
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.04).texture;
    pmrem.dispose();
  })();

  // ---------- Lights ----------
  const key = new THREE.DirectionalLight(0xfff1e2, 1.9);
  key.position.set(2.5, 7, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
  key.shadow.bias = -0.0006;
  key.shadow.radius = 6;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8aa2ff, 1.0);
  rim.position.set(-6, 3, -5);
  scene.add(rim);
  const fill = new THREE.PointLight(0xd8935c, 0.8, 9);
  fill.position.set(0, -2, 2.5);
  scene.add(fill);

  // ---------- Materials ----------
  const COPPER = new THREE.Color(0xd8935c);
  const std = (color, metalness, roughness, extra) =>
    new THREE.MeshStandardMaterial(Object.assign({ color, metalness, roughness, emissive: COPPER, emissiveIntensity: 0 }, extra || {}));
  const shellMat = new THREE.MeshPhysicalMaterial({ color: 0x2a2c31, metalness: 0.0, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3, side: THREE.DoubleSide });
  const leatherMat = new THREE.MeshPhysicalMaterial({ color: 0x1b1c1f, metalness: 0.0, roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.6, emissive: COPPER, emissiveIntensity: 0 });
  const padMat = new THREE.MeshPhysicalMaterial({ color: 0x1b1c1f, metalness: 0.0, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.6 });
  const aluMat = std(0xbcc1c8, 1, 0.26);
  const copperMat = std(0xd8935c, 1, 0.3);

  function canvasTexture(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  const logoTex = canvasTexture(512, (g, s) => {
    g.strokeStyle = '#d8935c';
    g.lineWidth = 16;
    g.lineCap = 'round';
    g.beginPath();
    for (let x = 0; x <= 300; x += 4) {
      const y = s / 2 - 12 + Math.sin((x / 300) * Math.PI * 3) * 46 * Math.sin((x / 300) * Math.PI);
      x === 0 ? g.moveTo(106 + x, y) : g.lineTo(106 + x, y);
    }
    g.stroke();
    g.fillStyle = 'rgba(241,238,233,.55)';
    g.font = '600 44px sans-serif';
    g.textAlign = 'center';
    g.fillText('H1', s / 2, s / 2 + 110);
  });
  const scrimTex = (letter) => canvasTexture(512, (g, s) => {
    g.fillStyle = '#16171a';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,.045)';
    g.lineWidth = 2;
    for (let i = 0; i < s; i += 7) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke();
    }
    g.fillStyle = 'rgba(241,238,233,.5)';
    g.font = '700 64px sans-serif';
    g.textAlign = 'center';
    g.fillText(letter, s / 2, 120);
  });

  // ---------- Model ----------
  const root = new THREE.Group();
  scene.add(root);
  const parts = { driver: [], battery: [], pcb: [], cushion: [] };
  const anchors = {};
  const pickables = [];
  function tag(obj, part) {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.part = part;
      pickables.push(o);
      if (o.material !== shellMat && !parts[part].includes(o.material)) parts[part].push(o.material);
    });
  }

  // Headband: flattened arch with a leather pad underneath
  const band = new THREE.Group();
  root.add(band);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.075, 24, 120, Math.PI), shellMat);
  arch.scale.z = 2.3;
  band.add(arch);
  [-1, 1].forEach((s) => {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12), shellMat);
    cap.scale.set(1, 0.6, 2.3);
    cap.position.set(1.55 * s, 0, 0);
    band.add(cap);
    const slider = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.1), aluMat);
    slider.position.set(1.55 * s, -0.08, 0);
    band.add(slider);
  });
  const pad = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.06, 18, 90, Math.PI * 0.62), padMat);
  pad.scale.z = 2.0;
  pad.rotation.z = Math.PI * 0.19;
  band.add(pad);

  // Shell profile (radius, depth) revolved into a rounded, hollow ear cup
  const shellProfile = [[0, 0.185], [0.3, 0.183], [0.48, 0.176], [0.6, 0.162], [0.68, 0.138], [0.72, 0.1], [0.735, 0.04], [0.73, -0.04], [0.72, -0.12], [0.705, -0.2], [0.685, -0.245], [0.66, -0.26]]
    .map(([r, h]) => new THREE.Vector2(r, h));
  const shellGeo = new THREE.LatheGeometry(shellProfile, 96);
  shellGeo.rotateX(Math.PI / 2);

  const cups = [];
  function makeCup(s) {
    const g = new THREE.Group();
    g.rotation.y = (s * Math.PI) / 2; // local +z points away from the head
    root.add(g);
    const oval = new THREE.Group();
    oval.scale.y = 1.16;
    g.add(oval);

    // Yoke: aluminium fork around the cup, in the plane of the cup face
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.032, 14, 72, Math.PI), aluMat);

    // Outer shell (carries the yoke with it when the cup opens)
    const shell = new THREE.Group();
    shell.add(yoke);
    [-1, 1].forEach((side) => {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 20), aluMat);
      pin.rotation.z = Math.PI / 2;
      pin.position.set(0.76 * side, 0, 0);
      shell.add(pin);
    });
    shell.add(new THREE.Mesh(shellGeo, shellMat));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.011, 10, 96), copperMat);
    ring.position.z = 0.163;
    shell.add(ring);
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.34, 48), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, depthWrite: false }));
    logo.position.z = 0.1875;
    shell.add(logo);
    oval.add(shell);

    // Inner component: battery on the left, ANC board on the right
    const inner = new THREE.Group();
    if (s < 0) {
      inner.add(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.5, 0.13), std(0x2f3644, 0.3, 0.5)));
      const label = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.132), copperMat);
      label.position.y = 0.12;
      inner.add(label);
      const lead = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.03), std(0xcfd2d6, 1, 0.3));
      lead.position.set(0.48, -0.12, 0);
      inner.add(lead);
      tag(inner, 'battery');
      anchors.battery = inner;
    } else {
      const board = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.035, 64), std(0x113a30, 0.2, 0.55));
      board.rotation.x = Math.PI / 2;
      inner.add(board);
      const chip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.05), std(0x0d0e10, 0.3, 0.35));
      chip.position.z = 0.04;
      inner.add(chip);
      [[-0.3, 0.15, 0.12, 0.1], [0.28, -0.18, 0.16, 0.08], [0.05, -0.36, 0.1, 0.1], [-0.22, -0.24, 0.08, 0.14]].forEach(([x, y, w, h]) => {
        const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.035), std(0x1a1c20, 0.3, 0.45));
        c.position.set(x, y, 0.035);
        inner.add(c);
      });
      const trace = std(0xdfa86f, 1, 0.3);
      [[0, 0.24, 0.02, 0.22], [0.24, 0, 0.22, 0.02], [-0.2, 0.02, 0.16, 0.02], [0.12, -0.25, 0.02, 0.18]].forEach(([x, y, w, h]) => {
        const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), trace);
        t.position.set(x, y, 0.021);
        inner.add(t);
      });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 14), std(0xcfd2d6, 1, 0.3));
        mic.rotation.x = Math.PI / 2;
        mic.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.03);
        inner.add(mic);
      }
      tag(inner, 'pcb');
      anchors.pcb = inner;
    }
    oval.add(inner);

    // Driver with its baffle ring
    const driver = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.56, 0.16, 64, 1, true), std(0x3b3f47, 0.35, 0.42, { side: THREE.DoubleSide }));
    cone.rotation.x = Math.PI / 2;
    driver.add(cone);
    const baffle = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 72), std(0x1d1f23, 0.2, 0.7, { side: THREE.DoubleSide }));
    baffle.position.z = -0.082;
    driver.add(baffle);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.565, 0.022, 12, 72), std(0x9298a1, 1, 0.3));
    frame.position.z = -0.08;
    driver.add(frame);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), std(0xc3c8cf, 1, 0.18));
    dome.rotation.x = -Math.PI / 2;
    dome.position.z = 0.02;
    driver.add(dome);
    const magnet = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.14, 48), std(0xa9afb8, 1, 0.22));
    magnet.rotation.x = Math.PI / 2;
    magnet.position.z = 0.15;
    driver.add(magnet);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.038, 16, 56), std(0xc8743a, 1, 0.26));
    coil.position.z = 0.08;
    driver.add(coil);
    oval.add(driver);
    tag(driver, 'driver');
    if (s > 0) anchors.driver = driver;

    // Cushion: plush leather ring with a fabric scrim marked L / R
    const cushion = new THREE.Group();
    const foam = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.17, 32, 112), leatherMat);
    foam.scale.z = 0.78;
    cushion.add(foam);
    const scrim = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), new THREE.MeshStandardMaterial({ map: scrimTex(s < 0 ? 'L' : 'R'), roughness: 1, metalness: 0, emissive: COPPER, emissiveIntensity: 0 }));
    scrim.position.z = 0.05;
    scrim.rotation.y = Math.PI; // faces the ear
    cushion.add(scrim);
    const backing = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), std(0x141518, 0, 1));
    backing.position.z = 0.045;
    cushion.add(backing);
    oval.add(cushion);
    tag(cushion, 'cushion');
    if (s < 0) anchors.cushion = cushion;

    cups.push({ s, g, shell, inner, driver, cushion });
  }
  makeCup(-1);
  makeCup(1);

  root.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });

  function layout(e) {
    band.position.y = 0.55 * e;
    cups.forEach((c) => {
      c.g.position.set((1.43 + 0.35 * e) * c.s, -1.05, 0);
      c.shell.position.z = 0.12 + 1.4 * e;
      c.inner.position.z = 0.06 + 0.72 * e;
      c.driver.position.z = -0.1 - 0.3 * e;
      c.cushion.position.z = -0.27 - 1.1 * e;
    });
  }

  // ---------- Floor: soft shadow and a warm glow ----------
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.ShadowMaterial({ opacity: 0.45 }));
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.y = -2.3;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);
  const glowTex = canvasTexture(256, (g) => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(216,147,92,0.35)');
    gr.addColorStop(0.45, 'rgba(216,147,92,0.07)');
    gr.addColorStop(1, 'rgba(216,147,92,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  });
  const glowFloor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glowFloor.rotation.x = -Math.PI / 2;
  glowFloor.position.y = -2.31;
  scene.add(glowFloor);

  // Floating dust
  const N = 380;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 16;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 9;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x8a8f99, size: 0.02, transparent: true, opacity: 0.45, depthWrite: false }));
  scene.add(dust);

  // ---------- Story keyframes (one per section) ----------
  // e: explode 0-1 · th/ph: orbit angles · d: distance · tx/ty: focus · ox/oy: screen shift · hl: highlighted part · vl/vr/vt: text veils
  const K = [
    { e: 0,   th: 0.45, ph: 0.14, d: 8.6, tx: 0,    ty: 0,     ox: 0,     oy: -0.17, hl: null,      vl: 0, vr: 0, vt: 1 },
    { e: 1,   th: 0.65, ph: 0.1,  d: 6.4, tx: 1.75, ty: -0.35, ox: -0.2,  oy: 0,     hl: 'driver',  vl: 1, vr: 0, vt: 0 },
    { e: 1,   th: -0.6, ph: 0.2,  d: 6.2, tx: -1.9, ty: -0.35, ox: 0.2,   oy: 0,     hl: 'battery', vl: 0, vr: 1, vt: 0 },
    { e: 1,   th: 0.55, ph: 0.34, d: 6.0, tx: 1.9,  ty: -0.35, ox: -0.2,  oy: 0,     hl: 'pcb',     vl: 1, vr: 0, vt: 0 },
    { e: 0.7, th: -0.45,ph: 0.06, d: 6.8, tx: -1.3, ty: -0.35, ox: 0.2,   oy: 0,     hl: 'cushion', vl: 0, vr: 1, vt: 0 },
    { e: 0,   th: 0.35, ph: 0.2,  d: 7.8, tx: 0,    ty: 0,     ox: -0.2,  oy: 0,     hl: null,      vl: 1, vr: 0, vt: 0 }
  ];
  const FIELDS = ['e', 'th', 'ph', 'd', 'tx', 'ty', 'ox', 'oy', 'vl', 'vr', 'vt'];
  const LABELS = { driver: 'Driver · 40 mm', battery: 'Battery · 1000 mAh', pcb: 'ANC board · 8 mics', cushion: 'Cushion · memory foam' };

  const sections = Array.from(document.querySelectorAll('main section'));
  const go = (sec) => sec.scrollIntoView({ behavior: RM ? 'auto' : 'smooth' });
  const nav = document.getElementById('links');
  const links = sections.map((sec, i) => {
    if (i === 0) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = sec.dataset.label;
    b.addEventListener('click', () => go(sec));
    nav.appendChild(b);
    return b;
  });
  document.getElementById('ctaTop').addEventListener('click', () => go(sections[sections.length - 1]));

  function scrollState() {
    const v = innerHeight / 2;
    const c = sections.map((s) => { const r = s.getBoundingClientRect(); return r.top + r.height / 2; });
    if (v <= c[0]) return { i: 0, t: 0 };
    for (let i = 0; i < c.length - 1; i++) if (v < c[i + 1]) return { i, t: (v - c[i]) / (c[i + 1] - c[i]) };
    return { i: c.length - 1, t: 0 };
  }
  const ease = (t) => t * t * (3 - 2 * t);

  // ---------- Interaction ----------
  let nx = 0, ny = 0, dragTh = 0, dragPh = 0, dragging = false, down = null, lastX = 0, lastY = 0;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hit(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(pickables, false)[0];
    return h ? h.object.userData.part : null;
  }
  canvas.addEventListener('pointermove', (ev) => {
    nx = (ev.clientX / innerWidth) * 2 - 1;
    ny = (ev.clientY / innerHeight) * 2 - 1;
    if (dragging) {
      dragTh -= (ev.clientX - lastX) * 0.008;
      dragPh = Math.max(-0.4, Math.min(0.5, dragPh + (ev.clientY - lastY) * 0.004));
      lastX = ev.clientX;
      lastY = ev.clientY;
    } else if (ev.pointerType === 'mouse') {
      canvas.classList.toggle('pointing', !!hit(ev));
    }
  });
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    dragging = true;
    down = { x: ev.clientX, y: ev.clientY };
    lastX = ev.clientX;
    lastY = ev.clientY;
    canvas.classList.add('grabbing');
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointerup', (ev) => {
    const wasClick = !down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 5;
    dragging = false;
    down = null;
    canvas.classList.remove('grabbing');
    if (!wasClick) return;
    const p = hit(ev);
    const sec = p && sections.find((s) => s.dataset.part === p);
    if (sec) go(sec);
  });

  // Finish picker
  const swatches = Array.from(document.querySelectorAll('.swatch'));
  swatches.forEach((b) => b.addEventListener('click', () => {
    shellMat.color.set(b.dataset.shell);
    leatherMat.color.set(b.dataset.leather);
    padMat.color.set(b.dataset.leather);
    swatches.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  // ---------- Resize ----------
  let mobile = false;
  function resize() {
    mobile = innerWidth <= 760;
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = mobile ? 46 : 32;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ---------- Render loop ----------
  const cur = Object.assign({}, K[0], { w: { driver: 0, battery: 0, pcb: 0, cushion: 0 } });
  const target = new THREE.Vector3();
  const wp = new THREE.Vector3();
  const callout = document.getElementById('callout');
  const calloutText = document.getElementById('calloutText');
  const veilL = document.getElementById('veilL'), veilR = document.getElementById('veilR'), veilT = document.getElementById('veilT');
  const bar = document.getElementById('progress');
  const clock = new THREE.Clock();
  let active = -1;
  let lastTime = 0;

  function frame() {
    const time = clock.getElapsedTime();
    const dt = Math.min(0.1, time - lastTime);
    lastTime = time;
    const fr = (rate) => (RM ? 1 : 1 - Math.pow(1 - rate, dt * 60)); // frame-rate independent easing
    const { i, t } = scrollState();
    const a = K[i], b = K[Math.min(i + 1, K.length - 1)], k = ease(t);
    const L = fr(0.075);
    FIELDS.forEach((f) => { cur[f] += (a[f] + (b[f] - a[f]) * k - cur[f]) * L; });
    for (const p in cur.w) {
      const goal = (a.hl === p ? 1 - k : 0) + (b.hl === p ? k : 0);
      cur.w[p] += (goal - cur.w[p]) * fr(0.1);
      parts[p].forEach((m) => { m.emissiveIntensity = cur.w[p] * 0.3; });
    }

    const di = Math.round(i + t);
    if (di !== active) {
      active = di;
      links.forEach((l, j) => l && l.setAttribute('aria-current', String(j === di)));
    }
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;

    if (mobile) {
      veilL.style.opacity = Math.max(cur.vl, cur.vr);
      veilR.style.opacity = 0;
    } else {
      veilL.style.opacity = cur.vl;
      veilR.style.opacity = cur.vr;
    }
    veilT.style.opacity = cur.vt;

    layout(cur.e);
    if (!dragging) { const d = 1 - fr(0.05); dragTh *= d; dragPh *= d; }

    const aspectFit = mobile ? 1.25 : Math.min(1.5, Math.max(1, 1.75 / camera.aspect));
    const dist = cur.d * aspectFit;
    const th = cur.th + dragTh + (window.__spin || 0) + (RM ? 0 : nx * 0.1 + Math.sin(time * 0.25) * 0.05);
    const ph = cur.ph + dragPh + (RM ? 0 : ny * 0.05);
    target.set(mobile ? cur.tx * 0.6 : cur.tx, -0.4 + cur.ty, 0);
    camera.position.set(
      target.x + dist * Math.sin(th) * Math.cos(ph),
      target.y + dist * Math.sin(ph),
      target.z + dist * Math.cos(th) * Math.cos(ph)
    );
    camera.lookAt(target);
    const ox = mobile ? 0 : cur.ox;
    const oy = mobile ? (cur.vt > 0.5 ? -0.1 : 0.17) : cur.oy;
    camera.setViewOffset(innerWidth, innerHeight, ox * innerWidth, oy * innerHeight, innerWidth, innerHeight);

    if (!RM) {
      root.position.y = Math.sin(time * 0.8) * 0.035;
      dust.rotation.y = time * 0.02;
    }

    // Floating label on the highlighted part
    let best = null, bw = 0;
    for (const p in cur.w) if (cur.w[p] > bw) { bw = cur.w[p]; best = p; }
    if (best && bw > 0.04) {
      anchors[best].getWorldPosition(wp).project(camera);
      const x = ((wp.x + 1) / 2) * innerWidth, y = ((1 - wp.y) / 2) * innerHeight;
      calloutText.textContent = LABELS[best];
      callout.classList.toggle('flip', x > innerWidth * 0.62);
      callout.style.transform = `translate(${x}px,${y}px)`;
      callout.style.opacity = Math.min(1, bw * 1.2);
    } else {
      callout.style.opacity = 0;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
