import * as THREE from '../vendor/three.module.min.js';
import { buildWorld, makeCharacter } from './world.js';
import { createUI } from './ui.js';

// Colors in the code are what you see on screen.
THREE.ColorManagement.enabled = false;

const params = new URLSearchParams(location.search);
// Shareable state lives in the query string (?view=iso&open=splunk). Some hosts refuse URL changes.
const replaceUrl = () => {
  try {
    history.replaceState(null, '', `?${params}`);
  } catch {}
};
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf1d2a6);
scene.add(new THREE.HemisphereLight(0xfff0e6, 0xd79aae, 1.55));
const sun = new THREE.DirectionalLight(0xffe0c2, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 140 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(-26, 40, 18);

const world = buildWorld(scene);
const player = makeCharacter();
player.position.copy(world.spawn);
scene.add(player);
// a little ring under the player so they're easy to spot from above
const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 20), new THREE.MeshBasicMaterial({ color: 0xff5f8f }));
ring.rotation.x = -Math.PI / 2;
scene.add(ring);

// ---------- camera: one orthographic camera, two views ----------
// Top-down looks straight down (like the screenshot); isometric matches the reference site.
const VIEWS = {
  topdown: { pitch: Math.PI / 2, yaw: 0, height: 24, mode: 0 },
  iso: { pitch: Math.atan(1 / Math.SQRT2), yaw: Math.PI / 4, height: 30, mode: 1 },
};
let viewName = params.get('view') === 'topdown' ? 'topdown' : 'iso';
let blend = VIEWS[viewName].mode; // 0 = top-down, 1 = iso
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
const camTarget = player.position.clone();
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const view = () => {
  const e = ease(blend);
  return {
    pitch: lerp(VIEWS.topdown.pitch, VIEWS.iso.pitch, e),
    yaw: lerp(VIEWS.topdown.yaw, VIEWS.iso.yaw, e),
    height: lerp(VIEWS.topdown.height, VIEWS.iso.height, e),
  };
};

// ---------- pixel pipeline: render small, upscale with nearest, then grade ----------
const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
const post = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: rt.texture }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uMode: { value: blend } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime;
    uniform float uMode; // 0 = sunset top-down, 1 = clean isometric
    varying vec2 vUv;
    float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 px = floor(vUv * uRes);
      vec2 uv = (px + 0.5) / uRes;
      float ca = (1.0 - uMode) / uRes.x;
      vec3 c = vec3(texture2D(tDiffuse, uv + vec2(ca, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(ca, 0.0)).b);

      // top-down: warm sunset grade with a magenta haze rolling in from the ocean
      vec3 sunset = c * mix(vec3(1.04, 0.9, 1.0), vec3(1.03, 0.98, 0.92), vUv.x);
      sunset = mix(sunset, vec3(0.93, 0.36, 0.74), (1.0 - smoothstep(0.0, 0.4, vUv.x)) * 0.2);
      sunset = mix(vec3(dot(sunset, vec3(0.299, 0.587, 0.114))), sunset, 1.12);
      // isometric: slightly muted, cleaner
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      vec3 clean = mix(c, vec3(l), 0.16) * 1.02;
      c = mix(sunset, clean, uMode);

      float levels = mix(26.0, 14.0, uMode);
      c = floor(c * levels + 0.5 + (bayer4(px) - 0.5)) / levels;
      c += (hash(px + floor(uTime * 12.0) * vec2(17.0, 31.0)) - 0.5) * mix(0.085, 0.045, uMode);
      float v = length((vUv - 0.5) * vec2(1.0, 0.8));
      c *= mix(1.0, 0.62 + 0.38 * smoothstep(0.9, 0.3, v), 1.0 - uMode * 0.7);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
  depthTest: false,
});
const postScene = new THREE.Scene();
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

let PIX = 3;
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  PIX = w < 700 ? 2 : 3;
  renderer.setSize(w, h);
  rt.setSize(Math.ceil(w / PIX), Math.ceil(h / PIX));
  post.uniforms.uRes.value.set(rt.width, rt.height);
}
addEventListener('resize', resize);
resize();

function updateCamera(dt) {
  const goal = VIEWS[viewName].mode;
  blend += Math.sign(goal - blend) * Math.min(Math.abs(goal - blend), dt * 1.4);
  post.uniforms.uMode.value = ease(blend);
  sun.shadow.intensity = lerp(0.55, 1, ease(blend)); // flatter, Hotline-style light from above
  const { pitch, yaw, height } = view();

  camTarget.lerp(player.position, 1 - Math.exp(-dt * 6));
  const aspect = innerWidth / innerHeight;
  const halfH = (height * (innerWidth < 700 ? 0.8 : 1) * (1 - 0.25 * ease(world.focus()))) / 2;
  Object.assign(camera, { left: -halfH * aspect, right: halfH * aspect, top: halfH, bottom: -halfH });
  camera.updateProjectionMatrix();

  const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(100);
  camera.up.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  camera.position.copy(camTarget).add(off);
  camera.lookAt(camTarget);
  camera.updateMatrixWorld();

  // snap to the pixel grid so the low-res image doesn't shimmer while moving
  const unit = (halfH * 2) / rt.height;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  for (const axis of [right, up]) {
    const d = camera.position.dot(axis);
    camera.position.addScaledVector(axis, Math.round(d / unit) * unit - d);
  }
  camera.updateMatrixWorld();

  sun.target.position.set(Math.round(player.position.x), 0, Math.round(player.position.z));
  sun.position.copy(sun.target.position).add(SUN_OFFSET);
}

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') return ui.close();
  if (ui.isOpen()) return;
  if (k === 'e' || k === 'enter') {
    if (ui.nearby()) ui.open(ui.nearby().id);
    return;
  }
  if (k === 'v') return setView(viewName === 'iso' ? 'topdown' : 'iso');
  keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

let path = [];
let openOnArrive = null;
let stuckTime = 0;
const raycaster = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const marker = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);

canvas.addEventListener('pointerdown', (e) => {
  if (ui.isOpen()) return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(world.clickables, false)[0];
  if (hit) return travelTo(locByBuilding[hit.object.userData.building].id, true);
  const p = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
  if (!p) return;
  path = [p];
  openOnArrive = null;
  marker.position.set(p.x, 0.05, p.z);
  marker.visible = true;
});

// ---------- locations ----------
const ui = createUI({
  onTravel: (id, open) => travelTo(id, open),
  onView: (v) => setView(v),
  onSheetChange: (id) => {
    if (id) params.set('open', id);
    else params.delete('open');
    replaceUrl();
  },
});
const locByBuilding = Object.fromEntries(Object.values(ui.byId).map((l) => [l.building, l]));

function setView(v) {
  viewName = v;
  ui.setView(v);
  params.set('view', v);
  replaceUrl();
}
setView(viewName);

function segmentBlocked(a, b) {
  const n = Math.ceil(a.distanceTo(b) / 0.4);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (world.isBlocked(lerp(a.x, b.x, t), lerp(a.z, b.z, t), 0.35)) return true;
  }
  return false;
}

// Walk along the street to a location; fade-teleport if the walk would be blocked.
function travelTo(id, open = false) {
  const loc = ui.byId[id];
  const dest = world.buildings[loc.building];
  const door = dest.door;
  const end = dest.inside ?? door;
  const here = player.position.clone();
  // leave the building we're in through its door, follow the street, then walk inside
  const from = world.buildings[world.zoneOf(here)];
  const start = from && from !== dest ? from.door.clone() : here;
  const route = [new THREE.Vector3(start.x, 0, 0), new THREE.Vector3(door.x, 0, 0), door.clone()];
  if (Math.abs(start.z) < 0.5) route.shift();
  if (start !== here) route.unshift(start);
  if (from === dest) route.length = 0;
  if (dest.inside) route.push(end.clone());
  const pts = [here, ...route];
  const ok = pts.every((p, i) => i === 0 || !segmentBlocked(pts[i - 1], p));
  openOnArrive = open ? id : null;
  marker.visible = false;
  if (ok && here.distanceTo(door) < 60) {
    path = route;
  } else {
    path = [];
    ui.fade(() => {
      player.position.copy(end);
      camTarget.copy(end);
      if (openOnArrive) ui.open(openOnArrive);
      openOnArrive = null;
    });
  }
}

const SPEED = 7.5;
function updatePlayer(dt) {
  let mx = 0;
  let mz = 0;
  const { yaw } = view();
  const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const rgt = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  if (!ui.isOpen()) {
    const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const r = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    if (f || r) {
      path = [];
      openOnArrive = null;
      marker.visible = false;
      mx = fwd.x * f + rgt.x * r;
      mz = fwd.z * f + rgt.z * r;
    } else if (path.length) {
      const p = path[0];
      mx = p.x - player.position.x;
      mz = p.z - player.position.z;
      if (Math.hypot(mx, mz) < 0.25) {
        path.shift();
        mx = mz = 0;
        if (!path.length) {
          marker.visible = false;
          if (openOnArrive) ui.open(openOnArrive);
          openOnArrive = null;
        }
      }
    }
  }

  const len = Math.hypot(mx, mz);
  const moving = len > 0;
  if (moving) {
    const step = Math.min(SPEED * dt, len > 1 ? SPEED * dt : len);
    const dx = (mx / len) * step;
    const dz = (mz / len) * step;
    const p = player.position;
    const before = p.clone();
    if (!world.isBlocked(p.x + dx, p.z, 0.4)) p.x += dx;
    if (!world.isBlocked(p.x, p.z + dz, 0.4)) p.z += dz;
    const target = Math.atan2(mx, mz);
    let diff = target - player.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    player.rotation.y += diff * Math.min(1, dt * 14);
    // give up on a click target we can't reach
    stuckTime = p.distanceTo(before) < step * 0.3 ? stuckTime + dt : 0;
    if (stuckTime > 0.4) {
      path = [];
      marker.visible = false;
      stuckTime = 0;
    }
  }
  player.userData.animate(dt, moving);

  const zone = world.zoneOf(player.position);
  let near = zone ? locByBuilding[zone] : null;
  if (!near && world.buildings.mailbox.door.distanceTo(player.position) < 2.4) near = locByBuilding.mailbox;
  ui.setNearby(near ?? null);
}

const tmp = new THREE.Vector3();
const project = (buildingId) => {
  const b = world.buildings[buildingId];
  tmp.copy(b.anchor).project(camera);
  return { x: (tmp.x * 0.5 + 0.5) * innerWidth, y: (-tmp.y * 0.5 + 0.5) * innerHeight };
};

// ---------- loop ----------
const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  updatePlayer(dt);
  world.update(t, dt, player.position);
  updateCamera(dt);
  marker.scale.setScalar(1 + Math.sin(t * 6) * 0.15);
  ring.position.set(player.position.x, 0.04, player.position.z);

  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  post.uniforms.uTime.value = t;
  renderer.render(postScene, postCam);
  ui.updateLabels(project);
  requestAnimationFrame(frame);
}
updateCamera(1);
frame();

if (params.get('open') && ui.byId[params.get('open')]) {
  const id = params.get('open');
  const dest = world.buildings[ui.byId[id].building];
  player.position.copy(dest.inside ?? dest.door);
  camTarget.copy(player.position);
  ui.open(id);
} else {
  setTimeout(() => ui.toast('Welcome to Happy’s town', innerWidth < 700 ? 'Tap anywhere to walk' : 'WASD or click to walk around'), 600);
}
document.body.classList.add('ready');
