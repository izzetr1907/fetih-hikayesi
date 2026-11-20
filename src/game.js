// FETİH HİKAYESİ — TikTok LIVE etkileşimli tarayıcı oyunu
import * as THREE from './lib/three.module.js';

// ---------------------------------------------------------------- Ayarlar
const DEFAULTS = {
  username: '', autoConnect: false, serverUrl: '', signKey: '',
  gifts: { halat: '', fatih: '', destek: '' },
  destekSec: 30, ropeCap: 8,
  musicVol: 0.6, drumOn: true, drumVol: 0.35, sfxVol: 0.8,
  todMode: 'cycle', todMin: 12, slowMin: 15, fastMin: 10, interact: 1,
  idleMin: 15, shotSec: 9, quality: 'high', labelScale: 1, hudScale: 1, hudTop: 0,
  showLedger: true, showStats: true, hideBtn: false, wakeLock: true,
  demoOn: false, demoRate: '1', demoGifts: true,
};
const LS_KEY = 'fetih.settings.v1';
let S = loadSettings();
function loadSettings() {
  try { const o = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); return { ...DEFAULTS, ...o, gifts: { ...DEFAULTS.gifts, ...(o.gifts || {}) } }; }
  catch { return structuredClone(DEFAULTS); }
}
function saveSettings() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch {} }

const TOTAL = 1453;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
function srand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const fmtM = (m) => Math.round(m).toLocaleString('tr-TR');

// ---------------------------------------------------------------- Renderer
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 2600);
scene.fog = new THREE.Fog(0xc3dbee, 120, 900);

function applyQuality() {
  const dpr = window.devicePixelRatio || 1;
  const pr = S.quality === 'low' ? Math.min(dpr, 1) : S.quality === 'mid' ? Math.min(dpr, 1.6) : Math.min(dpr, 2.2);
  renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled = S.quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  if (sun) { sun.castShadow = S.quality !== 'low'; const ms = S.quality === 'high' ? 2048 : 1024; if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } }
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  resize();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const hfov = 62 * Math.PI / 180;
  let vfov = 2 * Math.atan(Math.tan(hfov / 2) / camera.aspect) * 180 / Math.PI;
  camera.fov = clamp(vfov, 42, 82);
  camera.updateProjectionMatrix();
  const u = Math.min(w, h) / 100 * S.hudScale * (w > h ? 0.82 : 1);
  document.documentElement.style.setProperty('--u', u.toFixed(2) + 'px');
  document.documentElement.style.setProperty('--top', (S.hudTop | 0) + 'px');
  document.body.classList.toggle('land', w > h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 300));

// ---------------------------------------------------------------- Yardımcı geometri birleştirme
function part(geo, color, m) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (m) g.applyMatrix4(m);
  const c = new THREE.Color(color); const n = g.attributes.position.count; const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}
function merge(list) {
  let n = 0; list.forEach(g => n += g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const VC = (opts = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });

// ---------------------------------------------------------------- Yol (Galata sırtından Haliç'e)
const WATER_Y = -0.8;
const PX0 = -200, PX1 = 200;
const zPath = (u) => 18 * Math.sin(2.2 * u + 0.4) - 6;
const hProf = (u) => 34 * Math.pow(Math.max(0, Math.sin(Math.PI * clamp(u, 0, 1))), 1.1) + 0.6 - 3.8 * smooth(0.9, 1.0, u);
function noise2(x, z) { return Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.06) + 0.5 * Math.sin(x * 0.13 + z * 0.09) + 0.25 * Math.cos(x * 0.31 - z * 0.23); }
function groundH(x, z) {
  const u = (x - PX0) / (PX1 - PX0);
  const uc = clamp(u, 0, 1);
  const zp = zPath(uc); const dz = Math.abs(z - zp);
  const road = hProf(uc);
  const sur = hProf(uc) * Math.exp(-(dz * dz) / (90 * 90)) + noise2(x, z) * 4.5 * smooth(10, 45, dz) + 2.5 * smooth(8, 30, dz);
  let h = lerp(road, sur, smooth(5, 24, dz));
  if (u < 0) h -= (-u) * 400 * 0.32;
  if (u > 1) h -= (u - 1) * 400 * 0.32;
  h -= smooth(-105, -150, z) * 30;
  h += smooth(-215, -250, z) * 34 + (z < -215 ? noise2(x * 0.7, z) * 4 : 0);
  h -= smooth(190, 240, z) * 25;
  return h;
}
const NP = 1600; const PP = []; let cum = 0;
for (let i = 0; i <= NP; i++) {
  const u = i / NP; const x = lerp(PX0, PX1, u); const z = zPath(u); const y = hProf(u);
  if (i > 0) { const p = PP[i - 1]; cum += Math.hypot(x - p.x, y - p.y, z - p.z); }
  PP.push({ x, y, z, s: cum });
}
const PATH_LEN = cum;
function pathAt(s, out = {}) {
  s = clamp(s, 0, PATH_LEN);
  let lo = 0, hi = NP;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (PP[m].s < s) lo = m; else hi = m; }
  const a = PP[lo], b = PP[hi]; const t = (s - a.s) / Math.max(1e-6, b.s - a.s);
  out.x = lerp(a.x, b.x, t); out.y = lerp(a.y, b.y, t); out.z = lerp(a.z, b.z, t);
  let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; out.tx = tx / l; out.tz = tz / l;
  out.nx = -out.tz; out.nz = out.tx;
  if (out.nz < 0) { out.nx = -out.nx; out.nz = -out.nz; }
  return out;
}
let S_SHORE = PATH_LEN;
for (let i = NP; i > NP * 0.5; i--) { if (PP[i].y > WATER_Y + 0.35) { S_SHORE = PP[i].s; break; } }
const S_START = 14;
const S_ARRIVE = S_SHORE - 11;
const S_FLOAT = Math.min(PATH_LEN - 2, S_SHORE + 16);
const _p = {}, _q = {};
function worldAt(s, lat, out = new THREE.Vector3()) { pathAt(s, _p); const x = _p.x + _p.nx * lat, z = _p.z + _p.nz * lat; out.set(x, groundH(x, z), z); return out; }

// ---------------------------------------------------------------- Gökyüzü ve ışık
const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, sunVis: { value: 1 }, moonVis: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }`,
  fragmentShader: `uniform vec3 top,hor,bot,sunCol,sunDir; uniform float sunVis,moonVis; varying vec3 vP;
  void main(){ float h = vP.y; vec3 c = h>0.? mix(hor, top, pow(clamp(h,0.,1.),0.55)) : mix(hor, bot, clamp(-h*4.,0.,1.));
   float d = max(dot(normalize(vP), normalize(sunDir)), 0.);
   c += sunCol * (pow(d, 900.)*6. + pow(d, 14.)*0.35) * sunVis;
   vec3 md = normalize(vec3(-sunDir.x, abs(sunDir.y)+0.35, -sunDir.z)); float m = max(dot(normalize(vP), md),0.);
   c += vec3(0.85,0.9,1.0) * (smoothstep(0.9993,0.9996,m)*1.2 + pow(m,60.)*0.12) * moonVis;
   gl_FragColor = vec4(c,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`
}));
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
const starGeo = new THREE.BufferGeometry(); { const r = srand(7); const a = []; for (let i = 0; i < 900; i++) { const th = r() * Math.PI * 2, ph = Math.acos(r() * 0.95); a.push(Math.sin(ph) * Math.cos(th) * 1800, Math.cos(ph) * 1800, Math.sin(ph) * Math.sin(th) * 1800); } starGeo.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); }
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; scene.add(stars);

const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6b5a3a, 1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(100, 200, 100);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45; sun.shadow.camera.near = 1; sun.shadow.camera.far = 500; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
const shipLight = new THREE.PointLight(0xffa04a, 0, 40, 1.4); scene.add(shipLight);
const frontLight = new THREE.PointLight(0xffa04a, 0, 40, 1.4); scene.add(frontLight);

const TOD = {
  day:     { top: '#3f83d6', hor: '#cfe4f4', bot: '#6a8aa0', sun: '#fff1da', si: 2.6, hs: '#d6ebff', hg: '#7a6a48', hi: 1.15, fog: '#c8dff0', el: 52, az: 0.9, torch: 0.25, star: 0, water: '#2f78a6', exp: 0.95, moon: 0 },
  sunset:  { top: '#3a5c9e', hor: '#ffae6a', bot: '#7a5a5a', sun: '#ff9a4a', si: 2.0, hs: '#ffd4ab', hg: '#5e4030', hi: 0.85, fog: '#eea477', el: 7, az: 0.35, torch: 0.7, star: 0, water: '#5a6f96', exp: 1.0, moon: 0 },
  evening: { top: '#1e2a58', hor: '#c96a55', bot: '#3a2a3a', sun: '#ff7a50', si: 0.9, hs: '#9a86bb', hg: '#3a2a2a', hi: 0.7, fog: '#6c4c66', el: 1.5, az: 0.3, torch: 1.1, star: 0.35, water: '#3e5680', exp: 1.15, moon: 0.3 },
  night:   { top: '#040919', hor: '#1a2a4c', bot: '#0a0f1c', sun: '#9fb4ff', si: 0.55, hs: '#4a5d92', hg: '#16161f', hi: 0.55, fog: '#121b33', el: 38, az: -0.6, torch: 1.6, star: 1, water: '#1d3352', exp: 1.35, moon: 1 },
  dawn:    { top: '#4a6aa8', hor: '#f6b8a0', bot: '#6a6070', sun: '#ffc39a', si: 1.6, hs: '#ffd9c8', hg: '#5a4a40', hi: 0.85, fog: '#e6b8a8', el: 9, az: 1.6, torch: 0.6, star: 0.1, water: '#5f7aa0', exp: 1.0, moon: 0.1 },
};
const CYCLE = ['day', 'sunset', 'evening', 'night', 'dawn'];
let todT = 0.3;
const _ca = new THREE.Color(), _cb = new THREE.Color();
function mixCol(a, b, t, out) { _ca.set(a); _cb.set(b); return out.copy(_ca).lerp(_cb, t); }
const curTod = { torch: 0.6, star: 0 };
const fogCol = new THREE.Color();
function updateTod(dt) {
  let A, B, t;
  if (S.todMode === 'cycle') {
    todT = (todT + dt / (Math.max(2, S.todMin) * 60)) % 1;
    const f = todT * CYCLE.length; const i = Math.floor(f); t = smooth(0.6, 1, f - i);
    A = TOD[CYCLE[i]]; B = TOD[CYCLE[(i + 1) % CYCLE.length]];
  } else { A = B = TOD[S.todMode] || TOD.evening; t = 0; }
  mixCol(A.top, B.top, t, skyU.top.value); mixCol(A.hor, B.hor, t, skyU.hor.value); mixCol(A.bot, B.bot, t, skyU.bot.value);
  mixCol(A.sun, B.sun, t, skyU.sunCol.value); mixCol(A.sun, B.sun, t, sun.color);
  sun.intensity = lerp(A.si, B.si, t);
  mixCol(A.hs, B.hs, t, hemi.color); mixCol(A.hg, B.hg, t, hemi.groundColor); hemi.intensity = lerp(A.hi, B.hi, t);
  mixCol(A.fog, B.fog, t, fogCol); scene.fog.color.copy(fogCol);
  const el = lerp(A.el, B.el, t) * Math.PI / 180, az = lerp(A.az, B.az, t);
  skyU.sunDir.value.set(Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az) - 0.4).normalize();
  const night = lerp(A.moon, B.moon, t);
  skyU.sunVis.value = 1 - night; skyU.moonVis.value = night;
  curTod.torch = lerp(A.torch, B.torch, t); curTod.star = lerp(A.star, B.star, t);
  starMat.opacity = curTod.star;
  mixCol(A.water, B.water, t, waterMat.color);
  renderer.toneMappingExposure = lerp(A.exp, B.exp, t);
  torchMat.uniforms.uI.value = curTod.torch;
  windowMat.opacity = clamp(curTod.torch - 0.4, 0, 1);
  shipLight.intensity = Math.max(0, curTod.torch - 0.5) * 60; frontLight.intensity = shipLight.intensity * 0.8;
}

// ---------------------------------------------------------------- Arazi ve su
(() => {
  const W = 760, D = 680, SX = 190, SZ = 150;
  const g = new THREE.PlaneGeometry(W, D, SX, SZ); g.rotateX(-Math.PI / 2); g.translate(40, 0, -70);
  const p = g.attributes.position; const col = new Float32Array(p.count * 3); const c = new THREE.Color();
  const grass = new THREE.Color('#6f8a3c'), grass2 = new THREE.Color('#8a9a4a'), dirt = new THREE.Color('#8b6b45'), sand = new THREE.Color('#c9b07a'), rock = new THREE.Color('#7d7464');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i); const h = groundH(x, z); p.setY(i, h);
    const u = clamp((x - PX0) / (PX1 - PX0), 0, 1); const dz = Math.abs(z - zPath(u));
    c.copy(grass).lerp(grass2, 0.5 + 0.5 * noise2(x * 2.1, z * 1.7));
    if (h > 22) c.lerp(rock, smooth(22, 34, h) * 0.5);
    if (h < WATER_Y + 1.6) c.copy(sand);
    if (dz < 9 && x > PX0 - 5 && x < PX1 + 5) c.lerp(dirt, 1 - smooth(4, 9, dz));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.receiveShadow = true; scene.add(m);
})();
const waterMat = new THREE.MeshPhongMaterial({ color: 0x2b6f99, specular: 0x667788, shininess: 60, transparent: true, opacity: 0.95 });
const waterGeo = new THREE.PlaneGeometry(3400, 3400, 80, 80); waterGeo.rotateX(-Math.PI / 2);
const water = new THREE.Mesh(waterGeo, waterMat); water.position.y = WATER_Y; water.receiveShadow = true; scene.add(water);
const waterBase = Float32Array.from(waterGeo.attributes.position.array);
let waterFrame = 0;
function updateWater(t) {
  if ((waterFrame++ & 1) === 1) return;
  const p = waterGeo.attributes.position; const a = p.array;
  for (let i = 0; i < p.count; i++) { const x = waterBase[i * 3], z = waterBase[i * 3 + 2]; a[i * 3 + 1] = Math.sin(x * 0.05 + t * 0.9) * 0.18 + Math.cos(z * 0.07 + t * 0.7) * 0.15; }
  p.needsUpdate = true; waterGeo.computeVertexNormals();
}

// ---------------------------------------------------------------- Yağlanmış kütükler
const logGeo = new THREE.CylinderGeometry(0.26, 0.26, 6.0, 10); logGeo.rotateX(Math.PI / 2);
const logMat = new THREE.MeshStandardMaterial({ color: 0x5b3a1c, roughness: 0.28, metalness: 0.05 });
const LOG_SP = 1.9; const NLOG = Math.floor((S_SHORE + 2) / LOG_SP);
const logs = new THREE.InstancedMesh(logGeo, logMat, NLOG); logs.receiveShadow = true;
const logBase = [];
const _m4 = new THREE.Matrix4(), _v = new THREE.Vector3(), _qq = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
for (let i = 0; i < NLOG; i++) { const s = i * LOG_SP + 2; pathAt(s, _p); const y = groundH(_p.x, _p.z) + 0.3; const yaw = Math.atan2(_p.tx, _p.tz);
  logBase.push({ x: _p.x, y, z: _p.z, yaw }); _e.set(0, yaw + Math.PI / 2, 0); _qq.setFromEuler(_e); _v.set(_p.x, y, _p.z); _m4.compose(_v, _qq, _one); logs.setMatrixAt(i, _m4); }
scene.add(logs);
function rollLogs(shipS) {
  const a = Math.floor((shipS - 14) / LOG_SP), b = Math.ceil((shipS + 14) / LOG_SP);
  for (let i = Math.max(0, a); i < Math.min(NLOG, b); i++) { const L = logBase[i];
    _e.set(0, L.yaw + Math.PI / 2, shipS * 1.6, "YXZ"); _qq.setFromEuler(_e); _v.set(L.x, L.y, L.z); _m4.compose(_v, _qq, _one); logs.setMatrixAt(i, _m4); }
  logs.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- Kanvas dokuları
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function roundRect(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
const signTex = canvasTex(512, 168, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9a6a3a'); g.addColorStop(1, '#6e4521'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(40,20,5,.35)'; x.lineWidth = 2; for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo(0, h * i / 3); x.lineTo(w, h * i / 3 + 4); x.stroke(); }
  const r = srand(3); for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(50,25,8,${0.08 + r() * 0.12})`; x.beginPath(); const y = r() * h; x.moveTo(0, y); x.bezierCurveTo(w * .3, y + r() * 8 - 4, w * .6, y + r() * 8 - 4, w, y); x.stroke(); }
  x.strokeStyle = '#3a200c'; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10);
  x.fillStyle = '#2a1405'; [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 6, 0, 7); x.fill(); });
  x.font = 'bold 64px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(255,230,180,.35)'; x.fillText('İzzet Topaktaş', w / 2 + 2, h / 2 + 4);
  x.fillStyle = '#2a1405'; x.fillText('İzzet Topaktaş', w / 2, h / 2 + 2);
});
const flagTex = canvasTex(256, 160, (x, w, h) => {
  x.fillStyle = '#c3141c'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.beginPath(); x.arc(w * .42, h / 2, h * .3, 0, 7); x.fill();
  x.fillStyle = '#c3141c'; x.beginPath(); x.arc(w * .47, h / 2, h * .245, 0, 7); x.fill(); x.fillStyle = '#fff';
  const cx = w * .64, cy = h / 2, R = h * .12, r = R * .42; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.fill();
});
const sailTex = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#efe4c8'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(180,30,35,.9)'; for (let i = 0; i < 5; i++) x.fillRect(0, i * 52 + 18, w, 14); x.strokeStyle = 'rgba(120,90,60,.25)'; for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(i * 22, 0); x.lineTo(i * 22, h); x.stroke(); } });

// ---------------------------------------------------------------- Kadırga
function makeGalley(scale = 1) {
  const grp = new THREE.Group(); const parts = [];
  const L = 20, n = 26, m = 10; const pos = [], col = [], idx = [];
  const brown = new THREE.Color('#5a3416'), red = new THREE.Color('#9e1c22'), gold = new THREE.Color('#d9a441'), dark = new THREE.Color('#3a2110');
  for (let i = 0; i <= n; i++) { const t = i / n; const x = (t - 0.5) * L;
    const w = 2.5 * Math.pow(Math.sin(Math.PI * clamp(t * 1.04 - 0.02, 0, 1)), 0.55) + 0.05;
    const sheer = 2.3 + 1.6 * Math.pow(Math.abs(t - 0.5) * 2, 2.5); const depth = 1.7 * Math.pow(Math.sin(Math.PI * t), 0.4) + 0.1;
    for (let j = 0; j <= m; j++) { const a = -Math.PI / 2 + Math.PI * j / m; const z = Math.sin(a) * w; const yb = -Math.cos(a) * depth;
      const y = j === 0 || j === m ? sheer : lerp(sheer - 0.6, yb + 0.6, Math.pow(Math.cos(a), 0.6)); pos.push(x, y, z);
      const c = y > sheer - 0.35 ? gold : y > sheer - 0.9 ? red : (y < 0.4 ? dark : brown); col.push(c.r, c.g, c.b); } }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = i * (m + 1) + j, b = a + m + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const hull = new THREE.BufferGeometry(); hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hull.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); hull.setIndex(idx); hull.computeVertexNormals();
  const hullM = new THREE.Mesh(hull, VC({ side: THREE.DoubleSide })); hullM.castShadow = true; grp.add(hullM);
  const P = (g, c, mm) => parts.push(part(g, c, mm));
  P(new THREE.BoxGeometry(L * 0.86, 0.15, 4.2), '#a07444', M(0, 2.0, 0));
  P(new THREE.BoxGeometry(3.6, 1.6, 4.0), '#8e1c22', M(-L * 0.36, 2.9, 0)); P(new THREE.BoxGeometry(3.9, 0.22, 4.4), '#d9a441', M(-L * 0.36, 3.75, 0));
  P(new THREE.ConeGeometry(1.6, 1.4, 4), '#7a1418', M(-L * 0.36, 4.5, 0, 0, Math.PI / 4));
  P(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), '#6a4424', M(-L * 0.36, 5.6, 0));
  P(new THREE.CylinderGeometry(0.12, 0.25, 3.4, 6), '#d9a441', M(L * 0.5 + 0.6, 3.6, 0, 0, 0, -0.9));
  P(new THREE.SphereGeometry(0.3, 8, 6), '#d9a441', M(L * 0.5 + 1.9, 4.6, 0));
  P(new THREE.CylinderGeometry(0.2, 0.26, 12, 8), '#6a4424', M(1.5, 8, 0)); P(new THREE.CylinderGeometry(0.16, 0.2, 9, 8), '#6a4424', M(-4.5, 6.5, 0));
  P(new THREE.CylinderGeometry(0.1, 0.1, 15, 6), '#7a5030', M(1.5, 10.5, 0, 0, 0, 1.1)); P(new THREE.CylinderGeometry(0.08, 0.08, 11, 6), '#7a5030', M(-4.5, 8.5, 0, 0, 0, 1.1));
  for (let i = 0; i < 9; i++) { const x = -6 + i * 1.6; for (const sd of [-1, 1]) P(new THREE.BoxGeometry(0.12, 0.12, 5), '#c49a62', M(x, 2.9, sd * 3.6, sd * 0.55, 0, 0)); }
  for (let i = 0; i < 7; i++) for (const sd of [-1, 1]) P(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 10), i % 2 ? '#c3141c' : '#d9a441', M(-5 + i * 1.8, 2.55, sd * 2.45, Math.PI / 2, 0, 0));
  P(new THREE.CylinderGeometry(0.18, 0.22, 0.5, 8), '#ffcf6a', M(-L * 0.36 - 1.9, 4.2, 1.3)); P(new THREE.CylinderGeometry(0.18, 0.22, 0.5, 8), '#ffcf6a', M(-L * 0.36 - 1.9, 4.2, -1.3));
  const deco = new THREE.Mesh(merge(parts), VC()); deco.castShadow = true; grp.add(deco);
  const sailG = (h, w) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -w, h * 0.15, 0, w * 0.55, h, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0, 0, 0.2, 1, 1], 2)); g.computeVertexNormals(); return g; };
  const sailM = new THREE.MeshLambertMaterial({ map: sailTex, side: THREE.DoubleSide });
  const s1 = new THREE.Mesh(sailG(11, 6.5), sailM); s1.position.set(2.4, 3.6, 0.3); s1.castShadow = true; grp.add(s1);
  const s2 = new THREE.Mesh(sailG(8, 4.6), sailM); s2.position.set(-3.8, 3.4, 0.25); s2.castShadow = true; grp.add(s2);
  const flagGeo = new THREE.PlaneGeometry(2.6, 1.6, 8, 2);
  const flagM = new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide });
  const flags = [];
  for (const [x, y] of [[1.5, 14.3], [-4.5, 11.2], [-L * 0.36, 6.4]]) {
    const f = new THREE.Mesh(flagGeo.clone(), flagM); f.position.set(x - 1.3, y, 0); f.userData.base = Float32Array.from(f.geometry.attributes.position.array); grp.add(f); flags.push(f); }
  grp.userData.flags = flags; grp.scale.setScalar(scale);
  return grp;
}
const ship = makeGalley(1); scene.add(ship);
function waveFlags(grp, t) { for (const f of grp.userData.flags) { const p = f.geometry.attributes.position; const b = f.userData.base;
  for (let i = 0; i < p.count; i++) { const x = b[i * 3]; const k = (1.3 - x) / 2.6; p.array[i * 3 + 2] = Math.sin(t * 6 - x * 2.4) * 0.25 * k; } p.needsUpdate = true; } }
const moored = [];
for (let i = 0; i < 3; i++) { const g = makeGalley(0.8); pathAt(PATH_LEN, _p); g.position.set(_p.x + 40 + i * 28, WATER_Y - 0.3, _p.z - 55 - i * 22); g.rotation.y = 0.6 + i * 0.4; scene.add(g); moored.push(g); }

// ---------------------------------------------------------------- Karakterler
const skin = '#f0c39a';
function charGeos(vest, anon) {
  const b = []; const P = (g, c, m) => b.push(part(g, c, m));
  P(new THREE.CylinderGeometry(0.3, 0.34, 0.72, 10), '#f1ead8', M(0, 1.22, 0));
  P(new THREE.CylinderGeometry(0.335, 0.375, 0.56, 12, 1, false, 0.55, Math.PI * 2 - 1.1), vest, M(0, 1.27, 0));
  P(new THREE.CylinderGeometry(0.355, 0.355, 0.13, 12), '#e0b33a', M(0, 0.94, 0));
  P(new THREE.SphereGeometry(0.27, 14, 10), skin, M(0, 1.8, 0));
  P(new THREE.SphereGeometry(0.06, 6, 5), '#e6a77d', M(0, 1.79, 0.26));
  P(new THREE.SphereGeometry(0.037, 6, 5), '#111', M(0.095, 1.86, 0.235)); P(new THREE.SphereGeometry(0.037, 6, 5), '#111', M(-0.095, 1.86, 0.235));
  P(new THREE.BoxGeometry(0.24, 0.055, 0.06), '#3a2414', M(0, 1.72, 0.25));
  P(new THREE.CylinderGeometry(0.2, 0.25, 0.6, 12), anon ? '#d9d2c2' : '#f6f2e8', M(0, 2.18, -0.04, -0.18, 0, 0));
  P(new THREE.CylinderGeometry(0.262, 0.262, 0.08, 12), anon ? '#8a7a5a' : '#d9a441', M(0, 1.95, 0));
  P(new THREE.BoxGeometry(0.05, 0.42, 0.22), anon ? '#d9d2c2' : '#f6f2e8', M(0, 2.0, -0.32, 0.35, 0, 0));
  return merge(b);
}
const charMat = VC();
const legGeo = merge([part(new THREE.BoxGeometry(0.24, 0.62, 0.26), '#2b3a67', M(0, -0.31, 0)), part(new THREE.BoxGeometry(0.22, 0.2, 0.34), '#3a2210', M(0, -0.72, 0.05))]);
const armGeo = merge([part(new THREE.CylinderGeometry(0.085, 0.08, 0.6, 7), '#f1ead8', M(0, -0.3, 0)), part(new THREE.SphereGeometry(0.095, 7, 6), skin, M(0, -0.63, 0))]);
const bodyCrew = charGeos('#c0262d', false), bodyAnon = charGeos('#35507e', true);
function makeChar(anon) {
  const root = new THREE.Group(); const pivot = new THREE.Group(); root.add(pivot);
  const body = new THREE.Mesh(anon ? bodyAnon : bodyCrew, charMat); body.castShadow = true; pivot.add(body);
  const legL = new THREE.Mesh(legGeo, charMat), legR = new THREE.Mesh(legGeo, charMat); legL.position.set(0.13, 0.86, 0); legR.position.set(-0.13, 0.86, 0); legL.castShadow = legR.castShadow = true; root.add(legL, legR);
  const armL = new THREE.Mesh(armGeo, charMat), armR = new THREE.Mesh(armGeo, charMat); armL.position.set(0.4, 1.52, 0); armR.position.set(-0.4, 1.52, 0); armL.castShadow = armR.castShadow = true; pivot.add(armL, armR);
  root.userData = { pivot, legL, legR, armL, armR, phase: Math.random() * 6 };
  return root;
}
function animChar(c, dt, speed, pose, cheer) {
  const u = c.userData; u.phase += dt * (2.2 + speed * 2.2);
  const sw = Math.sin(u.phase);
  u.legL.rotation.x = cheer ? 0 : sw * 0.55; u.legR.rotation.x = cheer ? 0 : -sw * 0.55;
  if (cheer) { u.pivot.rotation.x = 0; u.armL.rotation.x = Math.PI + Math.sin(u.phase * 1.5) * 0.3; u.armR.rotation.x = Math.PI + Math.cos(u.phase * 1.5) * 0.3; u.armL.rotation.z = -0.3; u.armR.rotation.z = 0.3; c.position.y += Math.abs(Math.sin(u.phase * 1.2)) * 0.35; return; }
  u.armL.rotation.z = 0; u.armR.rotation.z = 0;
  if (pose === 'push') { u.pivot.rotation.x = 0.42; u.armL.rotation.x = -1.45 + sw * 0.08; u.armR.rotation.x = -1.45 - sw * 0.08; }
  else if (pose === 'pull') { u.pivot.rotation.x = 0.5; u.armL.rotation.x = 0.55 + sw * 0.1; u.armR.rotation.x = 0.55 - sw * 0.1; u.armL.rotation.z = -0.25; u.armR.rotation.z = 0.25; }
  else { u.pivot.rotation.x = 0.05; u.armL.rotation.x = -sw * 0.4; u.armR.rotation.x = sw * 0.4; }
}

// ---------------------------------------------------------------- Etiketler (isim + profil resmi)
const avatarCache = new Map();
function hashCol(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return `hsl(${Math.abs(h) % 360},55%,42%)`; }
function initials(name) { return (name || '?').trim().slice(0, 1).toLocaleUpperCase('tr-TR'); }
function avatarUrl(u) { if (!u) return ''; if (/^data:|^blob:/.test(u)) return u; return wsBase().http + '/avatar?url=' + encodeURIComponent(u); }
function loadAvatar(person) {
  if (!person.pic) return Promise.resolve(null);
  if (avatarCache.has(person.pic)) return avatarCache.get(person.pic);
  const pr = new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = avatarUrl(person.pic); setTimeout(() => res(null), 8000); });
  avatarCache.set(person.pic, pr); if (avatarCache.size > 500) avatarCache.delete(avatarCache.keys().next().value); return pr;
}
function drawAvatar(x, im, name, cx, cy, r) {
  x.save(); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.closePath(); x.clip();
  if (im) x.drawImage(im, cx - r, cy - r, r * 2, r * 2); else { x.fillStyle = hashCol(name); x.fillRect(cx - r, cy - r, r * 2, r * 2); x.fillStyle = '#fff'; x.font = `bold ${r * 1.1}px -apple-system,Arial`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(initials(name), cx, cy + 2); }
  x.restore(); x.strokeStyle = '#f4d27a'; x.lineWidth = 4; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
}
function fitName(x, name, maxW) { let n = name; while (x.measureText(n).width > maxW && n.length > 3) n = n.slice(0, -1); return n === name ? n : n + '…'; }
function nameSprite(person) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 84; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, fog: false })); sp.renderOrder = 10; sp.userData.base = [3.3, 0.87];
  const draw = (im) => { const x = c.getContext('2d'); x.clearRect(0, 0, 320, 84);
    x.font = 'bold 30px -apple-system,"Segoe UI",Arial'; const name = fitName(x, person.name, 215);
    const tw = x.measureText(name).width; const W = Math.min(316, tw + 96); const X0 = (320 - W) / 2;
    x.fillStyle = 'rgba(30,15,6,.82)'; roundRect(x, X0, 6, W, 72, 36); x.fill(); x.strokeStyle = '#c9993e'; x.lineWidth = 3; x.stroke();
    drawAvatar(x, im, person.name, X0 + 38, 42, 28);
    x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText(name, X0 + 76, 43); tex.needsUpdate = true; };
  draw(null); loadAvatar(person).then(im => { if (im) draw(im); });
  return sp;
}
function fatihSprite(person) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 170; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, fog: false })); sp.renderOrder = 11; sp.userData.base = [6.2, 2.06];
  const draw = (im) => { const x = c.getContext('2d'); x.clearRect(0, 0, 512, 170);
    x.fillStyle = 'rgba(110,18,22,.9)'; roundRect(x, 16, 4, 480, 70, 20); x.fill(); x.strokeStyle = '#f4d27a'; x.lineWidth = 4; x.stroke();
    x.font = 'bold 40px Georgia,"Times New Roman",serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#f4d27a'; x.fillText('FATİH SULTAN MEHMET', 256, 41);
    if (person) { x.font = 'bold 34px -apple-system,"Segoe UI",Arial'; const name = fitName(x, person.name, 330);
      const tw = x.measureText(name).width; const W = tw + 100, X0 = 256 - W / 2; x.fillStyle = 'rgba(30,15,6,.85)'; roundRect(x, X0, 86, W, 76, 38); x.fill(); x.strokeStyle = '#c9993e'; x.lineWidth = 3; x.stroke();
      drawAvatar(x, im, person.name, X0 + 40, 124, 30); x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(name, X0 + 80, 125); }
    tex.needsUpdate = true; };
  draw(null); if (person) loadAvatar(person).then(im => { if (im) draw(im); });
  return sp;
}

// ---------------------------------------------------------------- Fatih ve beyaz at
function makeFatih() {
  const root = new THREE.Group(); const b = []; const P = (g, c, m) => b.push(part(g, c, m));
  const white = '#f4f1ea';
  P(new THREE.CapsuleGeometry(0.58, 1.5, 6, 12), white, M(0, 1.55, 0, Math.PI / 2, 0, 0));
  P(new THREE.CylinderGeometry(0.26, 0.38, 1.1, 10), white, M(0, 2.2, 1.05, 0.62, 0, 0));
  P(new THREE.BoxGeometry(0.36, 0.42, 0.85), white, M(0, 2.65, 1.55, 0.55, 0, 0));
  P(new THREE.BoxGeometry(0.3, 0.3, 0.3), '#e0d8cc', M(0, 2.45, 1.95, 0.55, 0, 0));
  P(new THREE.ConeGeometry(0.07, 0.22, 5), white, M(0.12, 3.0, 1.32)); P(new THREE.ConeGeometry(0.07, 0.22, 5), white, M(-0.12, 3.0, 1.32));
  P(new THREE.BoxGeometry(0.1, 0.5, 1.0), '#cfcfd4', M(0, 2.45, 0.9, 0.62, 0, 0));
  P(new THREE.SphereGeometry(0.045, 6, 5), '#111', M(0.19, 2.75, 1.6)); P(new THREE.SphereGeometry(0.045, 6, 5), '#111', M(-0.19, 2.75, 1.6));
  P(new THREE.CylinderGeometry(0.06, 0.16, 1.1, 6), '#d8d8dc', M(0, 1.45, -1.35, -0.5, 0, 0));
  P(new THREE.BoxGeometry(1.25, 0.1, 1.2), '#9e1c22', M(0, 2.1, -0.05)); P(new THREE.BoxGeometry(1.3, 0.06, 1.25), '#d9a441', M(0, 2.06, -0.05));
  P(new THREE.BoxGeometry(1.18, 0.5, 0.06), '#9e1c22', M(0, 1.85, 0.55));
  P(new THREE.BoxGeometry(0.22, 0.2, 0.7), '#1f5e43', M(0.4, 2.15, 0.15)); P(new THREE.BoxGeometry(0.22, 0.2, 0.7), '#1f5e43', M(-0.4, 2.15, 0.15));
  P(new THREE.BoxGeometry(0.16, 0.55, 0.2), '#3a2210', M(0.48, 1.85, 0.42)); P(new THREE.BoxGeometry(0.16, 0.55, 0.2), '#3a2210', M(-0.48, 1.85, 0.42));
  P(new THREE.CylinderGeometry(0.3, 0.46, 0.95, 12), '#1f6b4a', M(0, 2.62, 0));
  P(new THREE.CylinderGeometry(0.31, 0.31, 0.1, 12), '#d9a441', M(0, 2.45, 0));
  P(new THREE.CylinderGeometry(0.33, 0.3, 0.12, 12), '#7a5a3a', M(0, 3.07, 0));
  P(new THREE.CylinderGeometry(0.075, 0.07, 0.6, 7), '#1f6b4a', M(0.33, 2.75, 0.2, 0.9, 0, 0.1)); P(new THREE.CylinderGeometry(0.075, 0.07, 0.6, 7), '#1f6b4a', M(-0.33, 2.75, 0.2, 0.9, 0, -0.1));
  P(new THREE.SphereGeometry(0.08, 6, 5), skin, M(0.3, 2.6, 0.45)); P(new THREE.SphereGeometry(0.08, 6, 5), skin, M(-0.3, 2.6, 0.45));
  P(new THREE.SphereGeometry(0.26, 14, 10), skin, M(0, 3.32, 0));
  P(new THREE.SphereGeometry(0.2, 10, 8), '#3b2416', M(0, 3.15, 0.12, 0, 0, 0, 1, 1.15, 0.8));
  P(new THREE.SphereGeometry(0.037, 6, 5), '#111', M(0.095, 3.38, 0.235)); P(new THREE.SphereGeometry(0.037, 6, 5), '#111', M(-0.095, 3.38, 0.235));
  P(new THREE.SphereGeometry(0.06, 6, 5), '#e6a77d', M(0, 3.32, 0.26));
  P(new THREE.SphereGeometry(0.44, 16, 12), '#fbf8f0', M(0, 3.66, -0.02, 0, 0, 0, 1, 0.82, 1));
  P(new THREE.CylinderGeometry(0.13, 0.15, 0.32, 10), '#b3161d', M(0, 3.95, -0.02));
  P(new THREE.SphereGeometry(0.06, 6, 5), '#d9a441', M(0, 3.62, 0.42));
  const mesh = new THREE.Mesh(merge(b), VC()); mesh.castShadow = true; root.add(mesh);
  const hl = new THREE.CylinderGeometry(0.11, 0.09, 1.15, 7); hl.translate(0, -0.575, 0);
  const hoof = new THREE.CylinderGeometry(0.12, 0.13, 0.16, 7); hoof.translate(0, -1.2, 0);
  const legG = merge([part(hl, white), part(hoof, '#55504a')]);
  const legs = [[0.3, 0.7], [-0.3, 0.7], [0.3, -0.75], [-0.3, -0.75]].map(([x, z]) => { const l = new THREE.Mesh(legG, charMat); l.position.set(x, 1.35, z); l.castShadow = true; root.add(l); return l; });
  root.userData = { legs, phase: 0 };
  return root;
}
const fatih = makeFatih(); scene.add(fatih);
let fatihLabel = fatihSprite(null); scene.add(fatihLabel);

// ---------------------------------------------------------------- Dekor
const decoParts = [];
{ // Galata Kulesi
  pathAt(70, _p); const gx = _p.x + 6, gz = _p.z + 48; const gy = groundH(gx, gz);
  const P = (g, c, m) => decoParts.push(part(g, c, m));
  P(new THREE.CylinderGeometry(4.2, 4.8, 30, 20), '#b9a88a', M(gx, gy + 15, gz)); P(new THREE.CylinderGeometry(4.9, 4.9, 1, 20), '#8f8068', M(gx, gy + 24, gz));
  P(new THREE.CylinderGeometry(4.5, 4.5, 4, 20), '#a8977a', M(gx, gy + 32, gz)); P(new THREE.CylinderGeometry(5.0, 5.0, 0.6, 20), '#7d6e58', M(gx, gy + 34.2, gz));
  P(new THREE.ConeGeometry(5.0, 9, 20), '#5a6a7a', M(gx, gy + 39, gz)); P(new THREE.SphereGeometry(0.45, 8, 6), '#d9a441', M(gx, gy + 43.8, gz));
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; P(new THREE.BoxGeometry(0.9, 2, 0.4), '#2b2218', M(gx + Math.cos(a) * 4.4, gy + 32, gz + Math.sin(a) * 4.4, 0, -a + Math.PI / 2, 0)); }
  for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + k; P(new THREE.BoxGeometry(0.5, 1.2, 0.3), '#3b3024', M(gx + Math.cos(a) * 4.6, gy + 6 + k * 5, gz + Math.sin(a) * 4.6, 0, -a + Math.PI / 2, 0)); }
  for (let i = 0; i < 9; i++) { const x = gx - 40 + i * 10, z = gz + 14 + Math.sin(i) * 3; P(new THREE.BoxGeometry(10, 5, 1.6), '#a89878', M(x, groundH(x, z) + 2, z)); if (i % 2 === 0) P(new THREE.BoxGeometry(3, 8, 3), '#9a8a6c', M(x, groundH(x, z) + 3.5, z)); }
}
const torchPos = [];
{ // çadırlar (ordugâh)
  const r = srand(11); const tentList = [];
  const tentG = new THREE.ConeGeometry(2.4, 3.2, 8); tentG.translate(0, 1.6, 0);
  const N = 90; const inst = new THREE.InstancedMesh(tentG, new THREE.MeshLambertMaterial(), N); let n = 0;
  const bigG = new THREE.CylinderGeometry(3.8, 3.8, 2.4, 12); bigG.translate(0, 1.2, 0); const bigTop = new THREE.ConeGeometry(4.3, 3, 12); bigTop.translate(0, 3.9, 0);
  const pavInst = new THREE.InstancedMesh(merge([part(bigG, '#b3161d'), part(bigTop, '#d9a441')]), VC(), 14); let pn = 0;
  const cols = ['#f1e8d4', '#eadcc0', '#f4efe2', '#d9c7a0'].map(c => new THREE.Color(c));
  for (let i = 0; i < 400 && n < N; i++) { const s = r() * S_SHORE * 0.92 + 8; const side = r() < 0.5 ? -1 : 1; const lat = side * (15 + r() * 45);
    const w = worldAt(s, lat); if (w.y < WATER_Y + 1.5) continue;
    if (pn < 14 && r() < 0.12) { _m4.compose(w, _qq.identity(), _one); pavInst.setMatrixAt(pn++, _m4); continue; }
    _m4.compose(w, _qq.setFromEuler(_e.set(0, r() * 3, 0)), _v.setScalar(0.8 + r() * 0.5)); inst.setMatrixAt(n, _m4); inst.setColorAt(n, pick(cols)); n++; tentList.push(w.clone()); }
  inst.count = n; pavInst.count = pn; inst.castShadow = true; pavInst.castShadow = true; scene.add(inst, pavInst);
  for (let i = 0; i < tentList.length; i += 4) { const w = tentList[i]; decoParts.push(part(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4), '#5a3a1c', M(w.x, w.y + 3.6, w.z)), part(new THREE.BoxGeometry(0.02, 0.4, 0.7), '#c3141c', M(w.x, w.y + 4.2, w.z + 0.35))); }
}
{ // meşaleler
  for (let s = 10; s < S_SHORE - 4; s += 13) for (const side of [-1, 1]) { const w = worldAt(s + (side > 0 ? 6 : 0), side * 7.2); torchPos.push(w.x, w.y + 2.75, w.z);
    decoParts.push(part(new THREE.CylinderGeometry(0.07, 0.1, 2.6, 5), '#4a2e14', M(w.x, w.y + 1.3, w.z)), part(new THREE.CylinderGeometry(0.2, 0.12, 0.35, 6), '#2a1a0a', M(w.x, w.y + 2.6, w.z))); }
}
const torchGeo = new THREE.BufferGeometry(); torchGeo.setAttribute('position', new THREE.Float32BufferAttribute(torchPos, 3));
{ const seeds = new Float32Array(torchPos.length / 3); for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random() * 100; torchGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1)); }
const torchMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uI: { value: 1 }, uScale: { value: 600 } },
  vertexShader: `attribute float seed; uniform float uT, uScale; varying float vF; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); float f = 0.85+0.15*sin(uT*13.+seed)+0.1*sin(uT*7.3+seed*2.); vF=f; gl_PointSize = min(uScale*f/(-mv.z), 256.); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform float uI; varying float vF; void main(){ vec2 d = gl_PointCoord-vec2(.5,.62); d.x*=1.6; float r = length(d); float core = smoothstep(.3,.0,r); float glow = smoothstep(.5,.0,length(gl_PointCoord-.5))*.5; vec3 c = mix(vec3(1.,.35,.05), vec3(1.,.9,.5), core); gl_FragColor = vec4(c*(core+glow*uI)*vF, clamp(core*.9+glow*uI,0.,1.)); }` });
const torches = new THREE.Points(torchGeo, torchMat); torches.frustumCulled = false; scene.add(torches);
{ // "İzzet Topaktaş" tabelaları
  const boardG = new THREE.BoxGeometry(3.3, 1.08, 0.12); const wood = new THREE.MeshLambertMaterial({ color: 0x6e4521 }); const face = new THREE.MeshLambertMaterial({ map: signTex });
  const mats = [wood, wood, wood, wood, face, face];
  let k = 0; for (let s = 24; s < S_SHORE - 6; s += 30, k++) { const side = k % 2 ? -1 : 1; const w = worldAt(s, side * 9.2); pathAt(s, _p);
    const b = new THREE.Mesh(boardG, mats); b.position.set(w.x, w.y + 1.95, w.z); b.rotation.y = Math.atan2(_p.tx, _p.tz) + Math.PI / 2 - side * 0.45; b.castShadow = true; scene.add(b);
    decoParts.push(part(new THREE.BoxGeometry(0.16, 2.2, 0.16), '#4a2e14', M(w.x - 1.2 * _p.tx, w.y + 1.1, w.z - 1.2 * _p.tz)), part(new THREE.BoxGeometry(0.16, 2.2, 0.16), '#4a2e14', M(w.x + 1.2 * _p.tx, w.y + 1.1, w.z + 1.2 * _p.tz))); }
}
{ // servi ağaçları
  const r = srand(21); const g = merge([part(new THREE.ConeGeometry(1, 1, 7), '#1f3d22', M(0, 0.5, 0)), part(new THREE.CylinderGeometry(0.12, 0.15, 0.25, 5), '#4a2e14', M(0, -0.1, 0))]);
  const inst = new THREE.InstancedMesh(g, VC(), 260); let n = 0;
  for (let i = 0; i < 900 && n < 260; i++) { const x = r() * 590 - 260, z = r() * 300 - 120 + (r() < 0.25 ? -170 : 0); const u = clamp((x - PX0) / 400, 0, 1);
    const dzt = z - zPath(u); if (x > PX0 - 5 && x < PX1 + 5 && (Math.abs(dzt) < 12 || (dzt > 0 && dzt < 95))) continue; const h = groundH(x, z); if (h < WATER_Y + 1.2) continue;
    _m4.compose(_v.set(x, h, z), _qq.identity(), new THREE.Vector3(1.2 + r(), 7 + r() * 6, 1.2 + r())); inst.setMatrixAt(n++, _m4); }
  inst.count = n; inst.castShadow = true; scene.add(inst);
}
const cannons = [];
{ for (let i = 0; i < 3; i++) { const s = S_SHORE - 26 + i * 7; const w = worldAt(s, -13 - i * 1.5); pathAt(s, _p);
    const wheel = (x, z) => part(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 10), '#3a2410', M(x, 0.45, z, 0, 0, Math.PI / 2));
    const m = merge([part(new THREE.BoxGeometry(1.4, 0.5, 2.2), '#5a3a1c', M(0, 0.55, 0)), wheel(0.75, 0.6), wheel(-0.75, 0.6), wheel(0.75, -0.6), wheel(-0.75, -0.6), part(new THREE.CylinderGeometry(0.28, 0.4, 2.8, 12), '#b08a3a', M(0, 1.15, 0.3, Math.PI / 2 - 0.35, 0, 0))]);
    const g = new THREE.Group(); const mesh = new THREE.Mesh(m, VC()); mesh.castShadow = true; g.add(mesh); g.position.copy(w); g.rotation.y = Math.atan2(_p.tx, _p.tz) + 0.9; scene.add(g);
    cannons.push({ g, muzzle: new THREE.Vector3(0, 1.6, 1.7) }); } }
const windowPos = [];
{ // İstanbul silüeti (karşı kıyı)
  const r = srand(31); const dome = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const boxes = [], domes = [], mins = [], caps = [];
  for (let x = -330; x < 470; x += 5 + r() * 5) { const z = -238 - r() * 40; const h = 4 + r() * 6; const y = groundH(x, z); if (y < WATER_Y) continue; boxes.push([x, y + h / 2, z, 4 + r() * 4, h, 4 + r() * 3, ['#c9b79a', '#b9a080', '#d8c8a8', '#a88c70'][(r() * 4) | 0]]);
    if (r() < 0.5) windowPos.push(x + rand(-1.5, 1.5), y + h * 0.6, z + 3); }
  const big = [[-120, -262, 15, 4], [-20, -250, 11, 2], [80, -270, 13, 4], [180, -255, 10, 2], [260, -275, 12, 4], [-220, -265, 9, 2], [360, -262, 9, 2], [20, -300, 14, 4]];
  for (const [x, z, R, nm] of big) { const y = groundH(x, z); boxes.push([x, y + R * 0.6, z, R * 2.4, R * 1.2, R * 2.4, '#cbbca0']); domes.push([x, y + R * 1.2, z, R]);
    for (const d of [-1, 1]) domes.push([x + d * R * 1.1, y + R * 1.0, z, R * 0.55]);
    const mp = nm === 4 ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : [[-1, 0], [1, 0]];
    for (const [a, b] of mp) { const mx = x + a * R * 1.45, mz = z + b * R * 1.45; mins.push([mx, y + R * 1.7, mz, R * 3.4]); caps.push([mx, y + R * 3.4 + R * 0.4, mz, R * 0.8]); } }
  const add = (geo, list, color, fn) => { const inst = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color }), list.length); list.forEach((it, i) => { fn(it); inst.setMatrixAt(i, _m4); }); scene.add(inst); };
  const bi = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), boxes.length);
  boxes.forEach((b, i) => { _m4.compose(_v.set(b[0], b[1], b[2]), _qq.identity(), new THREE.Vector3(b[3], b[4], b[5])); bi.setMatrixAt(i, _m4); bi.setColorAt(i, new THREE.Color(b[6])); }); scene.add(bi);
  add(dome, domes, '#8a9aa8', d => _m4.compose(_v.set(d[0], d[1], d[2]), _qq.identity(), new THREE.Vector3(d[3], d[3] * 0.9, d[3])));
  add(new THREE.CylinderGeometry(0.5, 0.6, 1, 10), mins, '#d8ccb4', d => _m4.compose(_v.set(d[0], d[1], d[2]), _qq.identity(), new THREE.Vector3(d[3] * 0.12, d[3], d[3] * 0.12)));
  add(new THREE.ConeGeometry(0.5, 1, 10), caps, '#6c7c8c', d => _m4.compose(_v.set(d[0], d[1], d[2]), _qq.identity(), new THREE.Vector3(d[3] * 0.22, d[3], d[3] * 0.22)));
  for (let x = -330; x < 470; x += 14) { const z = -228; const y = groundH(x, z); decoParts.push(part(new THREE.BoxGeometry(14, 6, 2), '#a8987a', M(x, y + 2.5, z))); if (((x + 330) / 14 | 0) % 3 === 0) decoParts.push(part(new THREE.BoxGeometry(4, 10, 4), '#9a8a6c', M(x, y + 4.5, z))); }
}
const windowGeo = new THREE.BufferGeometry(); windowGeo.setAttribute('position', new THREE.Float32BufferAttribute(windowPos, 3));
const windowMat = new THREE.PointsMaterial({ color: 0xffc070, size: 1.6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
scene.add(new THREE.Points(windowGeo, windowMat));
{ const m = new THREE.Mesh(merge(decoParts), VC()); m.castShadow = true; m.receiveShadow = true; scene.add(m); }

// ---------------------------------------------------------------- Halat
const ropeMat = new THREE.MeshLambertMaterial({ color: 0xc8a46a });
const ropes = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), ropeMat); m.castShadow = true; scene.add(m); return m; });
const _up = new THREE.Vector3(0, 1, 0);
function placeRope(mesh, a, b) { _v.subVectors(b, a); const len = _v.length(); mesh.position.copy(a).addScaledVector(_v, 0.5); mesh.scale.set(1, len, 1); mesh.quaternion.setFromUnitVectors(_up, _v.normalize()); }

// ---------------------------------------------------------------- Duman / selam parçacıkları
const smokeTex = canvasTex(128, 128, (x, w, h) => { const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.5, 'rgba(230,230,230,.45)'); g.addColorStop(1, 'rgba(220,220,220,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
const flashTex = canvasTex(128, 128, (x, w, h) => { const g = x.createRadialGradient(64, 64, 2, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.3, 'rgba(255,190,80,.8)'); g.addColorStop(1, 'rgba(255,120,20,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
const fx = [];
function spawnFx(pos, kind) {
  const n = kind === 'flash' ? 1 : kind === 'splash' ? 10 : 7;
  for (let i = 0; i < n; i++) {
    const mat = new THREE.SpriteMaterial({ map: kind === 'flash' ? flashTex : smokeTex, transparent: true, depthWrite: false, color: kind === 'splash' ? 0xddeeff : 0xffffff, blending: kind === 'flash' ? THREE.AdditiveBlending : THREE.NormalBlending });
    const sp = new THREE.Sprite(mat); sp.position.copy(pos); scene.add(sp);
    const v = kind === 'flash' ? new THREE.Vector3() : kind === 'splash' ? new THREE.Vector3(rand(-3, 3), rand(3, 7), rand(-3, 3)) : new THREE.Vector3(rand(-1, 1), rand(1.5, 3.5), rand(-1, 1));
    fx.push({ sp, v, t: 0, life: kind === 'flash' ? 0.35 : kind === 'splash' ? 1.4 : 3.2, kind, s0: kind === 'flash' ? 6 : kind === 'splash' ? 1.2 : 2 });
  }
}
function updateFx(dt) { for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; const k = f.t / f.life;
  if (k >= 1) { scene.remove(f.sp); f.sp.material.dispose(); fx.splice(i, 1); continue; }
  f.sp.position.addScaledVector(f.v, dt); if (f.kind === 'splash') f.v.y -= 9 * dt; else f.v.multiplyScalar(1 - dt * 0.6);
  const s = f.kind === 'flash' ? f.s0 * (1 - k * 0.5) : f.s0 * (1 + k * 4); f.sp.scale.set(s, s, s); f.sp.material.opacity = (1 - k) * (f.kind === 'smoke' ? 0.85 : 1); } }

// ---------------------------------------------------------------- Ses
let actx = null, master = null, sfxGain = null, drumGain = null, noiseBuf = null;
const musicEl = new Audio(); musicEl.loop = true; musicEl.preload = 'auto'; musicEl.setAttribute('playsinline', '');
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.connect(actx.destination);
    sfxGain = actx.createGain(); sfxGain.connect(master); drumGain = actx.createGain(); drumGain.connect(master); applyVolumes(); } catch {}
}
function applyVolumes() { if (sfxGain) sfxGain.gain.value = S.sfxVol; if (drumGain) drumGain.gain.value = S.drumOn ? S.drumVol : 0; musicEl.volume = S.musicVol; }
function boom(vol = 1) { if (!actx) return; const t = actx.currentTime;
  if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2); }
  const src = actx.createBufferSource(); src.buffer = noiseBuf; const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(80, t + 1.5);
  const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.2 * vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
  src.connect(lp); lp.connect(g); g.connect(sfxGain); src.start(t); src.stop(t + 2);
  const o = actx.createOscillator(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.6); const og = actx.createGain(); og.gain.setValueAtTime(0.9 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.7); o.connect(og); og.connect(sfxGain); o.start(t); o.stop(t + 0.8); }
function drumHit(low) { if (!actx || !S.drumOn) return; const t = actx.currentTime; const o = actx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(low ? 95 : 160, t); o.frequency.exponentialRampToValueAtTime(low ? 45 : 90, t + 0.25);
  const g = actx.createGain(); g.gain.setValueAtTime(low ? 0.9 : 0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + (low ? 0.45 : 0.2)); o.connect(g); g.connect(drumGain); o.start(t); o.stop(t + 0.5); }
function chime() { if (!actx) return; const t = actx.currentTime; [523, 659, 784].forEach((f, i) => { const o = actx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t + i * 0.08); g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.08 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.5); o.connect(g); g.connect(sfxGain); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.6); }); }
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('fetih', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbPut(k, v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function idbGet(k) { const db = await idb(); return new Promise((res) => { const tx = db.transaction('files'); const q = tx.objectStore('files').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); }
async function idbDel(k) { const db = await idb(); return new Promise((res) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(k); tx.oncomplete = res; }); }
let musicName = '';
async function loadStoredMusic() { try { const rec = await idbGet('music'); if (rec && rec.blob) { musicEl.src = URL.createObjectURL(rec.blob); musicName = rec.name || 'müzik.mp3'; updateMusicUi(); } } catch {} }
function updateMusicUi() { $('mp3Name').textContent = musicName ? `Yüklü: ${musicName}` : 'Müzik yüklenmedi'; }

// ---------------------------------------------------------------- Oyun durumu
const G = {
  sefer: 1, progress: 0, state: 'march', stateT: 0, seferT: 0,
  crew: new Map(), rope: [], fatih: null, boosts: [], ledger: new Map(),
  pending: 0, pendingBy: [], speed: 0, viewers: 0, splashed: false,
};
const people = new Map();
function person(d) {
  const id = String(d.uniqueId || d.nickname || 'anon');
  let p = people.get(id);
  if (!p) { p = { id, name: String(d.nickname || d.uniqueId || 'İzleyici').slice(0, 40), pic: d.profilePictureUrl || '', lastActive: 0 }; people.set(id, p); }
  else { if (d.nickname) p.name = String(d.nickname).slice(0, 40); if (d.profilePictureUrl) p.pic = d.profilePictureUrl; }
  p.lastActive = performance.now();
  return p;
}
function credit(id, m) { if (!id || !(m > 0)) return; G.ledger.set(id, (G.ledger.get(id) || 0) + m); }
function baseSpeed() { return TOTAL / (Math.max(2, S.slowMin) * 60); }
function maxCrowdFactor() { return clamp(S.slowMin / Math.max(1, Math.min(S.fastMin, S.slowMin)), 1, 3); }

const crewVis = new Map(), ropeVis = new Map();
const anonPush = [], anonPull = [];
for (let i = 0; i < 6; i++) { const c = makeChar(true); scene.add(c); anonPush.push(c); }
for (let i = 0; i < 6; i++) { const c = makeChar(true); scene.add(c); anonPull.push(c); }
function visFor(map, p) { let v = map.get(p.id); if (!v) { const obj = makeChar(false); const label = nameSprite(p); scene.add(obj); scene.add(label); v = { obj, label, p, name: p.name, pic: p.pic }; map.set(p.id, v); }
  else if (v.name !== p.name || v.pic !== p.pic) { scene.remove(v.label); v.label.material.map.dispose(); v.label.material.dispose(); v.label = nameSprite(p); scene.add(v.label); v.name = p.name; v.pic = p.pic; }
  return v; }
function dropVis(map, id) { const v = map.get(id); if (!v) return; scene.remove(v.obj); scene.remove(v.label); v.label.material.map.dispose(); v.label.material.dispose(); map.delete(id); }

// ---------------------------------------------------------------- Olaylar (TikTok / demo)
function handleEvent(ev) {
  if (!ev || !ev.type) return;
  if (ev.type === 'viewers') { G.viewers = ev.count; $('ttViewers').textContent = ev.count ? `İzleyici: ${ev.count}` : ''; return; }
  if (ev.type === 'status') { setStatus(ev.state, ev.text); return; }
  if (ev.type === 'member') return;
  const k = S.interact;
  const p = person(ev);
  if (ev.type === 'chat') {
    const isNew = !G.crew.has(p.id);
    G.crew.set(p.id, p);
    addPending(p.id, (isNew ? 3 : 1) * k);
    if (isNew) card(p, `<b>${esc(p.name)}</b> tayfaya katıldı`);
  } else if (ev.type === 'like') {
    addPending(p.id, Math.min(4, 0.08 * (ev.likeCount || 1)) * k);
  } else if (ev.type === 'follow') {
    addPending(p.id, 8 * k); card(p, `<b>${esc(p.name)}</b> takip etti: gemi ileri atıldı`);
  } else if (ev.type === 'share') {
    addPending(p.id, 4 * k);
  } else if (ev.type === 'gift') {
    noteGift(ev);
    const act = giftAction(ev);
    if (act) doAction(act, p, ev.repeatCount || 1);
  }
}
function addPending(id, m) { if (!(m > 0)) return; if (G.state !== 'march') return; G.pending = Math.min(G.pending + m, 120); G.pendingBy.push([id, m]); if (G.pendingBy.length > 400) G.pendingBy.splice(0, 200); }
function giftList(str) { return String(str || '').split(',').map(s => s.trim().toLocaleLowerCase('tr-TR')).filter(Boolean); }
function giftAction(ev) {
  const name = String(ev.giftName || '').trim().toLocaleLowerCase('tr-TR'); const id = String(ev.giftId || '');
  for (const act of ['halat', 'fatih', 'destek']) { const L = giftList(S.gifts[act]); if (L.some(x => (name && x === name) || (id && x === id))) return act; }
  return null;
}
function doAction(act, p, count = 1) {
  if (act === 'halat') {
    const i = G.rope.indexOf(p.id); if (i >= 0) G.rope.splice(i, 1);
    G.rope.push(p.id);
    while (G.rope.length > S.ropeCap) dropVis(ropeVis, G.rope.shift());
    card(p, `<b>${esc(p.name)}</b> halata asıldı`);
  } else if (act === 'fatih') {
    G.fatih = p; scene.remove(fatihLabel); fatihLabel.material.map.dispose(); fatihLabel.material.dispose(); fatihLabel = fatihSprite(p); scene.add(fatihLabel);
    card(p, `<b>${esc(p.name)}</b> Fatih oldu: önde beyaz atla yürüyor`);
  } else if (act === 'destek') {
    const now = performance.now(); const last = Math.max(now, boostUntil(now));
    const until = Math.min(last + S.destekSec * 1000 * count, now + 15 * 60 * 1000);
    G.boosts.push({ id: p.id, start: last, until });
    card(p, `<b>${esc(p.name)}</b> destek verdi: yürüyüş hızlandı`);
  }
  chime();
}
const recentGifts = [];
function noteGift(ev) {
  const key = (ev.giftName || '') + '|' + (ev.giftId || ''); const i = recentGifts.findIndex(g => g.key === key); if (i >= 0) recentGifts.splice(i, 1);
  recentGifts.unshift({ key, name: ev.giftName || '', id: ev.giftId || '' }); if (recentGifts.length > 12) recentGifts.pop();
  if (!$('menu').classList.contains('hidden')) renderRecentGifts();
}

// ---------------------------------------------------------------- Kartlar ve HUD
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function avatarEl(p) {
  const fb = () => { const s = document.createElement('span'); s.className = 'av'; s.style.background = hashCol(p.name); s.textContent = initials(p.name); return s; };
  const u = avatarUrl(p.pic); if (!u) return fb();
  const im = new Image(); im.src = u; im.alt = ''; im.onerror = () => im.replaceWith(fb()); return im;
}
const cardQ = []; let cardTimer = 0;
function card(p, html) { cardQ.push({ p, html }); if (cardQ.length > 8) cardQ.splice(0, cardQ.length - 8); }
function pumpCards(dt) {
  cardTimer -= dt; const box = $('cards');
  if (cardTimer <= 0 && cardQ.length) { const c = cardQ.shift(); const el = document.createElement('div'); el.className = 'card'; el.appendChild(avatarEl(c.p)); const sp = document.createElement('span'); sp.innerHTML = c.html; el.appendChild(sp); box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => el.classList.add('out'), 3600); setTimeout(() => el.remove(), 4100); cardTimer = cardQ.length > 4 ? 0.5 : 0.9; }
}
function bigCard(html, ms = 5000) { const el = $('bigCard'); el.innerHTML = html; el.classList.add('show'); clearTimeout(bigCard.t); bigCard.t = setTimeout(() => el.classList.remove('show'), ms); }
function rowsInto(box, rows, emptyText) {
  box.textContent = '';
  if (!rows.length) { const d = document.createElement('div'); d.className = 'lr'; d.innerHTML = `<span class="n" style="opacity:.75">${emptyText}</span>`; box.appendChild(d); return; }
  rows.forEach(([id, m], i) => { const p = people.get(id) || { name: id, pic: '' }; const d = document.createElement('div'); d.className = 'lr';
    const r = document.createElement('span'); r.className = 'r'; r.textContent = i + 1; const n = document.createElement('span'); n.className = 'n'; n.textContent = p.name; const mm = document.createElement('span'); mm.className = 'm'; mm.textContent = fmtM(m) + ' m';
    d.append(r, avatarEl(p), n, mm); box.appendChild(d); });
}
let hudT = 0, lastLedgerKey = '';
function boostUntil(now) { let u = 0; for (const b of G.boosts) if (b.until > now) u = Math.max(u, b.until); return u; }
function updateHud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.25;
  $('seferLbl').textContent = `SEFER ${G.sefer}`;
  const f = clamp(G.progress / TOTAL, 0, 1); $('barFill').style.width = (f * 100).toFixed(2) + '%'; $('barShip').style.left = (f * 100).toFixed(2) + '%';
  const left = Math.max(0, TOTAL - G.progress); $('barTxt').textContent = left > 0.5 ? `Haliç'e ${fmtM(left)} m` : 'HALİÇ!';
  $('stFatih').textContent = G.fatih ? G.fatih.name : '—';
  const now = performance.now(); const bu = boostUntil(now);
  $('stDestek').textContent = bu > now ? `${Math.ceil((bu - now) / 1000)} sn` : '—';
  $('stHalat').textContent = `${G.rope.length}/${S.ropeCap}`;
  $('stTayfa').textContent = String(G.crew.size);
  const rows = [...G.ledger.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const key = rows.map(r => r[0] + ':' + Math.round(r[1])).join('|');
  if (key !== lastLedgerKey) { lastLedgerKey = key; rowsInto($('ledgerRows'), rows, 'Henüz kimse yok'); }
  document.body.classList.toggle('hideL', !S.showLedger); document.body.classList.toggle('hideS', !S.showStats);
}

// ---------------------------------------------------------------- Sefer akışı
function startSefer(first) {
  G.progress = 0; G.state = 'march'; G.stateT = 0; G.seferT = 0; G.ledger.clear(); G.pending = 0; G.pendingBy = []; G.splashed = false; lastLedgerKey = '-';
  shipS = S_START; shipSm = S_START;
  bigCard(`SEFER ${G.sefer} · GALATA'DAN HALİÇ'E<small>Kadırgalar karadan Haliç'e yürüyor</small>`, 5200);
  setShot(first ? 'genis' : 'yan');
}
function finishSefer() { G.state = 'arrive'; G.stateT = 0; salvo = 0; salvoT = 0.8; setShot('varis'); }
function showFinale() {
  G.state = 'finale'; G.stateT = 0;
  const rows = [...G.ledger.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  $('finaleSub').textContent = `SEFER ${G.sefer} Haliç'e indi · ${Math.floor(G.seferT / 60)} dk ${Math.floor(G.seferT % 60)} sn`;
  rowsInto($('finaleRows'), rows, 'Bu seferi isimsiz askerler taşıdı');
  $('finale').classList.add('show');
}

// ---------------------------------------------------------------- Kamera planları
const SHOTS = ['yan', 'on', 'kus', 'halat', 'gemi', 'genis', 'fatih', 'orbit', 'arka'];
let shot = 'genis', shotT = 0, shotDur = 9, shotSeed = 0, lastShots = [], camInit = true;
function setShot(name) { shot = name; shotT = 0; shotSeed = Math.random(); shotDur = name === 'varis' ? 999 : S.shotSec * (0.85 + Math.random() * 0.4); camInit = true; }
function nextShot() { let c; do { c = pick(SHOTS); } while (lastShots.includes(c) || c === shot); lastShots.push(c); if (lastShots.length > 3) lastShots.shift(); setShot(c); }
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tgtPos = new THREE.Vector3(), tgtLook = new THREE.Vector3();
let ropeLen = 10;
let camK = 1;
function camAt(ds, lat, up, out) { pathAt(clamp(shipSm + ds, 0, PATH_LEN), _q); out.set(_q.x + _q.nx * lat, 0, _q.z + _q.nz * lat); out.y = Math.max(groundH(out.x, out.z), WATER_Y) + up; return out; }
function updateCamera(dt) {
  shotT += dt; if (G.state === 'march' && shotT > shotDur) nextShot();
  const k = shotT / Math.max(1, Math.min(shotDur, 30)); const sd = shotSeed; const sg = sd < 0.5 ? 1 : -1; const K = camK = camera.aspect < 1 ? clamp(0.75 / camera.aspect, 1, 1.7) : 1;
  switch (shot) {
    case 'yan': camAt(-6 + k * 12, (26 + sd * 8) * K, (4 + sd * 4) * K, tgtPos); camAt(2, 0, 3.5, tgtLook); break;
    case 'on': camAt(bowOff + ropeLen + 18 * K - k * 6, 6.5 * sg, 4.2, tgtPos); camAt(2, 0, 4, tgtLook); break;
    case 'kus': camAt(-4 + k * 8, 14 * Math.sin(k * 1.2 + sd * 3), (34 - k * 6) * K, tgtPos); camAt(ropeLen * 0.4, 0, 0, tgtLook); break;
    case 'halat': camAt(bowOff + ropeLen + 4 - k * 1.5, 6.8 * sg * K, 3.6 + k * 0.6, tgtPos); camAt(bowOff + ropeLen * 0.3, 0, 2.2, tgtLook); break;
    case 'gemi': camAt(9.6 - k * 1.5, 0.3 * sg, 6.0, tgtPos); camAt(bowOff + ropeLen + 12, 0, 2.2, tgtLook); break;
    case 'genis': camAt(-34 + k * 18, (52 + sd * 16) * K, (14 + k * 6) * K, tgtPos); camAt(4, -40, 6, tgtLook); break;
    case 'fatih': camAt(bowOff + ropeLen + 13 - k * 2, 5.5 * sg, 3.2, tgtPos); camAt(bowOff + ropeLen + 6, 0, 3.4, tgtLook); break;
    case 'orbit': { const a = sd * 6 + k * 1.4; camAt(Math.cos(a) * 28 * K, Math.abs(Math.sin(a)) * 28 * K + 4, 10 * K, tgtPos); camAt(0, 0, 3, tgtLook); break; }
    case 'arka': camAt((-24 - k * 4) * K, 6 * sg + 3 * Math.sin(k * 2), 6.5 + k * 3, tgtPos); camAt(10, 0, 4, tgtLook); break;
    case 'varis': { pathAt(S_SHORE - 6, _q); tgtPos.set(_q.x + _q.nx * 34 + 10 * _q.tx, 0, _q.z + _q.nz * 34 + 10 * _q.tz); tgtPos.y = Math.max(groundH(tgtPos.x, tgtPos.z), WATER_Y) + 9; tgtLook.set(ship.position.x, ship.position.y + 3, ship.position.z); break; }
  }
  tgtPos.y = Math.max(tgtPos.y, groundH(tgtPos.x, tgtPos.z) + 1.2, WATER_Y + 1);
  if (camInit) { camPos.copy(tgtPos); camLook.copy(tgtLook); camInit = false; }
  camPos.lerp(tgtPos, 1 - Math.exp(-dt * 3.5)); camLook.lerp(tgtLook, 1 - Math.exp(-dt * 5));
  camera.position.copy(camPos); camera.position.y += Math.sin(clockT * 0.7) * 0.15; camera.lookAt(camLook);
}

// ---------------------------------------------------------------- Ana döngü
let shipS = S_START, shipSm = S_START, clockT = 0, last = performance.now(), salvo = 0, salvoT = 0, beatT = 0, beatN = 0, idleCheckT = 0, bowOff = 10.4;
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function tick() {
  requestAnimationFrame(tick);
  const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now; clockT += dt;
  if (started) step(dt, now);
  render(dt);
}
function step(dt, now) {
  G.stateT += dt;
  idleCheckT -= dt; if (idleCheckT <= 0) { idleCheckT = 5; if (S.idleMin > 0) { const lim = S.idleMin * 60000; for (const [id, p] of G.crew) if (now - p.lastActive > lim) { G.crew.delete(id); dropVis(crewVis, id); } } G.boosts = G.boosts.filter(b => b.until > now); }
  if (G.state === 'march') {
    G.seferT += dt;
    const base = baseSpeed(); const n = G.crew.size;
    const crowd = (maxCrowdFactor() - 1) * 0.6 * Math.min(1, n / 40);
    const ropeB = 0.02 * G.rope.length, fatB = G.fatih ? 0.05 : 0;
    const bu = boostUntil(now) > now; const mul = bu ? 1.5 : 1;
    const vMax = TOTAL / (Math.max(2, Math.min(S.fastMin, S.slowMin)) * 60);
    const v0 = Math.min(vMax, base * (1 + crowd + ropeB + fatB));
    const v = v0 * mul;
    const drain = Math.min(G.pending, clamp(vMax - v0, 0, base * 0.6) * mul * dt);
    if (drain > 0) { G.pending -= drain; let left = drain; while (left > 1e-6 && G.pendingBy.length) { const e = G.pendingBy[0]; const t = Math.min(left, e[1]); credit(e[0], t); e[1] -= t; left -= t; if (e[1] <= 1e-6) G.pendingBy.shift(); } }
    const dist = v * dt + drain;
    if (n > 0) { const per = Math.max(0, v0 - base) * (crowd / Math.max(1e-6, crowd + ropeB + fatB)) * mul * dt / n; for (const id of G.crew.keys()) credit(id, per); }
    for (const id of G.rope) credit(id, base * 0.02 * mul * dt);
    if (G.fatih) credit(G.fatih.id, base * 0.05 * mul * dt);
    if (bu) { const act = G.boosts.filter(b => b.start <= now && b.until > now); const ext = (v - v / 1.5) * dt / Math.max(1, act.length); for (const b of act) credit(b.id, ext); }
    G.speed = dist / Math.max(dt, 1e-3);
    G.progress = Math.min(TOTAL, G.progress + dist);
    shipS = S_START + (S_ARRIVE - S_START) * (G.progress / TOTAL);
    if (G.progress >= TOTAL) finishSefer();
    beatT -= dt; if (beatT <= 0) { const bpm = 70 + clamp(G.speed / base, 1, 3) * 25; beatT = 60 / bpm; drumHit(beatN % 4 !== 3); beatN++; }
  } else if (G.state === 'arrive') {
    shipS = lerp(S_ARRIVE, S_FLOAT, smooth(0, 6, G.stateT)); G.speed = G.stateT < 6 ? baseSpeed() : 0;
    if (G.stateT > 2.2 && !G.splashed) { G.splashed = true; worldAt(S_SHORE + 1, 0, tmpA); tmpA.y = WATER_Y + 0.3; spawnFx(tmpA, 'splash'); spawnFx(tmpA.clone().add(new THREE.Vector3(1.5, 0, -1.5)), 'splash'); }
    salvoT -= dt;
    if (G.stateT > 3 && salvo < 7 && salvoT <= 0) { const c = cannons[salvo % cannons.length]; tmpA.copy(c.muzzle); c.g.localToWorld(tmpA); spawnFx(tmpA, 'flash'); spawnFx(tmpA, 'smoke'); boom(0.9); salvo++; salvoT = 0.75; }
    if (G.stateT > 10) showFinale();
  } else if (G.state === 'finale') {
    G.speed = 0;
    const left = Math.ceil(14 - G.stateT); $('finaleNext').textContent = left > 0 ? `Yeni sefer ${left} sn sonra başlıyor` : '';
    if (G.stateT > 14) { $('finale').classList.remove('show'); G.sefer++; startSefer(false); }
  }
  shipSm += (shipS - shipSm) * (1 - Math.exp(-dt * 6));
  updateFx(dt); pumpCards(dt); updateHud(dt);
}
function placeOn(obj, s, lat) {
  const sh = Math.min(s, S_SHORE - 3); const extra = s - sh; const latF = lat + (lat >= 0 ? 1 : -1) * extra * 0.7;
  worldAt(sh, latF, obj.position); pathAt(sh, _q); obj.rotation.set(0, Math.atan2(_q.tx, _q.tz), 0);
}
function labelOn(label, obj, h) { label.position.set(obj.position.x, obj.position.y + h, obj.position.z); const d = camera.position.distanceTo(label.position); const f = clamp(d / 15, 1, 5) * S.labelScale * 0.5; label.scale.set(label.userData.base[0] * f, label.userData.base[1] * f, 1); }
const PUSH_SLOTS = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) PUSH_SLOTS.push([-11.2 - r * 1.5, (c - 1) * 1.5]);
for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) PUSH_SLOTS.push([-6 + i * 2.2, sd * 3.0]);
function render(dt) {
  updateTod(started ? dt : dt * 0.2);
  // gemi
  pathAt(shipSm, _q); const sx = _q.x, sz = _q.z, yaw = Math.atan2(_q.tx, _q.tz);
  worldAt(shipSm + 8, 0, tmpA); worldAt(shipSm - 8, 0, tmpB); const pitch = Math.atan2(tmpA.y - tmpB.y, 16);
  const gy = (tmpA.y + tmpB.y) / 2 + 0.75; const floatY = WATER_Y - 0.4 + Math.sin(clockT * 1.3) * 0.12; const afloat = floatY > gy;
  ship.position.set(sx, afloat ? floatY : gy, sz);
  ship.rotation.set(0, yaw - Math.PI / 2, 0); ship.rotateZ(afloat ? Math.sin(clockT) * 0.02 : pitch);
  waveFlags(ship, clockT); for (const m of moored) { waveFlags(m, clockT + m.position.x); m.position.y = WATER_Y - 0.3 + Math.sin(clockT + m.position.x) * 0.1; }
  if (shipSm < S_SHORE + 12) rollLogs(shipSm);
  const sp = Math.min(3, (G.speed || 0) / Math.max(0.01, baseSpeed()));
  const cheer = started && G.state !== 'march';
  // iten tayfa
  const visible = [...G.crew.values()].sort((a, b) => b.lastActive - a.lastActive).slice(0, PUSH_SLOTS.length);
  const visIds = new Set(visible.map(p => p.id)); for (const id of [...crewVis.keys()]) if (!visIds.has(id)) dropVis(crewVis, id);
  visible.forEach((p, i) => { const v = visFor(crewVis, p); const [ds, lat] = PUSH_SLOTS[i]; placeOn(v.obj, shipSm + ds, lat); if (Math.abs(lat) > 2.5) v.obj.rotation.y += lat > 0 ? -0.5 : 0.5; animChar(v.obj, dt, sp, 'push', cheer); labelOn(v.label, v.obj, 2.95); });
  const anonN = Math.max(0, 6 - visible.length);
  anonPush.forEach((c, i) => { c.visible = i < anonN; if (!c.visible) return; const [ds, lat] = PUSH_SLOTS[visible.length + i]; placeOn(c, shipSm + ds, lat); animChar(c, dt, sp, 'push', cheer); });
  // halat
  const ropeIds = G.rope.slice(); for (const id of [...ropeVis.keys()]) if (!ropeIds.includes(id)) dropVis(ropeVis, id);
  const anonR = Math.max(0, 4 - ropeIds.length); const totalR = ropeIds.length + anonR; const rows = Math.ceil(totalR / 2); ropeLen = 3 + rows * 2.2;
  const bowS = shipSm + bowOff;
  const pullPos = (j) => { const row = Math.floor(j / 2); return [bowS + 3 + (rows - 1 - row) * 2.2 + 1, (j % 2 ? -1 : 1) * 1.25]; };
  ropeIds.forEach((id, i) => { const p = people.get(id); if (!p) return; const v = visFor(ropeVis, p); const [s, lat] = pullPos(i); placeOn(v.obj, s, lat); animChar(v.obj, dt, sp, 'pull', cheer); labelOn(v.label, v.obj, 2.95); });
  anonPull.forEach((c, i) => { c.visible = i < anonR; if (!c.visible) return; const [s, lat] = pullPos(ropeIds.length + i); placeOn(c, s, lat); animChar(c, dt, sp, 'pull', cheer); });
  for (const sd of [-1, 1]) { const a = worldAt(Math.min(bowS - 0.5, S_FLOAT), sd * 0.45, tmpA); a.y = ship.position.y + 2.3; const b = worldAt(Math.min(bowS + ropeLen + 1.2, S_SHORE - 3), sd * 1.1, tmpB); b.y += 1.05; placeRope(ropes[sd < 0 ? 0 : 1], a, b); }
  // Fatih
  placeOn(fatih, bowS + ropeLen + 6, 0); fatih.userData.phase += dt * (1.5 + sp * 1.6); const fp = fatih.userData.phase;
  if (!cheer) fatih.userData.legs.forEach((l, i) => l.rotation.x = Math.sin(fp + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.45); else fatih.userData.legs.forEach(l => l.rotation.x *= 0.9);
  fatih.position.y += Math.abs(Math.sin(fp)) * 0.06; labelOn(fatihLabel, fatih, 5.0);
  shipLight.position.set(ship.position.x, ship.position.y + 6, ship.position.z + 3); frontLight.position.set(fatih.position.x, fatih.position.y + 5, fatih.position.z + 2);
  sun.target.position.copy(ship.position); sun.position.copy(ship.position).addScaledVector(skyU.sunDir.value, 200); if (skyU.sunDir.value.y < 0.08) sun.position.y = ship.position.y + 20;
  torchMat.uniforms.uT.value = clockT; torchMat.uniforms.uScale.value = renderer.domElement.height * 0.9;
  if (S.quality !== 'low') updateWater(clockT);
  if (started) updateCamera(dt); else { const a = clockT * 0.05; camera.position.set(ship.position.x + Math.cos(a) * 45, ship.position.y + 18, ship.position.z + Math.abs(Math.sin(a)) * 45 + 10); camera.lookAt(ship.position); }
  sky.position.copy(camera.position); stars.position.copy(camera.position);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- WebSocket (TikTok aktarıcı)
function wsBase() {
  let base = (S.serverUrl || '').trim().replace(/\/+$/, '');
  if (!base) base = location.origin;
  return { http: base, ws: base.replace(/^http/, 'ws') + '/ws' };
}
let sock = null, wantConnect = false, retry = 0, retryTimer = 0, pingTimer = 0;
function setStatus(state, text) {
  const el = $('ttStatus'); el.textContent = text; el.className = 'status ' + (state === 'connected' ? 'ok' : state === 'error' ? 'err' : state === 'connecting' ? 'wait' : '');
  if (state === 'connected') retry = 0;
  if ((state === 'disconnected' || state === 'error') && wantConnect && /koptu|bitti|sona/.test(text)) scheduleReconnect(15000);
}
function openSock() {
  return new Promise((res, rej) => {
    if (sock && sock.readyState === 1) return res(sock);
    try { if (sock) { sock.onclose = null; sock.close(); } } catch {}
    const s = new WebSocket(wsBase().ws); sock = s;
    s.onopen = () => { clearInterval(pingTimer); pingTimer = setInterval(() => { try { s.send('{"type":"ping"}'); } catch {} }, 20000); res(s); };
    s.onmessage = (e) => { let d; try { d = JSON.parse(e.data); } catch { return; } if (d.type !== 'pong') handleEvent(d); };
    s.onclose = () => { clearInterval(pingTimer); rej(new Error('closed')); if (wantConnect && sock === s) { setStatus('connecting', 'Sunucu bağlantısı koptu, yeniden deneniyor…'); scheduleReconnect(); } };
    s.onerror = () => {};
  });
}
function scheduleReconnect(ms) { clearTimeout(retryTimer); const d = ms || Math.min(30000, 2000 * Math.pow(1.6, retry++)); retryTimer = setTimeout(() => { if (wantConnect) connectTikTok(); }, d); }
async function connectTikTok() {
  const u = (S.username || '').trim(); if (!u) { setStatus('error', 'Önce TikTok kullanıcı adını yaz.'); return; }
  wantConnect = true; setStatus('connecting', 'Sunucuya bağlanılıyor… (sunucu uykudaysa 30-60 sn sürebilir)');
  try { const s = await openSock(); s.send(JSON.stringify({ type: 'connect', username: u, signApiKey: S.signKey || '' })); } catch {}
}
function disconnectTikTok() { wantConnect = false; clearTimeout(retryTimer); try { if (sock && sock.readyState === 1) sock.send('{"type":"disconnect"}'); } catch {} setStatus('disconnected', 'Bağlı değil'); }
setInterval(() => { if (wantConnect) fetch(wsBase().http + '/health', { cache: 'no-store' }).catch(() => {}); }, 4 * 60 * 1000);

// ---------------------------------------------------------------- Demo modu
const DEMO_NAMES = ['Ahmet', 'Mehmet K.', 'Zeynep', 'Elif_34', 'Burak', 'Ayşe Nur', 'Emre', 'Fatma', 'Kerem', 'Selin', 'Mustafa', 'Hatice', 'Yusuf', 'Merve', 'Ömer Faruk', 'Esra', 'Hakan', 'Büşra', 'Can', 'İrem', 'Oğuz', 'Şeyma', 'Murat', 'Gizem', 'Tolga', 'Derya', 'Serkan', 'Cansu', 'Barış', 'Ece', 'Furkan', 'Melek', 'Kaan', 'Sude', 'Eren', 'Nisa'];
const demoAv = new Map();
function demoAvatar(name) { if (demoAv.has(name)) return demoAv.get(name); const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
  x.fillStyle = hashCol(name + 'x'); x.fillRect(0, 0, 96, 96); x.fillStyle = '#f0c39a'; x.beginPath(); x.arc(48, 42, 22, 0, 7); x.fill(); x.fillStyle = '#3a2414'; x.fillRect(36, 50, 24, 4);
  x.fillStyle = hashCol(name); x.beginPath(); x.arc(48, 104, 38, 0, 7); x.fill();
  const u = c.toDataURL('image/png'); demoAv.set(name, u); return u; }
function demoUser(fresh) { const pool = fresh ? DEMO_NAMES : [...G.crew.keys()].filter(k => k.startsWith('demo_')).map(k => k.slice(5)); const name = pool.length ? pick(pool) : pick(DEMO_NAMES); return { uniqueId: 'demo_' + name, nickname: name, profilePictureUrl: demoAvatar(name) }; }
let demoT = 0;
function demoStep(dt) {
  if (!S.demoOn || !started) return; demoT -= dt * Number(S.demoRate || 1); if (demoT > 0) return; demoT = rand(1.2, 3.2);
  const r = Math.random();
  if (r < 0.45) handleEvent({ type: 'chat', ...demoUser(Math.random() < 0.6), comment: 'Haydi!' });
  else if (r < 0.8) handleEvent({ type: 'like', ...demoUser(false), likeCount: 1 + (Math.random() * 12 | 0) });
  else if (r < 0.88) handleEvent({ type: 'follow', ...demoUser(true) });
  else if (S.demoGifts) { const act = pick(['halat', 'halat', 'fatih', 'destek']); const L = giftList(S.gifts[act]); const u = demoUser(false);
    if (L.length) handleEvent({ type: 'gift', ...u, giftName: L[0], giftId: '', repeatCount: 1 }); else doAction(act, person(u), 1); }
}
setInterval(() => demoStep(0.25), 250);

// ---------------------------------------------------------------- Menü
const menu = $('menu');
function openMenu() { menu.classList.remove('hidden'); fillMenu(); renderRecentGifts(); }
function closeMenu() { menu.classList.add('hidden'); }
function toggleMenu() { menu.classList.contains('hidden') ? openMenu() : closeMenu(); }
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); if (!started) begin(); toggleMenu(); } });
$('menuBtn').addEventListener('click', (e) => { e.stopPropagation(); if (!started) begin(); openMenu(); });
$('menuClose').addEventListener('click', closeMenu);
menu.addEventListener('click', (e) => { if (e.target === menu) closeMenu(); });
let taps = [];
window.addEventListener('pointerdown', () => { if (!menu.classList.contains('hidden') || !started) return; const t = performance.now(); taps.push(t); taps = taps.filter(x => t - x < 700); if (taps.length >= 3) { taps = []; openMenu(); } });
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab)); }));
const POPULAR = ['Rose', 'TikTok', 'GG', 'Ice Cream Cone', 'Finger Heart', 'Heart Me', 'Doughnut', 'Hand Hearts', 'Perfume', 'Confetti', 'Hat and Mustache', 'Sunglasses', 'Corgi', 'Money Gun', 'Galaxy', 'Lion', 'Universe'];
document.querySelectorAll('.gsel').forEach(sel => { sel.innerHTML = `<option value="">+ Listeden hediye ekle…</option>` + POPULAR.map(n => `<option>${n}</option>`).join('');
  sel.addEventListener('change', () => { const inp = $(sel.dataset.for); if (!sel.value) return; const L = inp.value.split(',').map(s => s.trim()).filter(Boolean); if (!L.includes(sel.value)) L.push(sel.value); inp.value = L.join(', '); sel.value = ''; inp.dispatchEvent(new Event('change')); }); });
function fillMenu() {
  $('ttUser').value = S.username; $('autoConnect').checked = S.autoConnect; $('serverUrl').value = S.serverUrl; $('signKey').value = S.signKey;
  $('g_halat').value = S.gifts.halat; $('g_fatih').value = S.gifts.fatih; $('g_destek').value = S.gifts.destek; $('destekSec').value = S.destekSec; $('ropeCap').value = S.ropeCap;
  $('musicVol').value = S.musicVol; $('drumOn').checked = S.drumOn; $('drumVol').value = S.drumVol; $('sfxVol').value = S.sfxVol;
  $('todMode').value = S.todMode; $('todMin').value = S.todMin; $('slowMin').value = S.slowMin; $('fastMin').value = S.fastMin; $('interact').value = S.interact; $('idleMin').value = S.idleMin; $('shotSec').value = S.shotSec;
  $('quality').value = S.quality; $('labelScale').value = S.labelScale; $('hudScale').value = S.hudScale; $('hudTop').value = S.hudTop;
  $('showLedger').checked = S.showLedger; $('showStats').checked = S.showStats; $('hideBtn').checked = S.hideBtn; $('wakeLock').checked = S.wakeLock;
  $('demoOn').checked = S.demoOn; $('demoRate').value = S.demoRate; $('demoGifts').checked = S.demoGifts; updateMusicUi();
}
function bind(id, key, conv, after) {
  const el = $(id); const evn = el.type === 'range' ? 'input' : (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
  el.addEventListener(evn, () => { const v = el.type === 'checkbox' ? el.checked : (conv ? conv(el.value) : el.value); if (key.includes('.')) { const [a, b] = key.split('.'); S[a][b] = v; } else S[key] = v; saveSettings(); if (after) after(); });
}
const num = (lo, hi) => (v) => clamp(Number(v) || lo, lo, hi);
bind('ttUser', 'username', v => v.trim()); bind('autoConnect', 'autoConnect'); bind('serverUrl', 'serverUrl', v => v.trim()); bind('signKey', 'signKey', v => v.trim());
bind('g_halat', 'gifts.halat'); bind('g_fatih', 'gifts.fatih'); bind('g_destek', 'gifts.destek'); bind('destekSec', 'destekSec', num(5, 300));
bind('ropeCap', 'ropeCap', num(2, 16), () => { while (G.rope.length > S.ropeCap) dropVis(ropeVis, G.rope.shift()); });
bind('musicVol', 'musicVol', Number, applyVolumes); bind('drumOn', 'drumOn', null, applyVolumes); bind('drumVol', 'drumVol', Number, applyVolumes); bind('sfxVol', 'sfxVol', Number, applyVolumes);
bind('todMode', 'todMode'); bind('todMin', 'todMin', num(2, 60)); bind('slowMin', 'slowMin', num(3, 40)); bind('fastMin', 'fastMin', num(2, 40)); bind('interact', 'interact', Number); bind('idleMin', 'idleMin', num(0, 120)); bind('shotSec', 'shotSec', num(4, 30));
bind('quality', 'quality', null, applyQuality); bind('labelScale', 'labelScale', Number); bind('hudScale', 'hudScale', Number, resize); bind('hudTop', 'hudTop', num(0, 300), resize);
bind('showLedger', 'showLedger'); bind('showStats', 'showStats'); bind('hideBtn', 'hideBtn', null, () => $('menuBtn').classList.toggle('gone', S.hideBtn)); bind('wakeLock', 'wakeLock', null, requestWake);
bind('demoOn', 'demoOn'); bind('demoRate', 'demoRate'); bind('demoGifts', 'demoGifts');
$('ttConnect').addEventListener('click', () => { S.username = $('ttUser').value.trim(); saveSettings(); connectTikTok(); });
$('ttDisconnect').addEventListener('click', disconnectTikTok);
$('mp3').addEventListener('change', async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; musicName = f.name; try { await idbPut('music', { name: f.name, blob: f }); } catch {} musicEl.src = URL.createObjectURL(f); musicEl.volume = S.musicVol; musicEl.play().catch(() => {}); updateMusicUi(); });
$('mPlay').addEventListener('click', () => { if (!musicEl.src) return; musicEl.paused ? musicEl.play().catch(() => {}) : musicEl.pause(); });
$('mRemove').addEventListener('click', async () => { musicEl.pause(); musicEl.removeAttribute('src'); musicEl.load(); musicName = ''; await idbDel('music').catch(() => {}); updateMusicUi(); });
$('resetSefer').addEventListener('click', () => { $('finale').classList.remove('show'); startSefer(false); closeMenu(); });
$('resetAll').addEventListener('click', () => { if (!confirm('Tüm ayarlar varsayılana dönsün mü?')) return; S = structuredClone(DEFAULTS); saveSettings(); fillMenu(); applyQuality(); applyVolumes(); });
document.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { const t = b.dataset.t;
  if (t === 'chat') handleEvent({ type: 'chat', ...demoUser(true), comment: 'test' });
  else if (t === 'like') handleEvent({ type: 'like', ...demoUser(false), likeCount: 15 });
  else if (t === 'follow') handleEvent({ type: 'follow', ...demoUser(true) });
  else if (t === 'crowd') for (let i = 0; i < 10; i++) handleEvent({ type: 'chat', ...demoUser(true), comment: 'test' });
  else if (t === 'finish') { if (G.state === 'march') G.progress = TOTAL - 0.01; }
  else if (t === 'shot') nextShot();
  else doAction(t, person(demoUser(true)), 1);
}));
function renderRecentGifts() { const box = $('recentGifts'); if (!recentGifts.length) { box.textContent = 'Henüz hediye gelmedi.'; return; }
  box.innerHTML = recentGifts.map((g, i) => `<div class="rg"><span>${esc(g.name || '?')} <small>(no: ${esc(g.id)})</small></span><button data-i="${i}" data-a="halat">Halat</button><button data-i="${i}" data-a="fatih">Fatih</button><button data-i="${i}" data-a="destek">Destek</button></div>`).join('');
  box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { const g = recentGifts[+b.dataset.i]; const a = b.dataset.a; const L = S.gifts[a].split(',').map(s => s.trim()).filter(Boolean); const v = g.name || g.id; if (!L.includes(v)) L.push(v); S.gifts[a] = L.join(', '); saveSettings(); fillMenu(); })); }

// ---------------------------------------------------------------- Başlat
let started = false, wake = null;
async function requestWake() { try { if (S.wakeLock && 'wakeLock' in navigator) { wake = await navigator.wakeLock.request('screen'); } else if (wake) { wake.release(); wake = null; } } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { requestWake(); if (actx && actx.state === 'suspended') actx.resume(); } });
function begin() {
  if (started) return; started = true; $('start').classList.add('hidden'); initAudio(); requestWake();
  const el = document.documentElement; try { const f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) { const r = f.call(el); if (r && r.catch) r.catch(() => {}); } } catch {}
  if (musicEl.src) musicEl.play().catch(() => {});
  if (S.autoConnect && S.username) connectTikTok();
  startSefer(true);
}
$('startBtn').addEventListener('click', begin);
$('menuBtn').classList.toggle('gone', S.hideBtn);
const qs = new URLSearchParams(location.search);
if (qs.has('demo')) S.demoOn = true;
if (qs.has('tod')) S.todMode = qs.get('tod');
applyQuality(); updateTod(0); loadStoredMusic();
if (qs.has('autostart')) begin();
requestAnimationFrame(tick);
window.__fetih = { G, S, handleEvent, doAction, person, nextShot, setShot, begin, TOTAL };
