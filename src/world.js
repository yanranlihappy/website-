import * as THREE from '../vendor/three.module.min.js';

// World layout: one main street running east–west (z ≈ 0), beach + ocean to the west.
// North of the street is -z, south is +z. Buildings alternate sides in visiting order.
// Every building is walk-in: when the player comes close, the roof lifts off and the
// walls drop to a stub so the interior shows (Sims-style cutaway).

const C = {
  sand: 0xf1d2a6,
  sandWet: 0xdcb48a,
  grass: 0x9cc96f,
  road: 0x6f5b75,
  roadLine: 0xf8e6c4,
  sidewalk: 0xedd3c3,
  curb: 0xd9b8b0,
  window: 0xaef0f7,
  leaf: 0x3fae5a,
  leafDark: 0x2e8c48,
  trunk: 0x9a6b45,
  white: 0xfbf6ee,
  ink: 0x2b2430,
  wood: 0x9a6b45,
};

const BOX = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();
function mat(color, emissive = 0) {
  const key = `${color}:${emissive}`;
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshLambertMaterial({ color, emissive, flatShading: true }));
  }
  return mats.get(key);
}
const glass = new THREE.MeshLambertMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.4 });

// Box with its base at y. Returns the mesh.
function box(parent, w, h, d, color, x, y, z, { emissive = 0, ry = 0, shadow = true } = {}) {
  const m = new THREE.Mesh(BOX, mat(color, emissive));
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = ry;
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cyl(parent, rTop, rBot, h, color, x, y, z, { seg = 8, shadow = true, emissive = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(color, emissive));
  m.position.set(x, y + h / 2, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function ball(parent, r, color, x, y, z, { detail = 0, emissive = 0, shadow = true } = {}) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat(color, emissive));
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function flat(parent, w, d, color, x, z, y = 0.01, emissive = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, emissive));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Storefront signs: text drawn to a canvas, then pixelated by the low-res render like everything else.
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';
const SIGNS = {
  home: { text: 'Happy’s', font: `italic 700 {px} ${SERIF}`, band: 0xc7655a },
  tiktok: { text: 'TikTok', font: `800 {px} ${SANS}`, band: 0x15121f, glitch: true },
  splunk: { text: 'splunk>', font: `700 {px} ${SANS}`, band: 0x232a36 },
  sap: { text: 'SAP Labs', font: `800 {px} ${SANS}`, band: 0x2f6fd8 },
  wiley: { text: 'WILEY', font: `700 {px} ${SERIF}`, band: 0x2f6b4a },
  bloomberg: { text: 'Bloomberg', font: `700 {px} ${SANS}`, band: 0x111111 },
  klook: { text: 'klook', font: `800 {px} ${SANS}`, band: 0xff5b00 },
  cornellgo: { text: 'Cornell Go', font: `700 {px} ${SERIF}`, band: 0x7a1010 },
  catacombs: { text: 'CATACOMBS', font: `700 {px} ${SERIF}`, band: 0x3a2a1a, fg: '#ffd25e' },
  viggle: { text: 'viggle', font: `800 {px} ${SANS}`, band: 0xd85a8c },
  gallery: { text: 'GALLERY', font: `700 {px} ${SERIF}`, band: 0xb08860 },
};
const signDrawers = [];
function signMesh(sign, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * h) / w);
  const tex = new THREE.CanvasTexture(canvas);
  const draw = () => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let px = Math.round(canvas.height * 0.72);
    const font = () => sign.font.replace('{px}', `${px}px`);
    ctx.font = font();
    while (ctx.measureText(sign.text).width > canvas.width * 0.92 && px > 8) ctx.font = font(--px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 + px * 0.04;
    if (sign.glitch) {
      ctx.fillStyle = '#25f4ee';
      ctx.fillText(sign.text, cx - 5, cy - 3);
      ctx.fillStyle = '#fe2c55';
      ctx.fillText(sign.text, cx + 5, cy + 3);
    }
    ctx.fillStyle = sign.fg ?? '#ffffff';
    ctx.fillText(sign.text, cx, cy);
    tex.needsUpdate = true;
  };
  draw();
  signDrawers.push(draw);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return m;
}
document.fonts?.ready.then(() => signDrawers.forEach((d) => d()));

// Deterministic randomness so the world looks the same on every visit.
function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function buildWorld(scene) {
  const colliders = [];
  const clickables = [];
  const buildings = {};
  const animated = [];
  const root = new THREE.Group();
  scene.add(root);
  const r = rng(7);

  const addCollider = (x, z, w, d, pad = 0.1) =>
    colliders.push({ minX: x - w / 2 - pad, maxX: x + w / 2 + pad, minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad });

  const STREET_END = 76;

  // ---------- ground ----------
  flat(root, 400, 400, C.sand, 60, 0, 0);
  flat(root, 4, 120, C.sandWet, -29.5, 0, 0.005);
  flat(root, 106, 16, C.grass, 31, -22, 0.008);
  flat(root, 106, 16, C.grass, 31, 22, 0.008);
  flat(root, 20, 60, C.grass, 92, 0, 0.008);

  // street + sidewalks
  const len = STREET_END + 24;
  const mid = (STREET_END - 24) / 2;
  flat(root, len, 6, C.road, mid, 0, 0.02);
  flat(root, len + 2, 2, C.sidewalk, mid, -4, 0.025);
  flat(root, len + 2, 2, C.sidewalk, mid, 4, 0.025);
  flat(root, len + 2, 0.25, C.curb, mid, -3.05, 0.03);
  flat(root, len + 2, 0.25, C.curb, mid, 3.05, 0.03);
  for (let x = -22; x < STREET_END; x += 4) flat(root, 1.8, 0.22, C.roadLine, x, 0, 0.03);
  for (const cx of [9, 30, 47]) for (let i = 0; i < 5; i++) flat(root, 0.7, 5.4, C.roadLine, cx - 1.6 + i * 0.8, 0, 0.031);
  // beach boardwalk joining the street to the sand
  flat(root, 6, 6, 0xc9a07a, -27, 0, 0.022);
  for (let x = -29.6; x < -24; x += 0.7) flat(root, 0.08, 6, 0xa98260, x, 0, 0.026);

  // ---------- ocean ----------
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vW = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vW;
      void main() {
        float shore = -30.0 + sin(vW.z * 0.35 + uTime * 0.8) * 0.5 + sin(vW.z * 0.9 - uTime * 0.5) * 0.25;
        float dist = shore - vW.x;
        if (dist < 0.0) discard;
        vec3 shallow = vec3(0.99, 0.55, 0.74);
        vec3 deep = vec3(0.80, 0.27, 0.66);
        vec3 col = mix(shallow, deep, smoothstep(0.0, 16.0, dist));
        float band = sin(dist * 1.4 - uTime * 1.4 + sin(vW.z * 0.18) * 2.0);
        col += step(0.94, band) * 0.07;
        float foam = 1.0 - smoothstep(0.0, 0.8, dist);
        col = mix(col, vec3(1.0, 0.93, 0.93), foam * 0.9);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(200, 400), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-128, 0.04, 0);
  root.add(ocean);
  animated.push((t) => (oceanMat.uniforms.uTime.value = t));

  // ---------- walk-in buildings ----------
  const T = 0.3; // wall thickness
  const GAP = 2.4; // door opening
  const STUB = 0.14; // wall height factor when cut away

  function building(id, { x, w, d, h, color, roof, floor, facing, trim = C.white }) {
    const z = facing > 0 ? -5 - d / 2 - 1 : 5 + d / 2 + 1;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    const walls = new THREE.Group();
    const facade = new THREE.Group();
    const upper = new THREE.Group();
    const interior = new THREE.Group();
    interior.visible = false;
    g.add(walls, facade, upper, interior);
    // zf runs from the back wall (-d/2) to the front/door wall (+d/2), whichever way the building faces
    const Z = (zf) => zf * facing;
    const front = Z(d / 2);

    flat(interior, w - T * 2, d - T * 2, floor, 0, 0, 0.04);
    const side = (w - GAP) / 2;
    const wallPieces = [
      [w, T, 0, Z(-d / 2 + T / 2)],
      [T, d, -w / 2 + T / 2, 0],
      [T, d, w / 2 - T / 2, 0],
      [side, T, -w / 2 + side / 2, Z(d / 2 - T / 2)],
      [side, T, w / 2 - side / 2, Z(d / 2 - T / 2)],
    ];
    for (const [ww, dd, lx, lz] of wallPieces) {
      const m = box(walls, ww, h, dd, color, lx, 0, lz);
      m.userData.building = id;
      clickables.push(m);
      addCollider(x + lx, z + lz, ww, dd, 0.05);
    }
    box(facade, GAP, h - 2.5, T, color, 0, 2.5, Z(d / 2 - T / 2));
    box(facade, GAP + 0.5, 0.25, 0.6, trim, 0, 2.5, front + facing * 0.15);

    // windows on every outside face except the door wall's center
    const floors = Math.max(1, Math.floor((h - 0.6) / 2.6));
    const cols = Math.max(1, Math.floor(w / 2.2));
    const sc = Math.max(1, Math.floor(d / 2.4));
    for (let f = 0; f < floors; f++) {
      const y = 1.0 + f * 2.6;
      for (let c = 0; c < cols; c++) {
        const wx = -w / 2 + (w / cols) * (c + 0.5);
        if (!(f === 0 && Math.abs(wx) < 1.9)) box(facade, 1.1, 1.2, 0.1, C.window, wx, y, front + facing * 0.05, { emissive: 0x2a5a66, shadow: false });
        box(facade, 1.1, 1.2, 0.1, C.window, wx, y, -front - facing * 0.05, { emissive: 0x2a5a66, shadow: false });
      }
      for (let c = 0; c < sc; c++) {
        const wz = -d / 2 + (d / sc) * (c + 0.5);
        for (const sx of [-1, 1]) box(facade, 0.1, 1.2, 1.1, C.window, sx * (w / 2 + 0.05), y, wz, { emissive: 0x2a5a66, shadow: false });
      }
    }

    // storefront sign on the side the angled cameras look at (+z)
    const sign = SIGNS[id];
    if (sign) {
      const bandH = 1.3;
      const y = h - bandH - 0.2;
      box(facade, w + 0.02, bandH, 0.1, sign.band, 0, y, d / 2 + 0.05, { shadow: false });
      const m = signMesh(sign, Math.min(w - 1, 7), bandH * 0.85);
      m.position.set(0, y + bandH / 2, d / 2 + 0.11);
      facade.add(m);
    }

    // roof with parapet and a few details for the top-down view
    box(upper, w + 0.4, 0.35, d + 0.4, roof, 0, h, 0);
    for (const [px, pz, pw, pd] of [[0, -d / 2, w + 0.4, 0.3], [0, d / 2, w + 0.4, 0.3], [-w / 2, 0, 0.3, d + 0.4], [w / 2, 0, 0.3, d + 0.4]])
      box(upper, pw, 0.3, pd, roof, px, h + 0.35, pz, { shadow: false });
    flat(g, GAP, 1.2, C.sidewalk, 0, front + facing * 0.6, 0.035);

    const b = {
      id, x, z, w, d, h, facing, front, Z, walls, facade, upper, interior,
      reveal: 0,
      door: new THREE.Vector3(x, 0, z + front + facing * 1.4),
      inside: new THREE.Vector3(x, 0, z + Z(d / 2 - 2.0)),
      anchor: new THREE.Vector3(x, h + 1.6, z),
      // interior helpers in (x, zf) coordinates
      ib: (bw, bh, bd, color, lx, y, zf, o = {}) => box(interior, bw, bh, bd, color, lx, y, Z(zf), { shadow: false, ...o }),
      icyl: (rt, rb, ch, color, lx, y, zf, o = {}) => cyl(interior, rt, rb, ch, color, lx, y, Z(zf), { shadow: false, ...o }),
      iball: (rad, color, lx, y, zf, o = {}) => ball(interior, rad, color, lx, y, Z(zf), { shadow: false, ...o }),
      solid: (lx, zf, sw, sd) => addCollider(x + lx, z + Z(zf), sw, sd, 0.05),
    };
    buildings[id] = b;
    return b;
  }

  // a chair: seat + back, back toward -zf unless flipped
  const chair = (b, lx, zf, color, flip = 1) => {
    b.ib(0.55, 0.45, 0.55, color, lx, 0, zf);
    b.ib(0.55, 0.6, 0.12, color, lx, 0.45, zf - flip * 0.22);
  };
  const plant = (b, lx, zf, s = 1) => {
    b.icyl(0.28 * s, 0.22 * s, 0.45 * s, 0xd2785a, lx, 0, zf);
    b.iball(0.45 * s, C.leaf, lx, 0.8 * s, zf);
  };
  const desk = (b, lx, zf, top = C.white, screen = 0x7fd6ee) => {
    b.ib(1.8, 0.75, 0.9, top, lx, 0, zf);
    b.ib(0.9, 0.6, 0.08, C.ink, lx, 0.75, zf - 0.2);
    b.ib(0.8, 0.5, 0.02, screen, lx, 0.8, zf - 0.15, { emissive: 0x3a6a7a });
    b.solid(lx, zf, 1.8, 0.9);
  };

  // ===== Home — About =====
  {
    const b = building('home', { x: -14, w: 10, d: 8, h: 4.5, color: 0xf9b7a0, roof: 0xe07a6a, floor: 0xd9a877, facing: 1 });
    box(b.upper, 0.8, 1.6, 0.8, 0xc7655a, 2.6, 4.6, -1.5);
    flat(root, 6, 3.4, 0x6fe0f0, -14, -18.5, 0.03);
    flat(root, 6.8, 4.2, C.white, -14, -18.5, 0.02);
    for (const sx of [-3, 3]) {
      box(b.facade, 1.6, 0.4, 0.8, 0x6b8f3e, sx, 0, b.front + 0.6);
      for (let i = 0; i < 4; i++) box(b.facade, 0.22, 0.22, 0.22, [0xff5d7a, 0xffd25e, 0xff8fd0, 0xffffff][i], sx - 0.55 + i * 0.37, 0.4, b.front + 0.6, { shadow: false });
    }
    flat(b.interior, 3.2, 2.2, 0xff9fb8, 0.8, b.Z(0.2), 0.05);
    // bed
    b.ib(2.2, 0.5, 3, C.white, -3.4, 0, -2.1);
    b.ib(2.1, 0.18, 2.1, 0xff6f61, -3.4, 0.5, -1.6);
    b.ib(1.6, 0.2, 0.6, 0xfff6ea, -3.4, 0.5, -3.2);
    b.solid(-3.4, -2.1, 2.2, 3);
    // TV + sofa
    b.ib(2.4, 0.5, 0.6, C.ink, 1.6, 0, -3.3);
    b.ib(2.0, 1.1, 0.12, 0x2b3a70, 1.6, 0.6, -3.3, { emissive: 0x3c5ab0 });
    b.ib(3, 0.5, 1, 0x5cc6b8, 1.6, 0, 0.9);
    b.ib(3, 0.6, 0.3, 0x48a89c, 1.6, 0.5, 1.3);
    b.solid(1.6, -3.3, 2.4, 0.6);
    b.solid(1.6, 1.0, 3, 1.1);
    // desk where the portfolio gets made
    desk(b, -3.4, 2.2);
    chair(b, -3.4, 1.4, 0xff8fb1, -1);
    plant(b, 4.2, 3.0);
    // cat bed with a sleepy cat
    b.icyl(0.6, 0.6, 0.15, 0xff8fd0, 4.0, 0, -2.6, { seg: 10 });
    const sleepy = makeCat(b.interior, 0xf29a4a, 4.0, b.Z(-2.6));
    sleepy.g.position.y = 0.12;
    sleepy.g.scale.y = 0.75;
  }

  // ===== TikTok — creator livestream studio =====
  {
    const b = building('tiktok', { x: -10, w: 9, d: 8, h: 4.5, color: 0x26213a, roof: 0x15121f, floor: 0x2d2742, facing: -1, trim: 0xfe2c55 });
    // neon edge on the facade
    for (const [c, off] of [[0x25f4ee, -0.08], [0xfe2c55, 0.08]]) box(b.facade, 9.1, 0.12, 0.08, c, off, 3.9, b.front + b.facing * (0.06 + off), { emissive: c, shadow: false });
    // giant music note on the roof
    box(b.upper, 0.35, 2.2, 0.35, 0xffffff, 0.6, 4.85, 0);
    box(b.upper, 1.2, 0.5, 0.35, 0xffffff, 1.1, 6.6, 0);
    box(b.upper, 0.9, 0.7, 0.35, 0xffffff, 0.1, 4.85, 0);
    box(b.upper, 0.9, 0.7, 0.35, 0x25f4ee, -0.05, 4.95, -0.2, { shadow: false });
    // backdrop + set
    b.ib(5.4, 3, 0.2, 0xfe2c55, 0, 0, -3.55);
    b.ib(5.4, 0.12, 0.22, 0x25f4ee, 0, 2.6, -3.5, { emissive: 0x25f4ee });
    b.ib(1.4, 1.4, 0.05, 0xffd25e, -1.4, 1.2, -3.43, { emissive: 0x806020 });
    b.solid(0, -3.55, 5.4, 0.2);
    flat(b.interior, 2.4, 1.6, 0xffffff, 0, b.Z(-2.4), 0.05);
    const creator = makeCharacter({ shirt: 0x25f4ee, pants: 0x15121f, hair: 0xfe2c55 });
    creator.position.set(0, 0, b.Z(-2.4));
    creator.rotation.y = b.facing > 0 ? 0 : Math.PI;
    b.interior.add(creator);
    animated.push((t, dt) => {
      creator.userData.animate(dt, true);
      creator.rotation.y = (b.facing > 0 ? 0 : Math.PI) + Math.sin(t * 2.4) * 0.5;
    });
    // ring light with the phone in the middle
    b.icyl(0.05, 0.05, 1.5, C.ink, 0, 0, -0.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 6, 16), mat(0xffffff, 0xffffff));
    ring.position.set(0, 1.8, b.Z(-0.2));
    b.interior.add(ring);
    b.ib(0.3, 0.55, 0.05, C.ink, 0, 1.52, -0.2);
    b.solid(0, -0.2, 0.4, 0.4);
    // LED panels
    for (const sx of [-2.6, 2.6]) {
      b.icyl(0.05, 0.05, 1.2, C.ink, sx, 0, -1.4);
      b.ib(0.9, 1.2, 0.15, 0xc8fbff, sx, 1.2, -1.4, { emissive: 0x2a9aa0 });
      b.solid(sx, -1.4, 0.9, 0.4);
    }
    // LIVE sign
    const live = b.ib(1.3, 0.45, 0.1, 0xff2244, 2.3, 3.1, -3.42, { emissive: 0xff2244 });
    animated.push((t) => (live.visible = Math.sin(t * 5) > -0.4));
    // floating hearts rising from the stream
    const hearts = [];
    for (let i = 0; i < 7; i++) hearts.push(b.ib(0.22, 0.22, 0.22, i % 2 ? 0xfe2c55 : 0xff8fd0, 0, 0, -2.0, { emissive: 0x802040 }));
    animated.push((t) => {
      hearts.forEach((hh, i) => {
        const k = (t * 0.45 + i / hearts.length) % 1;
        hh.position.set(1.0 + Math.sin(t * 2 + i) * 0.4, 1.2 + k * 2.6, b.Z(-2.0 + Math.cos(i) * 0.4));
        hh.scale.setScalar(0.22 * (1 - k * 0.7));
        hh.rotation.z = Math.PI / 4;
      });
    });
    // guest couch + product table
    b.ib(2.4, 0.5, 0.9, 0x8a63ff, -2.8, 0, 2.6);
    b.ib(2.4, 0.6, 0.25, 0x6f4ee0, -2.8, 0.5, 3.0);
    b.solid(-2.8, 2.7, 2.4, 1.1);
    b.ib(1.6, 0.75, 0.8, C.white, 2.8, 0, 2.6);
    for (let i = 0; i < 3; i++) b.ib(0.28, 0.4, 0.28, [0xffd25e, 0x25f4ee, 0xfe2c55][i], 2.3 + i * 0.5, 0.75, 2.6);
    b.solid(2.8, 2.6, 1.6, 0.8);
  }

  // ===== Splunk — data center that shows its reasoning =====
  {
    const b = building('splunk', { x: 2, w: 12, d: 9, h: 5, color: 0xdde8ee, roof: 0x8fa6b4, floor: 0x343b4a, facing: 1 });
    for (let i = 0; i < 3; i++) {
      box(b.upper, 2, 1, 2, 0xc4d2da, -3.5 + i * 3.5, 5.35, -1.2);
      cyl(b.upper, 0.75, 0.75, 0.1, 0x5a6878, -3.5 + i * 3.5, 6.35, -1.2, { seg: 10, shadow: false });
    }
    cyl(b.upper, 0.08, 0.08, 3, 0x9fb6c4, 4.6, 5.35, 2.6);
    const blink = box(b.upper, 0.35, 0.35, 0.35, 0xff4d6d, 4.6, 8.35, 2.6, { emissive: 0xff2244, shadow: false });
    animated.push((t) => (blink.visible = Math.sin(t * 4) > 0));
    // raised floor tiles
    for (let i = -5; i <= 5; i += 1.2) flat(b.interior, 0.04, 8.4, 0x4a5366, i, 0, 0.045);
    // server racks with blinking LEDs, a cold aisle down the middle
    const leds = [];
    for (const zf of [-3.0, -1.0, 1.0]) {
      for (const sgn of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const lx = sgn * (1.9 + i * 0.95);
          b.ib(0.85, 2.2, 0.7, 0x232a36, lx, 0, zf);
          for (let k = 0; k < 3; k++) leds.push(b.ib(0.5, 0.06, 0.02, k === 1 ? 0x7cff9a : 0x6cf0ff, lx, 0.5 + k * 0.55, zf + 0.36, { emissive: k === 1 ? 0x30c050 : 0x2ab8d0 }));
        }
        b.solid(sgn * 3.33, zf, 3.8, 0.7);
      }
    }
    animated.push((t) => leds.forEach((l, i) => (l.visible = Math.sin(t * (2 + (i % 5)) + i * 1.7) > -0.5)));
    // the "how it got there" board: steps light up one after another
    b.ib(3.2, 1.8, 0.12, 0x111620, 0, 0.9, -4.1);
    b.icyl(0.06, 0.06, 0.9, C.ink, -1.2, 0, -4.1);
    b.icyl(0.06, 0.06, 0.9, C.ink, 1.2, 0, -4.1);
    const steps = [];
    for (let i = 0; i < 5; i++) {
      if (i) b.ib(0.3, 0.05, 0.02, 0x6cf0ff, -1.25 + i * 0.6 - 0.3, 1.8 + (i % 2 ? 0.1 : -0.1), -4.03, { emissive: 0x206070 });
      steps.push(b.ib(0.3, 0.3, 0.04, 0x6cf0ff, -1.2 + i * 0.6, 1.65 + (i % 2) * 0.2, -4.02));
    }
    const result = b.ib(2.4, 0.3, 0.04, 0x7cff9a, 0, 1.1, -4.02);
    animated.push((t) => {
      const k = Math.floor(t * 2) % 8;
      steps.forEach((s, i) => (s.material = mat(0x6cf0ff, i <= k ? 0x38c8e0 : 0x000000)));
      result.material = mat(0x7cff9a, k >= 5 ? 0x40d060 : 0x000000);
    });
    b.solid(0, -4.1, 3.2, 0.4);
    desk(b, 3.8, 3.2, 0xc4d2da);
    chair(b, 3.8, 2.4, 0x3c7bff, -1);
  }

  // ===== SAP — innovation lab with a secure sign-in gate =====
  {
    const b = building('sap', { x: 6, w: 11, d: 8, h: 5, color: 0xd3c4f5, roof: 0x9b84e0, floor: 0xeeeaf6, facing: -1 });
    cyl(b.upper, 1.2, 0.2, 0.6, C.white, -3, 5.4, -1, { seg: 12 });
    for (const vx of [1.5, 3, 4.5]) box(b.upper, 0.8, 0.7, 0.8, 0xb7a8e0, vx, 5.35, -2);
    // turnstiles just inside the door
    for (const gx of [-1.6, 1.6]) {
      b.ib(0.4, 1.0, 1.1, 0x5b4a8a, gx, 0, 2.2);
      const lamp = b.ib(0.3, 0.1, 0.3, 0x7cff9a, gx, 1.0, 2.2, { emissive: 0x2a9a40 });
      animated.push((t) => (lamp.material = mat(0x7cff9a, Math.sin(t * 1.5) > 0 ? 0x2a9a40 : 0x000000)));
      b.solid(gx, 2.2, 0.4, 1.1);
    }
    // sign-here kiosk
    b.icyl(0.08, 0.12, 1.0, 0x5b4a8a, 3.8, 0, 2.6);
    b.ib(0.7, 0.5, 0.08, 0x8a63ff, 3.8, 1.0, 2.6, { emissive: 0x4a30b0 });
    b.solid(3.8, 2.6, 0.5, 0.5);
    // lab benches
    for (const sx of [-2.8, 2.8]) {
      b.ib(3.4, 0.9, 1.1, C.white, sx, 0, -0.6);
      for (let i = 0; i < 3; i++) b.icyl(0.12, 0.16, 0.35, [0x7cff9a, 0xff8fd0, 0x6cf0ff][i], sx - 1 + i, 0.9, -0.6, { emissive: [0x2a8040, 0x803060, 0x207080][i] });
      chair(b, sx - 0.8, 0.4, 0x8a63ff, -1);
      chair(b, sx + 0.8, 0.4, 0x8a63ff, -1);
      b.solid(sx, -0.6, 3.4, 1.1);
    }
    // whiteboard with sticky notes
    b.ib(4.4, 1.7, 0.1, C.white, 0, 0.9, -3.55);
    b.icyl(0.05, 0.05, 0.9, C.ink, -1.8, 0, -3.55);
    b.icyl(0.05, 0.05, 0.9, C.ink, 1.8, 0, -3.55);
    for (let i = 0; i < 9; i++) b.ib(0.32, 0.32, 0.03, [0xffe27a, 0xff8fd0, 0x6cf0ff][i % 3], -1.6 + (i % 5) * 0.75, 1.3 + Math.floor(i / 5) * 0.6, -3.48);
    b.solid(0, -3.55, 4.4, 0.4);
    plant(b, -4.4, -3.2);
    plant(b, 4.4, -3.2);
  }

  // ===== Wiley — library =====
  {
    const b = building('wiley', { x: 18, w: 11, d: 8, h: 5, color: 0xbfe6c8, roof: 0x5fae7f, floor: 0xb98a5e, facing: 1 });
    for (const cx of [-4.4, -2.6, 2.6, 4.4]) cyl(b.facade, 0.25, 0.28, 3.6, C.white, cx, 0, b.front + 0.3, { seg: 8 });
    const spines = [0xff6f61, 0x3c7bff, 0xffd25e, 0x8a63ff, 0x33b37a, 0xff8fd0, 0xf3efe6];
    const shelf = (lx, zf, rot) => {
      const g = new THREE.Group();
      g.position.set(lx, 0, b.Z(zf));
      g.rotation.y = rot;
      b.interior.add(g);
      box(g, 2.4, 2.4, 0.6, 0x7a4e30, 0, 0, 0, { shadow: false });
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 6; i++) box(g, 0.3, 0.5 + r() * 0.15, 0.1, spines[Math.floor(r() * spines.length)], -0.95 + i * 0.38, 0.2 + row * 0.75, 0.3, { shadow: false });
    };
    for (const lx of [-4, -1.35, 1.35, 4]) {
      shelf(lx, -3.5, b.facing > 0 ? 0 : Math.PI);
      b.solid(lx, -3.5, 2.4, 0.6);
    }
    for (const sx of [-1, 1]) {
      shelf(sx * 4.95, 0.2, sx * (-Math.PI / 2));
      b.solid(sx * 4.95, 0.2, 0.6, 2.4);
    }
    flat(b.interior, 3.2, 3.4, 0xb8334a, 0, b.Z(-0.4), 0.05);
    // reading tables with green lamps
    for (const sx of [-2.4, 2.4]) {
      b.ib(2, 0.75, 1.1, 0x8a5a3c, sx, 0, 1.0);
      b.icyl(0.04, 0.12, 0.35, 0xc9a061, sx + 0.6, 0.75, 1.0);
      b.ib(0.5, 0.15, 0.3, 0x33b37a, sx + 0.6, 1.1, 1.0, { emissive: 0x206a3a });
      b.ib(0.6, 0.06, 0.4, C.white, sx - 0.3, 0.75, 1.0);
      chair(b, sx, 1.8, 0x5fae7f, -1);
      b.solid(sx, 1.0, 2, 1.1);
    }
    // the editor's desk with manuscripts
    desk(b, 0, -1.6, 0x8a5a3c, 0xffe9c4);
    for (let i = 0; i < 4; i++) b.ib(0.5, 0.12, 0.65, C.white, -0.6 + (i % 2) * 1.2, 0.75 + Math.floor(i / 2) * 0.12, -1.4);
  }

  // ===== Bloomberg — newspaper office =====
  {
    const b = building('bloomberg', { x: 22, w: 11, d: 8, h: 5, color: 0xf7d26a, roof: 0x2b2b33, floor: 0x6b6f78, facing: -1 });
    const mast = new THREE.Group();
    mast.position.set(3.4, 5.35, 2);
    b.upper.add(mast);
    for (let i = 0; i < 4; i++) {
      box(mast, 0.1, 1.2, 0.1, 0xd8463c, -0.3 + i * 0.07, i * 1.15, 0);
      box(mast, 0.1, 1.2, 0.1, 0xd8463c, 0.3 - i * 0.07, i * 1.15, 0);
    }
    const light = box(mast, 0.3, 0.3, 0.3, 0xff4d6d, 0, 4.6, 0, { emissive: 0xff2244, shadow: false });
    animated.push((t) => (light.visible = Math.sin(t * 3 + 1) > 0));
    box(b.upper, 4, 0.9, 0.2, 0x111111, -1.5, 5.35, b.front * 0.9, { shadow: false });
    // printing press with spinning rollers and a sheet running through
    b.ib(3.6, 1.1, 1.8, 0x3a3f4a, -3.0, 0, -2.6);
    const rollers = [];
    for (let i = 0; i < 3; i++) {
      const rl = b.icyl(0.32, 0.32, 1.7, 0x9aa2b0, -4.2 + i * 1.2, 1.1, -2.6);
      rl.rotation.z = Math.PI / 2;
      rl.position.y = 1.4;
      rollers.push(rl);
    }
    const sheet = b.ib(0.8, 0.02, 1.4, C.white, -3.0, 1.75, -2.6);
    animated.push((t) => {
      rollers.forEach((rl) => (rl.rotation.x = t * 4));
      sheet.position.x = -4.6 + ((t * 1.2) % 3.2);
    });
    b.solid(-3.0, -2.6, 3.6, 1.8);
    // newspaper stacks
    for (let i = 0; i < 4; i++) b.ib(0.8, 0.25 + i * 0.12, 0.6, 0xf3efe6, -0.4, i * 0.27, -3.3);
    b.solid(-0.4, -3.3, 0.8, 0.6);
    // newsroom desks
    desk(b, 2.0, -2.6, C.white, 0xff9f3d);
    desk(b, 4.0, -2.6, C.white, 0x7fd6ee);
    desk(b, 2.0, -0.2, C.white, 0x7fd6ee);
    desk(b, 4.0, -0.2, C.white, 0xff9f3d);
    // headline ticker
    b.ib(4.6, 0.6, 0.1, 0x111111, 2.4, 2.1, -3.6);
    b.icyl(0.05, 0.05, 2.1, C.ink, 0.4, 0, -3.6);
    b.icyl(0.05, 0.05, 2.1, C.ink, 4.4, 0, -3.6);
    const ticks = [];
    for (let i = 0; i < 6; i++) ticks.push(b.ib(0.45, 0.2, 0.03, i % 2 ? 0xff9f3d : 0xffe27a, 0, 2.3, -3.53, { emissive: 0x805020 }));
    animated.push((t) => ticks.forEach((tk, i) => (tk.position.x = 4.4 - ((t * 0.9 + i * 0.75) % 4.0))));
    // voice booth: mic on a round table
    b.icyl(0.6, 0.6, 0.06, C.white, -3.0, 0.75, 1.8, { seg: 12 });
    b.icyl(0.05, 0.05, 0.75, C.ink, -3.0, 0, 1.8);
    b.icyl(0.03, 0.03, 0.35, C.ink, -3.0, 0.81, 1.8);
    b.iball(0.12, 0x3a3f4a, -3.0, 1.2, 1.8, { detail: 1 });
    chair(b, -3.0, 2.6, 0xffd25e, -1);
    b.solid(-3.0, 1.8, 1.2, 1.2);
    // newsstand kiosk out front
    const kx = b.x + 4;
    box(root, 2.2, 1.6, 1.2, 0x2f4d8f, kx, 0, 4.4);
    box(root, 2.6, 0.18, 1.6, 0xf0a83c, kx, 1.6, 4.4);
    for (let i = 0; i < 3; i++) box(root, 0.5, 0.6, 0.06, [0xffffff, 0xffe27a, 0xff9f3d][i], kx - 0.7 + i * 0.7, 0.6, 3.78, { shadow: false });
    addCollider(kx, 4.4, 2.2, 1.2);
  }

  // ===== Klook — travel agency =====
  {
    const b = building('klook', { x: 34, w: 10, d: 8, h: 4.5, color: 0xffb27a, roof: 0xff6a1a, floor: 0xf3e6d2, facing: 1 });
    // hot-air balloon tethered over the roof
    const balloon = new THREE.Group();
    b.upper.add(balloon);
    ball(balloon, 1.3, 0xff6a1a, 0, 9.0, 0, { detail: 1 });
    ball(balloon, 1.32, 0xffffff, 0, 8.6, 0, { detail: 0 }).scale.set(0.55, 0.95, 1.02);
    box(balloon, 0.7, 0.5, 0.7, 0x9a6b45, 0, 7.0, 0);
    for (const [sx, sz] of [[-0.3, -0.3], [0.3, 0.3], [0.3, -0.3], [-0.3, 0.3]]) box(balloon, 0.03, 0.9, 0.03, C.ink, sx, 7.5, sz, { shadow: false });
    animated.push((t) => (balloon.position.y = Math.sin(t * 0.9) * 0.25));
    // counter with a travel agent
    b.ib(4.2, 1.0, 0.8, 0xff6a1a, 0, 0, -1.2);
    b.ib(4.4, 0.08, 1.0, C.white, 0, 1.0, -1.2);
    b.solid(0, -1.2, 4.2, 0.8);
    const agent = makeCharacter({ shirt: 0xff6a1a, pants: 0x34406e, hair: 0x5a3a2a });
    agent.position.set(0.8, 0, b.Z(-2.2));
    agent.rotation.y = b.facing > 0 ? 0 : Math.PI;
    b.interior.add(agent);
    animated.push((t) => (agent.rotation.y = (b.facing > 0 ? 0 : Math.PI) + Math.sin(t * 0.7) * 0.3));
    desk(b, -1.2, -2.6, C.white, 0xffb27a);
    // world map board
    b.ib(4.6, 2.0, 0.1, 0x4fb8d8, 1.4, 1.0, -3.6);
    b.icyl(0.05, 0.05, 1.0, C.ink, -0.6, 0, -3.6);
    b.icyl(0.05, 0.05, 1.0, C.ink, 3.4, 0, -3.6);
    for (const [mx, my, mw, mh] of [[-0.2, 1.9, 1.0, 0.7], [0.9, 2.2, 0.8, 0.5], [1.0, 1.4, 0.5, 0.6], [2.2, 2.0, 1.2, 0.6], [2.9, 1.3, 0.6, 0.4]])
      b.ib(mw, mh, 0.03, 0x8fd16b, mx, my, -3.53);
    for (const [mx, my] of [[0.1, 2.3], [2.6, 2.3], [1.2, 1.7]]) b.ib(0.12, 0.12, 0.05, 0xff2244, mx, my, -3.5, { emissive: 0x801020 });
    // globe
    b.icyl(0.2, 0.3, 0.8, 0x9a6b45, -3.8, 0, -2.6);
    const globe = b.iball(0.55, 0x3c7bff, -3.8, 1.35, -2.6, { detail: 1 });
    animated.push((t) => (globe.rotation.y = t * 0.8));
    b.solid(-3.8, -2.6, 1.0, 1.0);
    // suitcases
    for (const [sx, zf, c, hh] of [[3.6, 0.6, 0xffd25e, 0.9], [4.2, 0.6, 0x25f4ee, 0.7], [3.9, 1.4, 0xff6f61, 0.8]]) b.ib(0.5, hh, 0.35, c, sx, 0, zf);
    b.solid(3.9, 1.0, 1.3, 1.4);
    // waiting chairs
    for (let i = 0; i < 3; i++) chair(b, -4.1, 0.2 + i * 0.9, 0x4fb8d8, 1);
    // model plane circling overhead
    const plane = new THREE.Group();
    b.interior.add(plane);
    box(plane, 0.2, 0.2, 1.0, C.white, 0, 0, 0, { shadow: false });
    box(plane, 1.1, 0.04, 0.3, 0xff6a1a, 0, 0.08, 0.05, { shadow: false });
    box(plane, 0.4, 0.25, 0.08, 0xff6a1a, 0, 0.15, -0.45, { shadow: false });
    animated.push((t) => {
      const a = t * 0.7;
      plane.position.set(Math.cos(a) * 2.6, 2.8, b.Z(0.4) + Math.sin(a) * 1.4);
      plane.rotation.y = -a;
    });
    plant(b, 4.3, -3.2);
  }

  // ===== Cornell Go — bear workshop =====
  {
    const b = building('cornellgo', { x: 38, w: 10, d: 8, h: 4.5, color: 0xb31b1b, roof: 0x7a1010, floor: 0xf6e1e1, facing: -1 });
    // big bear mascot by the door
    const bear = (parent, color, x, y, z, s = 1) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.scale.setScalar(s);
      parent.add(g);
      box(g, 0.6, 0.6, 0.45, color, 0, 0, 0, { shadow: s > 1 });
      box(g, 0.5, 0.45, 0.42, color, 0, 0.6, 0, { shadow: s > 1 });
      box(g, 0.15, 0.15, 0.1, color, -0.2, 1.02, 0, { shadow: false });
      box(g, 0.15, 0.15, 0.1, color, 0.2, 1.02, 0, { shadow: false });
      box(g, 0.2, 0.14, 0.06, 0xf6e1c4, 0, 0.66, 0.22, { shadow: false });
      box(g, 0.06, 0.06, 0.02, C.ink, -0.11, 0.86, 0.22, { shadow: false });
      box(g, 0.06, 0.06, 0.02, C.ink, 0.11, 0.86, 0.22, { shadow: false });
      return g;
    };
    const mascot = bear(root, 0xa8743c, b.x + 3.2, 0, b.z + b.front + b.facing * 1.0, 2.2);
    mascot.rotation.y = b.facing > 0 ? 0 : Math.PI;
    addCollider(b.x + 3.2, b.z + b.front + b.facing * 1.0, 1.4, 1.1);
    box(b.facade, 3.4, 0.7, 0.12, C.white, -2.4, 3.3, b.front + b.facing * 0.08, { shadow: false });
    // stuffing machine with fluff bouncing in a glass dome
    b.icyl(0.8, 0.9, 0.9, 0xff8fb1, -3.0, 0, -2.3, { seg: 10 });
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 12), glass);
    dome.position.set(-3.0, 1.55, b.Z(-2.3));
    b.interior.add(dome);
    const fluff = [];
    for (let i = 0; i < 8; i++) fluff.push(b.iball(0.15, C.white, -3.0, 1.2, -2.3, { detail: 0 }));
    animated.push((t) => fluff.forEach((f, i) => f.position.set(-3.0 + Math.sin(t * 3 + i * 2) * 0.45, 1.1 + Math.abs(Math.sin(t * 4 + i)) * 0.9, b.Z(-2.3) + Math.cos(t * 2.5 + i) * 0.45)));
    b.solid(-3.0, -2.3, 1.8, 1.8);
    // bear shelf on the back wall
    b.ib(6.4, 0.12, 0.6, 0x7a4e30, 1.2, 0.9, -3.5);
    b.ib(6.4, 0.12, 0.6, 0x7a4e30, 1.2, 1.9, -3.5);
    b.ib(6.4, 0.9, 0.6, 0x7a4e30, 1.2, 0, -3.5);
    const bearColors = [0xa8743c, 0xffffff, 0xff8fd0, 0xb31b1b, 0xd9b38c, 0x8a5a3c];
    for (let i = 0; i < 12; i++) {
      const bb = bear(b.interior, bearColors[i % bearColors.length], -1.4 + (i % 6) * 1.05, 1.02 + Math.floor(i / 6) * 1.0, b.Z(-3.4), 0.55);
      bb.rotation.y = b.facing > 0 ? 0 : Math.PI;
    }
    b.solid(1.2, -3.5, 6.4, 0.6);
    // heart station
    b.ib(2.2, 0.8, 1.0, C.white, 2.6, 0, -0.4);
    const heart = b.ib(0.45, 0.45, 0.12, 0xff2244, 2.6, 1.0, -0.4, { emissive: 0x801020 });
    heart.rotation.z = Math.PI / 4;
    animated.push((t) => heart.scale.set(0.45 * (1 + Math.max(0, Math.sin(t * 6)) * 0.2), 0.45 * (1 + Math.max(0, Math.sin(t * 6)) * 0.2), 0.12));
    b.solid(2.6, -0.4, 2.2, 1.0);
    // checkout counter
    b.ib(2.4, 1.0, 0.8, 0xb31b1b, -3.2, 0, 1.6);
    b.ib(0.5, 0.35, 0.4, C.ink, -3.6, 1.0, 1.6);
    b.solid(-3.2, 1.6, 2.4, 0.8);
    plant(b, 4.2, 2.8);
  }

  // ===== Catacombs — Egyptian-tomb arcade =====
  {
    const b = building('catacombs', { x: 50, w: 11, d: 8, h: 5, color: 0xe6c487, roof: 0xc9a061, floor: 0x2a2238, facing: 1, trim: 0xd9a63a });
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(4.2, 3.6, 4), mat(0xe9cf96));
    pyr.position.set(0, 5.35 + 1.8, 0);
    pyr.rotation.y = Math.PI / 4;
    pyr.castShadow = true;
    b.upper.add(pyr);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.75, 4), mat(0xffd25e, 0x806010));
    cap.position.set(0, 5.35 + 3.24, 0);
    cap.rotation.y = Math.PI / 4;
    b.upper.add(cap);
    // obelisks and torches either side of the door
    for (const sx of [-2.2, 2.2]) {
      const ox = b.x + sx;
      const oz = b.z + b.front + b.facing * 0.9;
      box(root, 0.6, 3.6, 0.6, 0xe9cf96, ox, 0, oz);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.6, 4), mat(0xffd25e));
      tip.position.set(ox, 3.9, oz);
      tip.rotation.y = Math.PI / 4;
      root.add(tip);
      addCollider(ox, oz, 0.6, 0.6);
      const flame = box(b.facade, 0.25, 0.35, 0.25, 0xff9f3d, sx * 1.6, 2.9, b.front + b.facing * 0.2, { emissive: 0xff7a20, shadow: false });
      animated.push((t) => (flame.scale.y = 0.35 * (1 + Math.sin(t * 13 + sx) * 0.25)));
    }
    for (let i = 0; i < 6; i++) box(b.facade, 0.5, 0.5, 0.06, [0x3c7bff, 0xd9a63a, 0x33b37a][i % 3], -4.3 + i * 0.5 + (i > 2 ? 6.1 : 0), 3.6, b.front + b.facing * 0.04, { shadow: false });
    // arcade cabinets with cycling screens
    const screenColors = [0x25f4ee, 0xfe2c55, 0xffd25e, 0x7cff9a, 0x8a63ff];
    const screens = [];
    for (let i = 0; i < 5; i++) {
      const lx = -3.6 + i * 1.8;
      b.ib(1.0, 1.9, 0.9, [0x3c2a6a, 0xd9a63a, 0x1d3a6a, 0x6a1d3a, 0x2a6a4a][i], lx, 0, -3.3);
      screens.push(b.ib(0.7, 0.55, 0.04, 0x25f4ee, lx, 1.15, -2.84));
      b.ib(0.8, 0.12, 0.35, C.ink, lx, 0.85, -2.7);
    }
    b.solid(0, -3.3, 8.4, 0.9);
    animated.push((t) => screens.forEach((s, i) => {
      const c = screenColors[(Math.floor(t * 3) + i) % screenColors.length];
      s.material = mat(c, c);
    }));
    // dance pad
    const pads = [];
    for (let i = 0; i < 9; i++) pads.push(flat(b.interior, 0.55, 0.55, 0x3a3060, -0.6 + (i % 3) * 0.6, b.Z(-1.0 + Math.floor(i / 3) * 0.6), 0.06));
    animated.push((t) => pads.forEach((p, i) => {
      const on = Math.floor(t * 2.5 + i * 7.3) % 4 === 0;
      p.material = mat(on ? 0xff8fd0 : 0x3a3060, on ? 0xff5fa2 : 0);
    }));
    // claw machine
    b.ib(1.4, 0.9, 1.4, 0xfe2c55, -3.8, 0, 1.4);
    const claw = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), glass);
    claw.position.set(-3.8, 1.55, b.Z(1.4));
    b.interior.add(claw);
    for (let i = 0; i < 6; i++) b.iball(0.2, screenColors[i % 5], -4.2 + (i % 3) * 0.4, 1.05, 1.2 + Math.floor(i / 3) * 0.4);
    b.ib(1.4, 0.15, 1.4, 0xfe2c55, -3.8, 2.2, 1.4);
    b.solid(-3.8, 1.4, 1.4, 1.4);
    // sarcophagus prize counter
    b.ib(2.4, 0.9, 0.9, 0xd9a63a, 3.4, 0, 1.6);
    b.ib(2.2, 0.15, 0.7, 0x3c7bff, 3.4, 0.9, 1.6);
    b.ib(0.5, 0.35, 0.5, 0xd9a63a, 2.6, 1.05, 1.6);
    b.solid(3.4, 1.6, 2.4, 0.9);
    // jackal statues in the back corners
    for (const sx of [-5.0, 5.0]) {
      b.ib(0.5, 1.2, 0.5, C.ink, sx, 0, -1.4);
      b.ib(0.4, 0.4, 0.5, C.ink, sx, 1.2, -1.3);
      b.ib(0.1, 0.3, 0.1, C.ink, sx - 0.12, 1.6, -1.4);
      b.ib(0.1, 0.3, 0.1, C.ink, sx + 0.12, 1.6, -1.4);
      b.ib(0.55, 0.12, 0.55, 0xd9a63a, sx, 1.1, -1.4);
      b.solid(sx, -1.4, 0.5, 0.5);
    }
  }

  // ===== Viggle — cat café =====
  {
    const b = building('viggle', { x: 54, w: 10, d: 8, h: 4.2, color: 0xffc2d6, roof: 0xf27aa6, floor: 0xf7efe6, facing: -1 });
    for (let i = 0; i < 8; i++) box(b.facade, 1, 0.12, 1.4, i % 2 ? C.white : 0x7fd9c0, -3.5 + i, 2.85, b.front + b.facing * 0.7);
    box(b.upper, 1.0, 1.0, 1.0, 0xf27aa6, -2.3, 4.5, 0, { ry: Math.PI / 4 });
    box(b.upper, 1.0, 1.0, 1.0, 0xf27aa6, 2.3, 4.5, 0, { ry: Math.PI / 4 });
    // counter + espresso machine
    b.ib(4.4, 1.0, 0.8, 0x7fd9c0, 0, 0, -2.8);
    b.ib(0.8, 0.7, 0.5, 0xc4ccd6, -1.2, 1.0, -2.8);
    b.ib(0.5, 0.35, 0.3, 0xffe9c4, 1.0, 1.0, -2.8);
    b.solid(0, -2.8, 4.4, 0.8);
    // chatbot tablet on the counter
    b.ib(0.6, 0.45, 0.06, 0xff5fa2, 1.8, 1.0, -2.7, { emissive: 0x803050 });
    // tables
    for (const sx of [-2.6, 2.6]) {
      b.icyl(0.55, 0.55, 0.06, C.white, sx, 0.75, 0.6, { seg: 12 });
      b.icyl(0.06, 0.06, 0.75, C.ink, sx, 0, 0.6);
      chair(b, sx - 0.8, 0.6, 0xff8fb1, 1);
      chair(b, sx + 0.8, 0.6, 0xff8fb1, 1);
      b.solid(sx, 0.6, 1.2, 1.2);
    }
    // cat tree with residents
    b.icyl(0.12, 0.12, 2.4, 0xd9b38c, -4.2, 0, -2.6);
    b.ib(1.0, 0.12, 1.0, 0xc49a6c, -4.2, 1.0, -2.6);
    b.ib(1.0, 0.12, 1.0, 0xc49a6c, -4.2, 2.3, -2.6);
    b.solid(-4.2, -2.6, 1.0, 1.0);
    makeCat(b.interior, 0x2b2430, -4.2, b.Z(-2.6)).g.position.y = 1.12;
    makeCat(b.interior, 0xfbf6ee, -4.2, b.Z(-2.6)).g.position.y = 2.42;
    makeCat(b.interior, 0xf29a4a, 3.2, b.Z(2.4));
    plant(b, 4.2, -3.2);
  }

  // ===== Gallery — art museum =====
  {
    const b = building('gallery', { x: 66, w: 11, d: 8, h: 6, color: 0xf6efe4, roof: 0xd9b38c, floor: 0xe3d7c4, facing: 1 });
    for (let i = 0; i < 6; i++) cyl(b.facade, 0.28, 0.32, 5.4, C.white, -4.6 + i * 1.84, 0, b.front + 0.3, { seg: 8 });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 11.4, 3), mat(0xefe2cf));
    ped.rotation.z = Math.PI / 2;
    ped.rotation.x = -Math.PI / 2;
    ped.position.set(0, 6.95, b.front + 0.3);
    ped.castShadow = true;
    b.upper.add(ped);
    const art = [0xff6f61, 0x3c7bff, 0xffd25e, 0x8a63ff, 0x33b37a, 0xff8fd0];
    const panel = (lx, zf, rot, n) => {
      const g = new THREE.Group();
      g.position.set(lx, 0, b.Z(zf));
      g.rotation.y = rot;
      b.interior.add(g);
      box(g, n * 1.6, 2.4, 0.2, C.white, 0, 0, 0, { shadow: false });
      for (let i = 0; i < n; i++)
        for (const sz of [-1, 1]) {
          const px = -((n - 1) * 1.6) / 2 + i * 1.6;
          box(g, 1.1, 0.9, 0.04, 0xd9a63a, px, 1.0, sz * 0.12, { shadow: false });
          box(g, 0.9, 0.7, 0.05, art[(i * 2 + (sz > 0 ? 1 : 0)) % art.length], px, 1.1, sz * 0.13, { shadow: false });
        }
    };
    panel(0, -3.4, 0, 4);
    b.solid(0, -3.4, 6.4, 0.3);
    for (const sx of [-1, 1]) {
      panel(sx * 4.6, 0, Math.PI / 2, 3);
      b.solid(sx * 4.6, 0, 0.3, 4.8);
    }
    b.ib(1.0, 0.9, 1.0, C.white, 0, 0, -1.0);
    const sculpt = new THREE.Mesh(new THREE.TorusKnotGeometry(0.4, 0.14, 40, 6), mat(0xff8fd0));
    sculpt.position.set(0, 1.5, b.Z(-1.0));
    b.interior.add(sculpt);
    animated.push((t) => (sculpt.rotation.y = t * 0.6));
    b.solid(0, -1.0, 1.0, 1.0);
    for (const sx of [-2, 2]) {
      b.ib(1.6, 0.45, 0.5, 0x9a6b45, sx, 0, 1.2);
      b.solid(sx, 1.2, 1.6, 0.5);
    }
  }

  // ===== Mailbox — contact =====
  {
    const g = new THREE.Group();
    g.position.set(-7.6, 0, -4.3);
    root.add(g);
    box(g, 0.18, 1.0, 0.18, 0x3a3348, 0, 0, 0);
    const mb = box(g, 0.7, 0.55, 1.0, 0x4a74c9, 0, 1.0, 0);
    box(g, 0.08, 0.5, 0.3, 0xff4d6d, 0.4, 1.2, -0.2);
    mb.userData.building = 'mailbox';
    clickables.push(mb);
    addCollider(-7.6, -4.3, 0.7, 1.0, 0.05);
    buildings.mailbox = { id: 'mailbox', door: new THREE.Vector3(-7.6, 0, -2.6), anchor: new THREE.Vector3(-7.6, 2.6, -4.3) };
  }

  // ---------- props ----------
  function palm(x, z, s = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    for (let i = 0; i < 5; i++) cyl(g, 0.17 * s, 0.22 * s, 1.0 * s, C.trunk, i * 0.08 * s, i * 0.95 * s, 0, { seg: 6 });
    const top = new THREE.Group();
    top.position.set(0.4 * s, 4.9 * s, 0);
    g.add(top);
    for (let i = 0; i < 7; i++) {
      const leaf = box(top, 2.1 * s, 0.12, 0.6 * s, i % 2 ? C.leaf : C.leafDark, 0, 0, 0);
      leaf.position.set(Math.cos((i / 7) * Math.PI * 2) * 0.95 * s, -0.2, Math.sin((i / 7) * Math.PI * 2) * 0.95 * s);
      leaf.rotation.y = -(i / 7) * Math.PI * 2;
      leaf.rotation.z = -0.35;
    }
    animated.push((t) => (top.rotation.y = Math.sin(t * 0.7 + x) * 0.08));
    addCollider(x, z, 0.5, 0.5, 0);
  }

  function tree(x, z, s = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    cyl(g, 0.2 * s, 0.28 * s, 1.4 * s, C.trunk, 0, 0, 0, { seg: 6 });
    ball(g, 1.5 * s, C.leaf, 0, 2.4 * s, 0);
    ball(g, 1.0 * s, C.leafDark, 0.8 * s, 1.9 * s, 0.6 * s);
    addCollider(x, z, 0.6 * s, 0.6 * s, 0);
  }

  function bush(x, z) {
    const m = ball(root, 0.7, C.leafDark, x, 0.45, z);
    m.scale.y = 0.7;
    const flowers = [0xff5d7a, 0xff8fd0, 0xffd25e];
    for (let i = 0; i < 3; i++) box(root, 0.22, 0.22, 0.22, flowers[i], x - 0.3 + i * 0.3, 0.75, z + (i % 2) * 0.3 - 0.15, { shadow: false });
    addCollider(x, z, 1.2, 1.2, 0);
  }

  function car(x, z, color) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    box(g, 3.4, 0.8, 1.6, color, 0, 0.3, 0);
    box(g, 1.9, 0.6, 1.4, C.white, -0.2, 1.1, 0);
    box(g, 1.7, 0.5, 1.45, C.window, -0.2, 1.15, 0, { emissive: 0x2a5a66, shadow: false });
    for (const wx of [-1.1, 1.1]) for (const wz of [-0.8, 0.8]) box(g, 0.6, 0.6, 0.2, 0x2b2430, wx, 0, wz, { shadow: false });
    addCollider(x, z, 3.4, 1.6);
  }

  function lamp(x, z) {
    cyl(root, 0.07, 0.09, 3.2, 0x3a3348, x, 0, z, { seg: 6 });
    box(root, 0.5, 0.25, 0.5, 0xfff1c2, x, 3.2, z, { emissive: 0x9a7a30 });
    addCollider(x, z, 0.25, 0.25, 0);
  }

  // palms and lamps in the gaps between buildings
  for (const x of [-21, -5.6, 10.2, 26.2, 41.7, 58]) palm(x, -4.7);
  for (const x of [-17, -2.5, 14, 30.2, 46, 62]) palm(x, 4.7, 0.95);
  for (const x of [-22.5, 11.6, 43.2, 72]) lamp(x, -4.6);
  for (const x of [-15.5, 15.4, 47.4, 72]) lamp(x, 4.6);
  car(-1.5, 2.0, 0x4fb8d8);
  car(25, -2.0, 0xff6f61);
  car(56, 2.0, 0xffd25e);

  // beach
  {
    const board = (x, z, ry, color) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), mat(color));
      m.scale.set(1.7, 0.08, 0.42);
      m.position.set(x, 0.1, z);
      m.rotation.y = ry;
      m.castShadow = true;
      root.add(m);
      box(root, 2.6, 0.03, 0.06, 0x8bc48a, x, 0.15, z, { ry, shadow: false });
    };
    board(-26.5, -12, 0.9, 0xeaf3c4);
    board(-25.2, -12.6, 0.6, 0xeaf3c4);
    board(-24.5, 12, -0.4, 0xffd0e0);
    for (const [x, z, c1, c2] of [
      [-25, -6.5, 0xff6f61, 0xffffff],
      [-26, 7, 0x3c7bff, 0xffd25e],
    ]) {
      for (let i = 0; i < 4; i++) flat(root, 0.45, 2.4, i % 2 ? c1 : c2, x - 0.67 + i * 0.45, z, 0.03);
      cyl(root, 0.04, 0.04, 2.4, C.white, x + 1.3, 0, z - 0.8, { seg: 6 });
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 8), mat(c1));
      top.position.set(x + 1.3, 2.5, z - 0.8);
      top.castShadow = true;
      root.add(top);
    }
    const lg = new THREE.Group();
    lg.position.set(-24.5, 0, -19);
    root.add(lg);
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.8, 0.8]) box(lg, 0.15, 2.2, 0.15, C.white, sx, 0, sz);
    box(lg, 2.2, 1.5, 2.2, 0xff6f61, 0, 2.2, 0);
    box(lg, 2.6, 0.2, 2.6, C.white, 0, 3.7, 0);
    addCollider(-24.5, -19, 2.0, 2.0);
    palm(-23, -9, 1.1);
    palm(-22.5, 10, 1.05);
    palm(-23.5, 18, 1.15);
  }

  // fountain plaza at the east end of the street
  {
    const fx = STREET_END + 4;
    flat(root, 10, 10, C.sidewalk, fx, 0, 0.022);
    cyl(root, 2.2, 2.4, 0.6, C.white, fx, 0, 0, { seg: 16 });
    cyl(root, 1.9, 1.9, 0.62, 0x7fe3f2, fx, 0, 0, { seg: 16, shadow: false });
    cyl(root, 0.25, 0.35, 1.6, C.white, fx, 0.6, 0);
    const spray = ball(root, 0.45, 0xbff6ff, fx, 2.4, 0, { emissive: 0x3a8a9a });
    animated.push((t) => spray.scale.setScalar(1 + Math.sin(t * 5) * 0.15));
    addCollider(fx, 0, 4.6, 4.6, 0);
  }

  // scattered trees behind the buildings and a tree line around the edge of the world
  const blocked = (x, z, pad) =>
    colliders.some((c) => x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad);
  for (let i = 0; i < 80; i++) {
    const x = -20 + r() * 100;
    const z = (r() < 0.5 ? -1 : 1) * (17 + r() * 8);
    if (!blocked(x, z, 1.6) && !(x > -18 && x < -10 && z < -15.5 && z > -22)) tree(x, z, 0.8 + r() * 0.5);
  }
  for (let x = -22; x < 92; x += 3.2) {
    tree(x + r(), -28 - r() * 2, 1 + r() * 0.4);
    tree(x + r(), 28 + r() * 2, 1 + r() * 0.4);
  }
  for (let z = -26; z < 28; z += 3.2) tree(92 + r() * 2, z, 1 + r() * 0.4);
  for (let i = 0; i < 14; i++) {
    const x = -18 + r() * 96;
    const z = (r() < 0.5 ? -1 : 1) * (16 + r() * 4);
    if (!blocked(x, z, 1.2)) bush(x, z);
  }

  // ---------- wandering cats ----------
  const cats = [
    makeCat(root, 0x2b2430, -12, -2.6),
    makeCat(root, 0xfbf6ee, -14, -9),
    makeCat(root, 0xf29a4a, 4, 3.8),
  ];

  // ---------- pedestrians strolling the sidewalks ----------
  const outfits = [
    [0x8a2a3a, 0x2b2430, 0x5a3a2a],
    [0x4a7a3a, 0x3b3328, 0xd9b38c],
    [0x3c7bff, 0xf3efe6, 0x231a24],
    [0xffd25e, 0x34406e, 0x8a5a3c],
    [0xf3efe6, 0x5b4a8a, 0x231a24],
    [0x33b37a, 0x2b2430, 0xc9a061],
  ];
  const peds = outfits.map(([shirt, pants, hair], i) => {
    const g = makeCharacter({ shirt, pants, hair, skin: [0xf3c9a6, 0xc68a62, 0x8a5a3c][i % 3] });
    g.scale.setScalar(1.1);
    g.position.set(-18 + r() * 90, 0, i % 2 ? 3.5 : -3.5);
    root.add(g);
    return { g, dir: r() < 0.5 ? 1 : -1, speed: 1.4 + r() * 0.9 };
  });
  animated.push((t, dt) => {
    for (const p of peds) {
      p.g.position.x += p.dir * p.speed * dt;
      if (p.g.position.x > 74 || p.g.position.x < -20) p.dir *= -1;
      p.g.rotation.y = (p.dir * Math.PI) / 2;
      p.g.userData.animate(dt * (p.speed / 2.2), true);
    }
  });

  const isBlocked = (x, z, rad) =>
    x < -29 || x > 90 || z < -26 || z > 26 ||
    colliders.some((c) => x + rad > c.minX && x - rad < c.maxX && z + rad > c.minZ && z - rad < c.maxZ);

  const walkIns = Object.values(buildings).filter((b) => b.walls);
  // building whose footprint (plus a margin) contains the point
  const zoneOf = (p, margin) =>
    walkIns.find((b) => Math.abs(p.x - b.x) < b.w / 2 + margin && Math.abs(p.z - b.z) < b.d / 2 + margin);

  // full-height boxes for checking whether a building stands between the camera and the player
  for (const b of walkIns) b.bounds = new THREE.Box3(new THREE.Vector3(b.x - b.w / 2, 0, b.z - b.d / 2), new THREE.Vector3(b.x + b.w / 2, b.h + 0.4, b.z + b.d / 2));
  const ray = new THREE.Ray();
  let open = null;

  function update(t, dt, playerPos, toCamera) {
    animated.forEach((fn) => fn(t, dt));
    cats.forEach((cat) => updateCat(cat, t, dt, isBlocked));
    open = zoneOf(playerPos, 2.2);
    ray.origin.set(playerPos.x, 1.2, playerPos.z);
    ray.direction.copy(toCamera);
    for (const b of walkIns) {
      const goal = b === open || ray.intersectsBox(b.bounds) ? 1 : 0;
      b.reveal += (goal - b.reveal) * Math.min(1, dt * 7);
      if (Math.abs(goal - b.reveal) < 0.002) b.reveal = goal;
      b.walls.scale.y = 1 - (1 - STUB) * b.reveal;
      const shown = b.reveal > 0.3;
      b.upper.visible = !shown;
      b.facade.visible = !shown;
      b.interior.visible = b.reveal > 0.02;
    }
  }

  return {
    colliders,
    clickables,
    buildings,
    update,
    isBlocked,
    zoneOf: (p) => zoneOf(p, 1.6)?.id ?? null,
    // 0..1, how far the nearest building is cut away (used to zoom in on interiors)
    focus: () => open?.reveal ?? 0,
    spawn: buildings.home.inside.clone(),
  };
}

// ---------- characters ----------

export function makeCharacter({ shirt = 0xff6f61, pants = 0x34406e, hair = 0x231a24, skin = 0xf3c9a6 } = {}) {
  const g = new THREE.Group();
  const legs = [box(g, 0.2, 0.55, 0.22, pants, -0.13, 0, 0), box(g, 0.2, 0.55, 0.22, pants, 0.13, 0, 0)];
  const torso = box(g, 0.6, 0.62, 0.34, shirt, 0, 0.55, 0);
  const arms = [box(g, 0.16, 0.55, 0.2, skin, -0.39, 0.6, 0), box(g, 0.16, 0.55, 0.2, skin, 0.39, 0.6, 0)];
  const head = new THREE.Group();
  head.position.y = 1.17;
  g.add(head);
  box(head, 0.46, 0.44, 0.42, skin, 0, 0, 0);
  box(head, 0.5, 0.2, 0.46, hair, 0, 0.36, -0.02);
  box(head, 0.5, 0.4, 0.14, hair, 0, 0.1, -0.2);
  box(head, 0.24, 0.24, 0.24, hair, 0, 0.54, -0.08); // bun
  box(head, 0.07, 0.07, 0.02, 0x231a24, -0.1, 0.22, 0.21, { shadow: false });
  box(head, 0.07, 0.07, 0.02, 0x231a24, 0.1, 0.22, 0.21, { shadow: false });
  g.scale.setScalar(1.25);

  // pivot legs and arms from the hip/shoulder rather than their centers
  const pivot = (m, y) => {
    const p = new THREE.Group();
    p.position.set(m.position.x, y, m.position.z);
    m.position.set(0, m.position.y - y, 0);
    g.add(p);
    p.add(m);
    return p;
  };
  const legP = legs.map((l) => pivot(l, 0.55));
  const armP = arms.map((a) => pivot(a, 1.1));

  let phase = 0;
  g.userData.animate = (dt, moving) => {
    phase = moving ? phase + dt * 11 : phase * 0.85;
    const s = Math.sin(phase) * (moving ? 0.7 : 0);
    legP[0].rotation.x = s;
    legP[1].rotation.x = -s;
    armP[0].rotation.x = -s * 0.8;
    armP[1].rotation.x = s * 0.8;
    torso.position.y = 0.55 + 0.31 + Math.abs(Math.sin(phase)) * (moving ? 0.05 : 0);
  };
  return g;
}

function makeCat(parent, color, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);
  const dark = color === 0x2b2430 ? 0x4a3f50 : 0x2b2430;
  box(g, 0.32, 0.3, 0.62, color, 0, 0.16, 0);
  box(g, 0.3, 0.28, 0.28, color, 0, 0.36, 0.38);
  box(g, 0.08, 0.1, 0.06, color, -0.09, 0.64, 0.4);
  box(g, 0.08, 0.1, 0.06, color, 0.09, 0.64, 0.4);
  box(g, 0.04, 0.04, 0.02, dark, -0.07, 0.5, 0.53, { shadow: false });
  box(g, 0.04, 0.04, 0.02, dark, 0.07, 0.5, 0.53, { shadow: false });
  const tail = box(g, 0.07, 0.07, 0.42, color, 0, 0.42, -0.45);
  tail.rotation.x = 0.7;
  for (const lx of [-0.1, 0.1]) for (const lz of [-0.2, 0.22]) box(g, 0.08, 0.16, 0.08, color, lx, 0, lz, { shadow: false });
  return { g, tail, home: new THREE.Vector3(x, 0, z), target: null, wait: Math.random() * 2 };
}

function updateCat(cat, t, dt, isBlocked) {
  cat.tail.rotation.y = Math.sin(t * 3 + cat.home.x) * 0.5;
  if (cat.wait > 0) {
    cat.wait -= dt;
    return;
  }
  if (!cat.target) {
    cat.target = new THREE.Vector3(cat.home.x + (Math.random() - 0.5) * 7, 0, cat.home.z + (Math.random() - 0.5) * 3);
  }
  const dx = cat.target.x - cat.g.position.x;
  const dz = cat.target.z - cat.g.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.1) {
    cat.target = null;
    cat.wait = 1.5 + Math.random() * 3;
    return;
  }
  const step = Math.min(dist, 1.4 * dt);
  const nx = cat.g.position.x + (dx / dist) * step;
  const nz = cat.g.position.z + (dz / dist) * step;
  if (isBlocked(nx, nz, 0.3)) {
    cat.target = null;
    cat.wait = 0.5;
    return;
  }
  cat.g.position.set(nx, 0, nz);
  cat.g.rotation.y = Math.atan2(dx, dz);
}
