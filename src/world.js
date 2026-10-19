import * as THREE from '../vendor/three.module.min.js';

// World layout: one main street running east–west (z ≈ 0), beach + ocean to the west.
// North of the street is -z, south is +z.

const C = {
  sand: 0xf1d2a6,
  sandWet: 0xdcb48a,
  grass: 0x9cc96f,
  grassDark: 0x7fb35c,
  road: 0x6f5b75,
  roadLine: 0xf8e6c4,
  sidewalk: 0xedd3c3,
  curb: 0xd9b8b0,
  window: 0xaef0f7,
  door: 0x3b2a40,
  leaf: 0x3fae5a,
  leafDark: 0x2e8c48,
  trunk: 0x9a6b45,
  white: 0xfbf6ee,
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

function cyl(parent, rTop, rBot, h, color, x, y, z, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(color));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function flat(parent, w, d, color, x, z, y = 0.01) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

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

  const addCollider = (x, z, w, d, pad = 0.1) =>
    colliders.push({ minX: x - w / 2 - pad, maxX: x + w / 2 + pad, minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad });

  // ---------- ground ----------
  flat(root, 400, 400, C.sand, 60, 0, 0);
  flat(root, 4, 120, C.sandWet, -29.5, 0, 0.005);
  // grass behind each row of buildings
  flat(root, 86, 16, C.grass, 17, -21, 0.008);
  flat(root, 86, 16, C.grass, 17, 21, 0.008);
  flat(root, 20, 40, C.grass, 62, 0, 0.008);

  // street + sidewalks
  flat(root, 82, 6, C.road, 17, 0, 0.02);
  flat(root, 84, 2, C.sidewalk, 17, -4, 0.025);
  flat(root, 84, 2, C.sidewalk, 17, 4, 0.025);
  flat(root, 84, 0.25, C.curb, 17, -3.05, 0.03);
  flat(root, 84, 0.25, C.curb, 17, 3.05, 0.03);
  for (let x = -22; x < 58; x += 4) flat(root, 1.8, 0.22, C.roadLine, x, 0, 0.03);
  for (const cx of [9, 26]) for (let i = 0; i < 5; i++) flat(root, 0.7, 5.4, C.roadLine, cx - 1.6 + i * 0.8, 0, 0.031);
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

  // ---------- buildings ----------
  function building(id, { x, w, d, h, color, roof, facing }) {
    const z = facing > 0 ? -5 - d / 2 - 1 : 5 + d / 2 + 1;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    const front = (facing * d) / 2;

    const body = box(g, w, h, d, color, 0, 0, 0);
    box(g, w + 0.4, 0.35, d + 0.4, roof, 0, h, 0);
    // roof details so the top-down view has something to read
    for (const [px, pz, pw, pd] of [[0, -d / 2, w + 0.4, 0.3], [0, d / 2, w + 0.4, 0.3], [-w / 2, 0, 0.3, d + 0.4], [w / 2, 0, 0.3, d + 0.4]])
      box(g, pw, 0.3, pd, roof, px, h + 0.35, pz, { shadow: false });
    box(g, 1.2, 0.6, 0.9, 0xe9e4ec, -w / 4, h + 0.35, -d / 5);
    box(g, 0.9, 0.12, 0.9, 0x9fe3f0, w / 4, h + 0.35, d / 6, { emissive: 0x2a5a66, shadow: false });

    // windows on the front and the east side (the sides the cameras see)
    const floors = Math.max(1, Math.floor((h - 0.6) / 2.6));
    const cols = Math.max(1, Math.floor(w / 2.2));
    for (let f = 0; f < floors; f++) {
      const y = 1.0 + f * 2.6;
      for (let c = 0; c < cols; c++) {
        const wx = -w / 2 + (w / cols) * (c + 0.5);
        if (f === 0 && Math.abs(wx) < 1.3) continue;
        box(g, 1.1, 1.2, 0.1, C.window, wx, y, front + facing * 0.05, { emissive: 0x2a5a66, shadow: false });
      }
      const sc = Math.max(1, Math.floor(d / 2.4));
      for (let c = 0; c < sc; c++) {
        const wz = -d / 2 + (d / sc) * (c + 0.5);
        box(g, 0.1, 1.2, 1.1, C.window, w / 2 + 0.05, y, wz, { emissive: 0x2a5a66, shadow: false });
      }
    }
    box(g, 1.4, 2.2, 0.16, C.door, 0, 0, front + facing * 0.06, { shadow: false });
    box(g, 1.8, 0.25, 0.5, C.white, 0, 2.2, front + facing * 0.2);
    // path from the door to the sidewalk
    flat(g, 1.8, 1.2, C.sidewalk, 0, front + facing * 0.6, 0.02);

    addCollider(x, z, w, d);
    body.userData.building = id;
    clickables.push(body);
    const b = {
      id,
      group: g,
      body,
      x,
      z,
      w,
      d,
      h,
      facing,
      front,
      door: new THREE.Vector3(x, 0, z + front + facing * 1.4),
      anchor: new THREE.Vector3(x, h + 1.4, z),
    };
    buildings[id] = b;
    return b;
  }

  // Home — About
  {
    const b = building('home', { x: -14, w: 8, d: 7, h: 4.5, color: 0xf9b7a0, roof: 0xe07a6a, facing: 1 });
    box(b.group, 0.8, 1.6, 0.8, 0xc7655a, 2.4, 4.6, -1.5);
    // pool in the backyard
    flat(root, 6, 3.4, 0x6fe0f0, -14, -17.5, 0.03);
    flat(root, 6.8, 4.2, C.white, -14, -17.5, 0.02);
    box(root, 1.6, 0.12, 0.7, 0xff8fb1, -18.2, 0, -17.5);
    // flower beds by the door
    for (const sx of [-2.6, 2.6]) {
      box(b.group, 1.6, 0.4, 0.8, 0x6b8f3e, sx, 0, b.front + 0.6);
      for (let i = 0; i < 4; i++) box(b.group, 0.22, 0.22, 0.22, [0xff5d7a, 0xffd25e, 0xff8fd0, 0xffffff][i], sx - 0.55 + i * 0.37, 0.4, b.front + 0.6, { shadow: false });
    }
  }

  // Viggle — cat café
  {
    const b = building('cafe', { x: 0, w: 8, d: 7, h: 4, color: 0xffc2d6, roof: 0xf27aa6, facing: 1 });
    for (let i = 0; i < 8; i++) box(b.group, 1, 0.12, 1.4, i % 2 ? C.white : 0x7fd9c0, -3.5 + i, 2.6, b.front + 0.7, { shadow: true });
    // big cat ears on the roof
    box(b.group, 1.0, 1.0, 1.0, 0xf27aa6, -2.3, 4.3, 0, { ry: Math.PI / 4 });
    box(b.group, 1.0, 1.0, 1.0, 0xf27aa6, 2.3, 4.3, 0, { ry: Math.PI / 4 });
    for (const tx of [-3, 3]) {
      cyl(b.group, 0.45, 0.45, 0.08, C.white, tx, 0.7, b.front + 2.0, 10);
      cyl(b.group, 0.06, 0.06, 0.7, 0x5a4a5a, tx, 0, b.front + 2.0);
      addCollider(b.x + tx, b.z + b.front + 2.0, 0.9, 0.9, 0);
    }
  }

  // Splunk — control tower that shows its thinking
  {
    const b = building('tower', { x: 16, w: 7, d: 7, h: 4, color: 0xe8f1f5, roof: 0x9fb6c4, facing: 1 });
    box(b.group, 4.4, 8, 4.4, 0xcfe3ea, 0, 4.3, 0);
    box(b.group, 6.2, 2.4, 6.2, 0x7fd6ee, 0, 12.3, 0, { emissive: 0x1d4f60 });
    box(b.group, 6.6, 0.3, 6.6, 0x9fb6c4, 0, 14.7, 0);
    cyl(b.group, 0.08, 0.08, 3, 0x9fb6c4, 0, 15, 0);
    const blink = box(b.group, 0.35, 0.35, 0.35, 0xff4d6d, 0, 18, 0, { emissive: 0xff2244, shadow: false });
    // "reasoning" lights climbing the shaft
    const steps = [];
    for (let i = 0; i < 6; i++) steps.push(box(b.group, 0.5, 0.5, 0.12, 0x6cf0ff, 1.3, 4.8 + i * 1.2, 2.25, { emissive: 0x000000, shadow: false }));
    animated.push((t) => {
      blink.visible = Math.sin(t * 4) > 0;
      const k = Math.floor(t * 3) % 8;
      steps.forEach((s, i) => (s.material = mat(0x6cf0ff, i <= k ? 0x38c8e0 : 0x000000)));
    });
    b.anchor.y = 17;
  }

  // SAP — innovation lab with a "sign in" gate
  {
    const b = building('lab', { x: 33, w: 11, d: 8, h: 5, color: 0xd3c4f5, roof: 0x9b84e0, facing: 1 });
    cyl(b.group, 1.2, 0.2, 0.6, C.white, -3, 5.4, -1, 12);
    cyl(b.group, 0.12, 0.12, 0.8, 0x9b84e0, -3, 5.3, -1);
    for (const vx of [1.5, 3, 4.5]) box(b.group, 0.8, 0.7, 0.8, 0xb7a8e0, vx, 5.35, -2);
    // turnstiles in front of the door
    for (const gx of [-1.4, 1.4]) {
      box(b.group, 0.4, 1.0, 1.0, 0x5b4a8a, gx, 0, b.front + 1.4);
      box(b.group, 0.3, 0.12, 0.3, 0x7cff9a, gx, 1.0, b.front + 1.4, { emissive: 0x2a9a40, shadow: false });
    }
  }

  // Bloomberg — radio station + newsstand
  {
    const b = building('radio', { x: 2, w: 8, d: 7, h: 5, color: 0xffd979, roof: 0xf0a83c, facing: -1 });
    const mast = new THREE.Group();
    mast.position.set(2.2, 5.3, 1.5);
    b.group.add(mast);
    for (let i = 0; i < 6; i++) {
      box(mast, 0.12, 1.3, 0.12, 0xd8463c, -0.4 + i * 0.065, i * 1.25, 0);
      box(mast, 0.12, 1.3, 0.12, 0xd8463c, 0.4 - i * 0.065, i * 1.25, 0);
      box(mast, 0.8 - i * 0.12, 0.08, 0.08, C.white, 0, i * 1.25 + 0.6, 0);
    }
    const light = box(mast, 0.3, 0.3, 0.3, 0xff4d6d, 0, 7.6, 0, { emissive: 0xff2244, shadow: false });
    animated.push((t) => (light.visible = Math.sin(t * 3 + 1) > 0));
    // newsstand kiosk
    box(root, 2.2, 1.6, 1.2, 0x2f4d8f, b.x + 5.6, 0, 4.5);
    box(root, 2.6, 0.18, 1.6, 0xf0a83c, b.x + 5.6, 1.6, 4.5);
    for (let i = 0; i < 3; i++) box(root, 0.5, 0.6, 0.06, [0xffffff, 0xffe27a, 0xff9f3d][i], b.x + 4.9 + i * 0.7, 0.6, 3.88, { shadow: false });
    addCollider(b.x + 5.6, 4.5, 2.2, 1.2);
    b.anchor.y = 9;
  }

  // Wiley — library with columns and book spines
  {
    const b = building('library', { x: 18, w: 10, d: 8, h: 5.5, color: 0xbfe6c8, roof: 0x5fae7f, facing: -1 });
    for (let i = 0; i < 5; i++) cyl(b.group, 0.28, 0.32, 4.6, C.white, -4 + i * 2, 0.3, b.front - 0.9, 8);
    box(b.group, 10.4, 0.3, 2.0, C.white, 0, 0, b.front - 0.9);
    box(b.group, 10.4, 0.5, 2.2, 0x5fae7f, 0, 4.9, b.front - 0.9);
    // book spines on the east wall
    const spines = [0xff6f61, 0x3c7bff, 0xffd25e, 0x8a63ff, 0x33b37a, 0xff8fd0];
    for (let i = 0; i < 12; i++) box(b.group, 0.1, 1.4 + (i % 3) * 0.3, 0.45, spines[i % spines.length], 5.06, 3.2, -2.8 + i * 0.5, { shadow: false });
    addCollider(b.x, b.z + b.front - 0.9, 10.4, 2.0);
    b.door.z -= 2;
  }

  // Gallery — museum with a pediment
  {
    const b = building('museum', { x: 35, w: 11, d: 8, h: 6, color: 0xf6efe4, roof: 0xd9b38c, facing: -1 });
    box(b.group, 11.4, 0.45, 2.4, 0xefe2cf, 0, 5.9, b.front - 0.8);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 11.4, 3), mat(0xefe2cf));
    ped.rotation.z = Math.PI / 2;
    ped.rotation.x = -Math.PI / 2;
    ped.position.set(0, 6.95, b.front - 0.8);
    ped.castShadow = true;
    b.group.add(ped);
    for (let i = 0; i < 6; i++) cyl(b.group, 0.3, 0.34, 5.6, C.white, -4.5 + i * 1.8, 0.3, b.front - 0.8, 8);
    box(b.group, 11.4, 0.3, 2.2, 0xefe2cf, 0, 0, b.front - 0.8);
    // banners showing "art"
    const colors = [0xff6f61, 0x3c7bff, 0xffd25e];
    colors.forEach((c, i) => box(b.group, 0.1, 2.2, 1.4, c, 5.56, 2.2, -2.4 + i * 2.2, { shadow: false }));
    // sculpture out front
    box(root, 1.2, 0.8, 1.2, C.white, b.x - 7.5, 0, 6);
    const sculpt = new THREE.Mesh(new THREE.TorusKnotGeometry(0.45, 0.16, 40, 6), mat(0xff8fd0));
    sculpt.position.set(b.x - 7.5, 1.6, 6);
    sculpt.castShadow = true;
    root.add(sculpt);
    animated.push((t) => (sculpt.rotation.y = t * 0.6));
    addCollider(b.x - 7.5, 6, 1.2, 1.2);
    addCollider(b.x, b.z + b.front - 0.8, 11.4, 2.2);
    b.door.z -= 2;
    b.anchor.y = 9.5;
  }

  // Mailbox — contact
  {
    const g = new THREE.Group();
    g.position.set(-8.6, 0, -4.3);
    root.add(g);
    box(g, 0.18, 1.0, 0.18, 0x3a3348, 0, 0, 0);
    const mb = box(g, 0.7, 0.55, 1.0, 0x4a74c9, 0, 1.0, 0);
    box(g, 0.08, 0.5, 0.3, 0xff4d6d, 0.4, 1.2, -0.2);
    mb.userData.building = 'mailbox';
    clickables.push(mb);
    addCollider(-8.6, -4.3, 0.7, 1.0, 0.05);
    buildings.mailbox = { id: 'mailbox', door: new THREE.Vector3(-8.6, 0, -2.6), anchor: new THREE.Vector3(-8.6, 2.6, -4.3) };
  }

  // ---------- props ----------
  function palm(x, z, s = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    for (let i = 0; i < 5; i++) cyl(g, 0.17 * s, 0.22 * s, 1.0 * s, C.trunk, i * 0.08 * s, i * 0.95 * s, 0, 6);
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
    cyl(g, 0.2 * s, 0.28 * s, 1.4 * s, C.trunk, 0, 0, 0, 6);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * s, 0), mat(C.leaf));
    crown.position.y = 2.4 * s;
    crown.castShadow = true;
    crown.receiveShadow = true;
    g.add(crown);
    const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 * s, 0), mat(C.leafDark));
    c2.position.set(0.8 * s, 1.9 * s, 0.6 * s);
    c2.castShadow = true;
    g.add(c2);
    addCollider(x, z, 0.6 * s, 0.6 * s, 0);
  }

  function bush(x, z) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), mat(C.leafDark));
    m.position.set(x, 0.45, z);
    m.scale.y = 0.7;
    m.castShadow = true;
    root.add(m);
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
    cyl(root, 0.07, 0.09, 3.2, 0x3a3348, x, 0, z, 6);
    box(root, 0.5, 0.25, 0.5, 0xfff1c2, x, 3.2, z, { emissive: 0x9a7a30 });
    addCollider(x, z, 0.25, 0.25, 0);
  }

  for (const x of [-20, -5.5, 8, 25, 42]) {
    palm(x, -4.7);
    palm(x + 1.5, 4.7, 0.95);
  }
  for (const x of [-11, 12, 29, 47]) {
    lamp(x, -4.6);
    lamp(x + 2, 4.6);
  }
  car(-3.5, 2.0, 0x4fb8d8);
  car(23, -2.0, 0xff6f61);
  car(40, 2.0, 0xffd25e);
  bush(-4.6, -6.5);
  bush(4.6, -6.5);
  bush(11.6, -6.5);
  bush(26.6, -6.5);
  bush(-2.2, 6.5);
  bush(11, 6.5);

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
    // towels + umbrellas
    for (const [x, z, c1, c2] of [
      [-25, -6.5, 0xff6f61, 0xffffff],
      [-26, 7, 0x3c7bff, 0xffd25e],
    ]) {
      for (let i = 0; i < 4; i++) flat(root, 0.45, 2.4, i % 2 ? c1 : c2, x - 0.67 + i * 0.45, z, 0.03);
      cyl(root, 0.04, 0.04, 2.4, C.white, x + 1.3, 0, z - 0.8, 6);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 8), mat(c1));
      top.position.set(x + 1.3, 2.5, z - 0.8);
      top.castShadow = true;
      root.add(top);
    }
    // lifeguard tower
    const lg = new THREE.Group();
    lg.position.set(-24.5, 0, -19);
    root.add(lg);
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.8, 0.8]) box(lg, 0.15, 2.2, 0.15, C.white, sx, 0, sz);
    box(lg, 2.2, 1.5, 2.2, 0xff6f61, 0, 2.2, 0);
    box(lg, 2.6, 0.2, 2.6, C.white, 0, 3.7, 0);
    addCollider(-24.5, -19, 2.0, 2.0);
    // beach palms
    palm(-23, -9, 1.1);
    palm(-22.5, 10, 1.05);
    palm(-23.5, 18, 1.15);
  }

  // fountain plaza at the east end
  {
    flat(root, 10, 10, C.sidewalk, 53, 0, 0.022);
    cyl(root, 2.2, 2.4, 0.6, C.white, 53, 0, 0, 16);
    const water = cyl(root, 1.9, 1.9, 0.62, 0x7fe3f2, 53, 0, 0, 16);
    water.castShadow = false;
    cyl(root, 0.25, 0.35, 1.6, C.white, 53, 0.6, 0, 8);
    const spray = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), mat(0xbff6ff, 0x3a8a9a));
    spray.position.set(53, 2.4, 0);
    root.add(spray);
    animated.push((t) => (spray.scale.setScalar(1 + Math.sin(t * 5) * 0.15)));
    addCollider(53, 0, 4.6, 4.6, 0);
  }

  // scattered trees behind the buildings and a tree line around the edge of the world
  const r = rng(7);
  const blocked = (x, z, pad) =>
    colliders.some((c) => x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad);
  for (let i = 0; i < 60; i++) {
    const x = -20 + r() * 78;
    const z = (r() < 0.5 ? -1 : 1) * (15 + r() * 10);
    if (!blocked(x, z, 1.6) && !(x > -18 && x < -10 && z < -14 && z > -21)) tree(x, z, 0.8 + r() * 0.5);
  }
  for (let x = -22; x < 66; x += 3.2) {
    tree(x + r(), -28 - r() * 2, 1 + r() * 0.4);
    tree(x + r(), 28 + r() * 2, 1 + r() * 0.4);
  }
  for (let z = -26; z < 28; z += 3.2) tree(64 + r() * 2, z, 1 + r() * 0.4);
  for (let i = 0; i < 10; i++) {
    const x = -18 + r() * 70;
    const z = (r() < 0.5 ? -1 : 1) * (14 + r() * 4);
    if (!blocked(x, z, 1.2)) bush(x, z);
  }

  // ---------- cats ----------
  const cats = [
    makeCat(root, 0xf29a4a, -10, -2.5),
    makeCat(root, 0x2b2430, 3.5, -3.6),
    makeCat(root, 0xfbf6ee, -2.5, -4.2),
  ];

  const isBlocked = (x, z, rad) =>
    x < -29 || x > 62 || z < -26 || z > 26 ||
    colliders.some((c) => x + rad > c.minX && x - rad < c.maxX && z + rad > c.minZ && z - rad < c.maxZ);

  function update(t, dt) {
    animated.forEach((fn) => fn(t));
    cats.forEach((cat) => updateCat(cat, t, dt, isBlocked));
  }

  return { colliders, clickables, buildings, update, isBlocked, spawn: new THREE.Vector3(-14, 0, -1) };
}

// ---------- characters ----------

export function makeCharacter() {
  const g = new THREE.Group();
  const skin = 0xf3c9a6;
  const legs = [box(g, 0.2, 0.55, 0.22, 0x34406e, -0.13, 0, 0), box(g, 0.2, 0.55, 0.22, 0x34406e, 0.13, 0, 0)];
  const torso = box(g, 0.6, 0.62, 0.34, 0xff6f61, 0, 0.55, 0);
  const arms = [box(g, 0.16, 0.55, 0.2, skin, -0.39, 0.6, 0), box(g, 0.16, 0.55, 0.2, skin, 0.39, 0.6, 0)];
  const head = new THREE.Group();
  head.position.y = 1.17;
  g.add(head);
  box(head, 0.46, 0.44, 0.42, skin, 0, 0, 0);
  box(head, 0.5, 0.2, 0.46, 0x231a24, 0, 0.36, -0.02);
  box(head, 0.5, 0.4, 0.14, 0x231a24, 0, 0.1, -0.2);
  box(head, 0.24, 0.24, 0.24, 0x231a24, 0, 0.54, -0.08); // bun
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
    cat.target = new THREE.Vector3(cat.home.x + (Math.random() - 0.5) * 8, 0, cat.home.z + (Math.random() - 0.5) * 3);
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
