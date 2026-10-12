import * as THREE from 'three';
import { loadModel, makeJet, gunOffsets, tailOffset, cloneMaterials, tintObject, flashObject, getBank } from './models.js';
import { createSky, createStars, createGrid, createProps, createSun } from './world.js';
import { GameAudio } from './audio.js';

/* =========================================================
 *  SKY STRIKE 3D — 开源模型 3D 空战
 * ========================================================= */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const rnd = (a, b) => a + Math.random() * (b - a);
const TMP_V = new THREE.Vector3();
const TMP_V2 = new THREE.Vector3();
const TMP_Q = new THREE.Quaternion();
const TMP_M = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/* ---------- 渲染器 ---------- */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x061224, 0.0019);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.4, 4200);
camera.position.set(0, 6, 14);

/* ---------- 灯光 + 环境 ---------- */
scene.add(new THREE.HemisphereLight(0x8fc4ff, 0x0a1226, 0.7));
const sunLight = new THREE.DirectionalLight(0xd6f2ff, 1.35);
sunLight.position.set(-0.45, 1, 0.35);
scene.add(sunLight);
const fillLight = new THREE.DirectionalLight(0x6fd0ff, 0.55);
fillLight.position.set(0.7, -0.25, -0.6);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xff9ad2, 0.35);
rimLight.position.set(0.2, 0.5, 1);
scene.add(rimLight);

function makeEnvTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#0a1830');
  g.addColorStop(0.45, '#20486e');
  g.addColorStop(0.52, '#6fd8ff');
  g.addColorStop(0.62, '#132a4a');
  g.addColorStop(1, '#05070f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  const rg = ctx.createRadialGradient(120, 120, 0, 120, 120, 150);
  rg.addColorStop(0, 'rgba(255,255,255,0.95)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
scene.environment = makeEnvTexture();

/* ---------- 世界 ---------- */
const sky = createSky(scene);
const stars = createStars(scene, 1700);
const grid = createGrid(scene);
const props = createProps(scene, 33);
createSun(scene);

/* =========================================================
 *  对象池：粒子 / 冲击波 / 光源 / 弹丸
 * ========================================================= */
class ParticlePool {
  constructor(max = 1400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.count = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `
        attribute float aSize; attribute vec3 aColor; attribute float aAlpha;
        varying vec3 vC; varying float vA;
        void main(){
          vC = aColor; vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * (340.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4(vC, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  spawn(p, v, color, size, life, drag = 1.2) {
    let i;
    if (this.count < this.max) i = this.count++;
    else i = (Math.random() * this.max) | 0;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.size[i] = size; this.alpha[i] = 1;
    this.life[i] = life; this.maxLife[i] = life; this.drag[i] = drag;
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // 与最后一个交换
        const j = --this.count;
        if (j !== i) {
          for (let k = 0; k < 3; k++) {
            this.pos[i * 3 + k] = this.pos[j * 3 + k];
            this.vel[i * 3 + k] = this.vel[j * 3 + k];
            this.col[i * 3 + k] = this.col[j * 3 + k];
          }
          this.size[i] = this.size[j]; this.alpha[i] = this.alpha[j];
          this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j];
          this.drag[i] = this.drag[j];
        }
        i--;
        continue;
      }
      const d = 1 - this.drag[i] * dt;
      const m = d < 0 ? 0 : d;
      this.vel[i * 3] *= m; this.vel[i * 3 + 1] *= m; this.vel[i * 3 + 2] *= m;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = t * t;
    }
    this.points.geometry.setDrawRange(0, this.count);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aColor.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
  }
}
const particles = new ParticlePool();

/* 冲击波光环 */
class RingPool {
  constructor(max = 14) {
    this.max = max; this.items = [];
    const geo = new THREE.RingGeometry(0.7, 1, 40, 1);
    for (let i = 0; i < max; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9fe9ff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      this.items.push({ m, t: 0, dur: 1, scale: 1 });
    }
  }
  spawn(p, scale = 10, color = 0x9fe9ff, dur = 0.55) {
    const it = this.items.find((x) => !x.m.visible) || this.items[0];
    it.m.visible = true;
    it.m.position.copy(p);
    it.m.scale.setScalar(scale * 0.25);
    it.m.material.color.setHex(color);
    it.m.material.opacity = 0.9;
    it.t = 0; it.dur = dur; it.scale = scale;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.m.visible) continue;
      it.t += dt;
      const k = it.t / it.dur;
      if (k >= 1) { it.m.visible = false; continue; }
      it.m.scale.setScalar(it.scale * (0.25 + k * 1.05));
      it.m.material.opacity = 0.9 * (1 - k) ** 1.4;
      it.m.quaternion.copy(camera.quaternion);
    }
  }
}
const rings = new RingPool();

/* 爆炸闪光 */
class FlashPool {
  constructor(max = 4) {
    this.max = max; this.items = [];
    for (let i = 0; i < max; i++) {
      const l = new THREE.PointLight(0xffd9a0, 0, 160, 2);
      l.visible = false;
      scene.add(l);
      this.items.push({ l, t: 0, dur: 1, peak: 1 });
    }
  }
  spawn(p, intensity = 400, dur = 0.4, color = 0xffd9a0) {
    const it = this.items.find((x) => !x.l.visible) || this.items[0];
    it.l.visible = true;
    it.l.position.copy(p);
    it.l.color.setHex(color);
    it.peak = intensity; it.t = 0; it.dur = dur;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.l.visible) continue;
      it.t += dt;
      const k = it.t / it.dur;
      if (k >= 1) { it.l.visible = false; it.l.intensity = 0; continue; }
      it.l.intensity = it.peak * (1 - k) ** 2;
    }
  }
}
const flashes = new FlashPool();

/* =========================================================
 *  玩家
 * ========================================================= */
const BASE_SPEED = 68;
const BOOST_SPEED = 122;

const player = {
  obj: new THREE.Group(),
  pos: new THREE.Vector3(0, 20, 0),
  quat: new THREE.Quaternion(),
  vel: new THREE.Vector3(),
  fwd: new THREE.Vector3(0, 0, -1),
  right: new THREE.Vector3(1, 0, 0),
  up: new THREE.Vector3(0, 1, 0),
  yaw: 0, pitch: 0, roll: 0, bank: 0,
  speed: BASE_SPEED,
  hp: 100, maxHp: 100,
  missiles: 6, maxMissiles: 8,
  boost: 100, boosting: false,
  fireCd: 0, triple: 0, invuln: 0,
  alive: false, radius: 3.0,
  guns: [], engineGlow: null, trailT: 0,
};
player.obj.rotation.order = 'YXZ';
scene.add(player.obj);

const ENEMY_TYPES = {
  scout: { hp: 4, speed: 58, score: 100, radius: 2.6, tint: 0xff5a4a, fire: 1.5, burst: 1, scale: 4.4, name: 'scout' },
  heavy: { hp: 13, speed: 40, score: 260, radius: 3.8, tint: 0xff8a2b, fire: 2.0, burst: 3, scale: 6.0, name: 'heavy' },
  ace: { hp: 7, speed: 82, score: 420, radius: 3.0, tint: 0xff3ea5, fire: 1.7, burst: 2, scale: 5.0, name: 'ace' },
  boss: { hp: 130, speed: 34, score: 3000, radius: 11, tint: 0xb44dff, fire: 1.15, burst: 5, scale: 12.0, name: 'boss' },
};

/* ---------- 共享几何/材质 ---------- */
const G = {
  bulletGeo: new THREE.BoxGeometry(0.17, 0.17, 5.0),
  bulletMat: new THREE.MeshBasicMaterial({ color: 0xa8fbff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
  eBulletGeo: new THREE.SphereGeometry(0.42, 8, 6),
  eBulletMat: new THREE.MeshBasicMaterial({ color: 0xff9a4a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
  missileGeo: new THREE.ConeGeometry(0.26, 1.5, 8),
  missileMat: new THREE.MeshBasicMaterial({ color: 0xffe6a0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
  pickupGeo: new THREE.OctahedronGeometry(1.5, 0),
  mineGeo: new THREE.IcosahedronGeometry(1.6, 0),
};

/* 敌机威胁标记：远处也能一眼看到敌机 */
const MARKER_GEO = new THREE.OctahedronGeometry(1, 0);
const MARKER_MAT = {
  scout: new THREE.MeshBasicMaterial({ color: 0xff7a5a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  heavy: new THREE.MeshBasicMaterial({ color: 0xffa04a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  ace: new THREE.MeshBasicMaterial({ color: 0xff5ec4, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  boss: new THREE.MeshBasicMaterial({ color: 0xc86bff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
};

const bullets = [];   // 玩家弹
const eBullets = [];  // 敌方弹 / 导弹
const enemies = [];
const pickups = [];
const mines = [];

function addMesh(geo, mat, pos) {
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(pos);
  scene.add(m);
  return m;
}

/* =========================================================
 *  音频
 * ========================================================= */
const audio = new GameAudio();
audio.onSubtitle = (text, dur) => {
  const el = $('subtitle');
  if (text) {
    el.textContent = text;
    el.classList.add('on');
    audio._subTimer = dur;
  } else {
    el.classList.remove('on');
  }
};

/* =========================================================
 *  输入
 * ========================================================= */
const input = {
  x: 0, y: 0, kx: 0, ky: 0,
  mx: 0, my: 0, useMouse: false,
  fire: false, missile: false, boost: false,
  keys: {},
};
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'fire', KeyF: 'missile', ShiftLeft: 'boost', ShiftRight: 'boost',
};

window.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (k) { input.keys[k] = true; e.preventDefault(); }
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) { input.keys[k] = false; e.preventDefault(); }
});
window.addEventListener('blur', () => { for (const k in input.keys) input.keys[k] = false; });

canvas.addEventListener('mousemove', (e) => {
  input.mx = (e.clientX / window.innerWidth) * 2 - 1;
  input.my = (e.clientY / window.innerHeight) * 2 - 1;
  input.useMouse = true;
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) input.fire = true;
  if (e.button === 2) input.missile = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.fire = false;
  if (e.button === 2) input.missile = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* 触屏：拖动转向 + 自动开火 */
let touchId = null, touchStart = { x: 0, y: 0 };
canvas.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  touchId = t.identifier;
  touchStart = { x: t.clientX, y: t.clientY };
  input.fire = true;
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier !== touchId) continue;
    input.mx = clamp((t.clientX - touchStart.x) / 90, -1, 1);
    input.my = clamp((t.clientY - touchStart.y) / 90, -1, 1);
    input.useMouse = true;
  }
  e.preventDefault();
}, { passive: false });
const touchEnd = (e) => {
  for (const t of e.changedTouches) if (t.identifier === touchId) { touchId = null; input.fire = false; }
};
canvas.addEventListener('touchend', touchEnd);
canvas.addEventListener('touchcancel', touchEnd);

/* =========================================================
 *  游戏状态
 * ========================================================= */
const GAME = {
  state: 'loading', // loading | menu | playing | paused | dead
  score: 0, best: +(localStorage.getItem('skystrike3d.best') || 0),
  combo: 1, comboTimer: 0, maxCombo: 1,
  kills: 0, wave: 0, waveKills: 0,
  spawnQueue: [], spawnTimer: 0, waveGap: 0, maxAlive: 7,
  dist: 0, time: 0, shake: 0, timeScale: 1, deadTimer: 0,
  lowHpWarned: false, missWarn: 0, hudTick: 0,
};

function setScreen(name) {
  for (const s of ['loading', 'menu', 'pause', 'gameover']) $(s).classList.toggle('hidden', s !== name);
  $('hud').classList.toggle('hidden', !(name === null || name === 'pause'));
}

/* =========================================================
 *  模型加载
 * ========================================================= */
let playerJet = null;
let enemyJetProto = null;

async function loadAssets() {
  const steps = [
    ['正在同步 F-16 战机数据…', () => loadModel('f16').then((g) => {
      playerJet = makeJet(g.scene, { length: 6.6, yawFix: Math.PI, emissive: 1.5 });
      player.obj.add(playerJet);
      player.guns = gunOffsets(playerJet, 0.5);
      const t = tailOffset(playerJet);
      const glow = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 3.4, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
      );
      glow.rotation.x = Math.PI / 2;
      glow.position.set(t.x, t.y, t.z + 1.5);
      player.obj.add(glow);
      player.engineGlow = glow;
    })],
    ['正在装配敌方机队…', () => loadModel('l159').then((g) => {
      enemyJetProto = makeJet(g.scene, { length: 6.0, yawFix: -Math.PI / 2, tint: null, emissive: 0.9 });
    })],
    ['正在加载语音包…', () => audio.init()],
  ];
  for (let i = 0; i < steps.length; i++) {
    $('loadTip').textContent = steps[i][0];
    $('loadBar').style.width = `${(i / steps.length) * 100}%`;
    await steps[i][1]();
  }
  $('loadBar').style.width = '100%';
  $('loadTip').textContent = '准备完毕';
}

/* =========================================================
 *  敌机
 * ========================================================= */
function spawnEnemy(typeName, opts = {}) {
  const t = ENEMY_TYPES[typeName];
  if (!enemyJetProto || !t) return null;
  const proto = enemyJetProto.clone(true);
  cloneMaterials(proto);
  tintObject(proto, t.tint, t.name === 'boss' ? 0.75 : 0.62);
  proto.scale.setScalar(t.scale / 6.0);
  const bankGroup = getBank(proto);
  const marker = new THREE.Mesh(MARKER_GEO, MARKER_MAT[typeName].clone());
  marker.visible = false;
  scene.add(marker);
  scene.add(proto);

  const fwd = player.fwd, right = player.right, up = player.up;
  const pos = opts.pos ? opts.pos.clone() : new THREE.Vector3()
    .copy(player.pos)
    .addScaledVector(fwd, rnd(280, 400))
    .addScaledVector(right, rnd(-1, 1) * 150)
    .addScaledVector(up, rnd(-0.8, 0.8) * 95);
  pos.y = clamp(pos.y, -52, 330);

  const e = {
    type: t, kind: typeName, obj: proto, pos, vel: new THREE.Vector3(),
    hp: t.hp, maxHp: t.hp, radius: t.radius * (t.scale / 6.0),
    fireCd: rnd(0.4, 1.6), burst: 0, burstCd: 0,
    evade: { ph: rnd(0, 6.28), f: rnd(0.6, 1.5), a: rnd(0.15, 0.55) },
    hitFlash: 0, alive: true, bank: 0, bankGroup, marker,
  };
  enemies.push(e);
  GAME.stats.spawned++;
  return e;
}

function spawnBoss() {
  const e = spawnEnemy('boss');
  if (!e) return;
  e.hp = e.maxHp = ENEMY_TYPES.boss.hp + GAME.wave * 12;
  audio.playVoice('vo_boss', true);
  announce(`⚠ 大型敌机出现`, 2200);
  for (let i = 0; i < 2; i++) {
    const escort = spawnEnemy('scout', {
      pos: e.pos.clone().add(new THREE.Vector3(rnd(-1, 1) * 40, rnd(-14, 14), rnd(-30, 30))),
    });
    if (escort) escort.hp = escort.maxHp = 6;
  }
}

function spawnMines(n = 5) {
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a0d16, emissive: 0xff2b3d, emissiveIntensity: 1.4,
      roughness: 0.5, metalness: 0.6, flatShading: true,
    });
    const m = new THREE.Mesh(G.mineGeo, mat);
    const a = Math.random() * Math.PI * 2;
    const r = rnd(130, 230);
    m.position.copy(player.pos)
      .addScaledVector(player.fwd, rnd(150, 320))
      .add(new THREE.Vector3(Math.cos(a) * r, rnd(-30, 60), Math.sin(a) * r));
    m.scale.setScalar(rnd(1.4, 2.6));
    scene.add(m);
    mines.push({ obj: m, hp: 3, spin: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(rnd(0.2, 1)), radius: 3.2 });
  }
}

/* =========================================================
 *  开火
 * ========================================================= */
function fireGuns() {
  if (!player.alive) return;
  const n = player.triple > 0 ? 3 : 2;
  const dirBase = player.fwd;
  for (let i = 0; i < n; i++) {
    const spread = n === 3 ? (i - 1) * 0.035 : 0;
    const dir = dirBase.clone();
    if (spread) dir.applyAxisAngle(player.up, spread);
    const origin = (n === 3 && i === 2)
      ? TMP_V.copy(player.pos).addScaledVector(dir, 5).clone()
      : player.guns[i % 2].clone().applyQuaternion(player.quat).add(player.pos);
    const b = addMesh(G.bulletGeo, G.bulletMat, origin);
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    bullets.push({ mesh: b, pos: origin.clone(), vel: dir.multiplyScalar(340 + player.speed * 0.35), life: 1.4, dmg: 1.1 });
  }
  particles.spawn(origin, dirBase.clone().multiplyScalar(-8), new THREE.Color(0xbff6ff), 3.2, 0.09, 4);
  audio.gun();
  GAME.shake = Math.min(GAME.shake + 0.06, 0.5);
}

function fireMissile() {
  if (!player.alive || player.missiles <= 0) return;
  const target = lockTarget;
  player.missiles--;
  const dir = (target && target.alive) ? target.pos.clone().sub(player.pos).normalize() : player.fwd.clone();
  const origin = player.pos.clone().addScaledVector(dir, 5).addScaledVector(player.up, -0.6);
  const m = addMesh(G.missileGeo, G.missileMat, origin);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  bullets.push({
    mesh: m, pos: origin.clone(), vel: dir.clone().multiplyScalar(110),
    life: 4.5, dmg: 26, missile: true, target: (target && target.alive) ? target : null, speed: 190,
  });
  audio.missileLaunch();
  audio.playVoice('vo_missile');
  GAME.shake = Math.min(GAME.shake + 0.35, 1.0);
}

function enemyFire(e) {
  const to = player.pos.clone().sub(e.pos);
  const d = to.length();
  to.normalize();
  const n = e.type.burst;
  for (let i = 0; i < n; i++) {
    const dir = to.clone();
    if (n > 1) dir.applyAxisAngle(UP, (i - (n - 1) / 2) * 0.09);
    // 预瞄一点
    dir.addScaledVector(TMP_V.copy(player.vel).multiplyScalar(d / 150), 0.25).normalize();
    const origin = e.pos.clone().addScaledVector(dir, e.radius + 1.2);
    const m = addMesh(G.eBulletGeo, G.eBulletMat, origin);
    const isHoming = e.kind === 'boss' && Math.random() < 0.3;
    if (isHoming) {
      m.scale.setScalar(1.7);
      m.material = new THREE.MeshBasicMaterial({ color: 0xff4d5e, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
      eBullets.push({ mesh: m, pos: origin.clone(), vel: dir.multiplyScalar(85), life: 6, dmg: 13, homing: true, turn: 1.15 });
      GAME.missWarn = 3.2;
    } else {
      eBullets.push({ mesh: m, pos: origin.clone(), vel: dir.multiplyScalar(150), life: 3.4, dmg: 9, homing: false });
    }
  }
  audio.enemyGun();
}

/* =========================================================
 *  爆炸 / 伤害
 * ========================================================= */
const C = {
  fire: new THREE.Color(0xffb057),
  fire2: new THREE.Color(0xff5a2b),
  smoke: new THREE.Color(0x5f7fa8),
  spark: new THREE.Color(0xa8f0ff),
  cyan: new THREE.Color(0x62e6ff),
  gold: new THREE.Color(0xffd27a),
  red: new THREE.Color(0xff5a6a),
  green: new THREE.Color(0x62ffb4),
  purple: new THREE.Color(0xc86bff),
};

function explode(pos, scale = 1, color = C.fire) {
  const n = Math.round(16 * scale);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(8, 34) * scale);
    particles.spawn(pos, v, Math.random() < 0.55 ? color : C.fire2, rnd(2.4, 6.5) * scale, rnd(0.35, 0.85), 1.4);
  }
  for (let i = 0; i < Math.round(8 * scale); i++) {
    const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(3, 12) * scale);
    particles.spawn(pos, v, C.smoke, rnd(5, 11) * scale, rnd(0.8, 1.5), 1.9);
  }
  rings.spawn(pos, 13 * scale, 0xa8f0ff, 0.5 + 0.12 * scale);
  flashes.spawn(pos, 260 * scale, 0.36 + 0.1 * scale, 0xffc27a);
  audio.explosion(clamp(scale, 0.6, 2.2));
  GAME.shake = Math.min(GAME.shake + 0.45 * scale, 1.6);
}

function damagePlayer(amount, fromBehind = false) {
  if (!player.alive || player.invuln > 0) return;
  player.hp -= amount;
  player.invuln = 0.35;
  GAME.shake = Math.min(GAME.shake + 0.5, 1.6);
  $('dmgFlash').classList.add('on');
  setTimeout(() => $('dmgFlash').classList.remove('on'), 90);
  audio.hit();
  audio.playVoice('vo_hit');
  GAME.combo = 1; GAME.comboTimer = 0;
  if (player.hp <= 0) { player.hp = 0; killPlayer(); }
  else if (player.hp <= 30 && !GAME.lowHpWarned) {
    GAME.lowHpWarned = true;
    audio.playVoice('vo_lowhp', true);
  }
}

function killPlayer() {
  if (!player.alive) return;
  player.alive = false;
  explode(player.pos, 2.4, C.fire);
  explode(player.pos.clone().add(new THREE.Vector3(0, 2, 0)), 1.8, C.cyan);
  player.obj.visible = false;
  player.engineGlow.visible = false;
  audio.stopEngine();
  audio.playVoice('vo_over', true);
  GAME.timeScale = 0.28;
  GAME.deadTimer = 1.6;
  GAME.state = 'dead';
}

function addScore(v) {
  GAME.score += Math.round(v * GAME.combo);
}

function killEnemy(e, byMissile = false) {
  e.alive = false;
  explode(e.pos, e.kind === 'boss' ? 3.0 : (e.kind === 'heavy' ? 1.35 : 1), e.kind === 'boss' ? C.purple : C.fire);
  GAME.kills++;
  GAME.waveKills++;
  GAME.combo = Math.min(3.0, +(GAME.combo + 0.1).toFixed(2));
  GAME.comboTimer = 3.2;
  GAME.maxCombo = Math.max(GAME.maxCombo, GAME.combo);
  addScore(e.type.score);
  if (e.kind === 'boss') {
    rings.spawn(e.pos, 60, 0xc86bff, 1.2);
    flashes.spawn(e.pos, 1600, 1.0, 0xc86bff);
    announce('★ 大型敌机击破 ★', 2400);
    audio.playVoice('vo_combo', true);
  } else {
    if (GAME.kills % 4 === 0) audio.playVoice(Math.random() < 0.5 ? 'vo_kill' : 'vo_combo');
    if (GAME.kills % 12 === 0) audio.playVoice('vo_combo', true);
  }
  // 掉落
  if (Math.random() < (e.kind === 'boss' ? 1 : 0.14)) dropPickup(e.pos);
}

function dropPickup(pos) {
  const kinds = ['hp', 'msl', 'power'];
  const kind = player.hp < 60 && Math.random() < 0.5 ? 'hp' : kinds[(Math.random() * kinds.length) | 0];
  const color = kind === 'hp' ? C.green : kind === 'msl' ? C.gold : C.purple;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const m = new THREE.Mesh(G.pickupGeo, mat);
  m.position.copy(pos);
  m.scale.setScalar(1.5);
  scene.add(m);
  pickups.push({ obj: m, kind, life: 22, spin: rnd(0.5, 2) });
  rings.spawn(pos, 6, kind === 'hp' ? 0x62ffb4 : kind === 'msl' ? 0xffd27a : 0xc86bff, 0.4);
}

function collectPickup(p) {
  if (p.kind === 'hp') { player.hp = Math.min(player.maxHp, player.hp + 28); GAME.lowHpWarned = player.hp <= 30; }
  if (p.kind === 'msl') player.missiles = Math.min(player.maxMissiles, player.missiles + 3);
  if (p.kind === 'power') player.triple = 12;
  audio.pickup();
  audio.playVoice('vo_supply', true);
  addScore(60);
  rings.spawn(p.obj.position, 9, 0x9ffcff, 0.4);
}

/* =========================================================
 *  锁定系统
 * ========================================================= */
let lockTarget = null, lockTimer = 0, locked = false;

function updateLock(dt) {
  let best = null, bestScore = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    TMP_V.copy(e.pos).sub(player.pos);
    const d = TMP_V.length();
    if (d > 340) continue;
    TMP_V.normalize();
    const ang = Math.acos(clamp(TMP_V.dot(player.fwd), -1, 1));
    if (ang > 0.26) continue;
    const s = ang * 900 + d * 0.12;
    if (s < bestScore) { bestScore = s; best = e; }
  }
  if (best !== lockTarget) { lockTarget = best; lockTimer = 0; locked = false; }
  if (lockTarget && lockTarget.alive) {
    lockTimer += dt;
    if (!locked && lockTimer > 0.5) {
      locked = true;
      audio.lockBeep(true);
      audio.playVoice('vo_lock');
    } else if (!locked && Math.floor(lockTimer * 12) !== Math.floor((lockTimer - dt) * 12)) {
      audio.lockBeep(false);
    }
  } else {
    lockTarget = null; locked = false; lockTimer = 0;
  }

  // 屏幕投影
  const box = $('lockBox');
  if (lockTarget && lockTarget.alive) {
    TMP_V.copy(lockTarget.pos).project(camera);
    if (TMP_V.z < 1) {
      const x = (TMP_V.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-TMP_V.y * 0.5 + 0.5) * window.innerHeight;
      const r = clamp(lockTarget.radius * 26, 26, 90);
      box.style.transform = `translate(${x}px, ${y}px) scale(${r / 50})`;
      box.classList.add('on');
      box.classList.toggle('locked', locked);
    } else box.classList.remove('on');
  } else box.classList.remove('on');
}

/* =========================================================
 *  波次导演
 * ========================================================= */
function announce(text, dur = 1800) {
  const el = $('announce');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(announce._t);
  announce._t = setTimeout(() => el.classList.remove('on'), dur);
}

function startWave(n) {
  GAME.wave = n;
  GAME.waveKills = 0;
  GAME.maxAlive = Math.min(12, 5 + Math.floor(n * 0.8));
  const queue = [];
  if (n % 5 === 0) queue.push('boss');
  const total = Math.min(26, 3 + Math.floor(n * 1.6));
  for (let i = 0; i < total; i++) {
    const r = Math.random();
    if (n >= 4 && r < 0.22) queue.push('heavy');
    else if (n >= 3 && r < 0.5) queue.push('ace');
    else queue.push('scout');
  }
  GAME.spawnQueue = queue;
  GAME.spawnTimer = 0.6;
  announce(`WAVE ${n}`, 1500);
  audio.playVoice('vo_wave', true);
  if (n % 3 === 0) spawnMines(4 + Math.min(6, n / 2 | 0));
}

function updateDirector(dt) {
  if (GAME.waveGap > 0) {
    GAME.waveGap -= dt;
    if (GAME.waveGap <= 0) startWave(GAME.wave + 1);
    return;
  }
  if (GAME.spawnQueue.length) {
    GAME.spawnTimer -= dt;
    const alive = enemies.filter((e) => e.alive).length;
    if (GAME.spawnTimer <= 0 && alive < GAME.maxAlive) {
      const t = GAME.spawnQueue.shift();
      if (t === 'boss') spawnBoss();
      else spawnEnemy(t);
      GAME.spawnTimer = Math.max(0.32, 1.25 - GAME.wave * 0.055) * rnd(0.7, 1.3);
    }
  } else if (enemies.filter((e) => e.alive).length === 0) {
    GAME.waveGap = 3.0;
    addScore(120 * GAME.wave);
    announce(`WAVE ${GAME.wave} CLEAR  +${120 * GAME.wave}`, 2000);
  }
}

/* =========================================================
 *  更新：玩家
 * ========================================================= */
function updatePlayer(dt) {
  const p = player;

  // --- 输入 -> 操纵量 ---
  let ix = 0, iy = 0;
  const kb = input.keys;
  if (kb.left) ix -= 1;
  if (kb.right) ix += 1;
  if (kb.up) iy -= 1;
  if (kb.down) iy += 1;
  if (ix === 0 && iy === 0 && input.useMouse) {
    ix = Math.abs(input.mx) > 0.06 ? input.mx : 0;
    iy = Math.abs(input.my) > 0.06 ? input.my : 0;
  }
  input.x += (clamp(ix, -1, 1) - input.x) * damp(9, dt);
  input.y += (clamp(iy, -1, 1) - input.y) * damp(9, dt);

  // --- 姿态 ---
  const yawRate = 1.75, pitchRate = 1.45;
  p.yaw -= input.x * yawRate * dt;
  p.pitch = clamp(p.pitch - input.y * pitchRate * dt, -0.62, 0.62);
  p.pitch += (0 - p.pitch) * damp(0.55, dt); // 缓慢自动回正
  p.bank += (-input.x * 0.95 - p.bank) * damp(5.2, dt);
  p.roll = p.bank;

  p.quat.setFromEuler(new THREE.Euler(p.pitch, p.yaw, p.roll, 'YXZ'));
  p.fwd.set(0, 0, -1).applyQuaternion(p.quat);
  p.right.set(1, 0, 0).applyQuaternion(p.quat);
  p.up.set(0, 1, 0).applyQuaternion(p.quat);

  // --- 速度 / 加力 ---
  const wantBoost = (kb.boost || input.boost) && p.boost > 2;
  p.boosting = wantBoost;
  p.boost = clamp(p.boost + (wantBoost ? -34 : 15) * dt, 0, 100);
  const target = wantBoost ? BOOST_SPEED : BASE_SPEED;
  p.speed += (target - p.speed) * damp(wantBoost ? 1.6 : 2.4, dt);
  p.vel.copy(p.fwd).multiplyScalar(p.speed);
  p.pos.addScaledVector(p.vel, dt);
  p.pos.y = clamp(p.pos.y, -56, 380);
  GAME.dist += p.speed * dt;

  p.obj.position.copy(p.pos);
  p.obj.quaternion.copy(p.quat);

  // --- 尾焰 ---
  const g = p.engineGlow;
  const boostK = wantBoost ? 1 : 0.45;
  g.scale.setScalar(boostK * rnd(0.85, 1.15));
  g.position.z = tailOffset(playerJet).z + 1.6 * boostK;
  g.material.opacity = 0.55 + 0.35 * boostK;
  g.material.color.setHex(wantBoost ? 0xa8f0ff : 0x59b8ff);

  // 尾迹粒子
  p.trailT -= dt;
  if (p.trailT <= 0) {
    p.trailT = 0.018;
    const tp = tailOffset(playerJet).clone().applyQuaternion(p.quat).add(p.pos);
    particles.spawn(tp, p.fwd.clone().multiplyScalar(-14).add(new THREE.Vector3(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2))),
      wantBoost ? C.cyan : new THREE.Color(0x4b8fd8), rnd(2.2, 4.2) * (wantBoost ? 1.5 : 1), rnd(0.25, 0.5), 2.2);
  }

  // --- 射击 ---
  p.fireCd -= dt;
  if ((input.fire || input.keys.fire) && p.fireCd <= 0) {
    fireGuns();
    p.fireCd = 0.078;
  }
  if (input.missile) { input.missile = false; fireMissile(); }
  if (p.triple > 0) p.triple -= dt;
  if (p.invuln > 0) p.invuln -= dt;

  // --- 相机 ---
  const camWant = TMP_V.set(0, 2.9, 9.9).applyQuaternion(p.quat).add(p.pos);
  camera.position.lerp(camWant, damp(7.5, dt));
  const look = TMP_V2.copy(p.pos).addScaledVector(p.fwd, 30).addScaledVector(p.up, 1.0);
  camera.up.copy(p.up);
  camera.lookAt(look);
  camera.rotateZ(-p.bank * 0.22);
  const wantFov = wantBoost ? 74 : 62;
  camera.fov += (wantFov - camera.fov) * damp(3.5, dt);
  camera.updateProjectionMatrix();

  // 抖动
  if (GAME.shake > 0.001) {
    GAME.shake *= Math.pow(0.0016, dt);
    const s = GAME.shake * 0.55;
    camera.position.x += rnd(-s, s);
    camera.position.y += rnd(-s, s);
    camera.position.z += rnd(-s, s);
  }

  audio.updateEngine(p.speed / BOOST_SPEED, wantBoost, 1);
}

/* =========================================================
 *  更新：敌机
 * ========================================================= */
function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.alive) {
      GAME.stats.removed++;
      scene.remove(e.obj);
      e.obj.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m) m.dispose();
      });
      if (e.marker) { scene.remove(e.marker); e.marker.material.dispose(); }
      enemies.splice(i, 1);
      continue;
    }
    const to = TMP_V.copy(player.pos).sub(e.pos);
    const d = to.length();
    to.normalize();

    // 转向
    const desired = to.clone();
    if (d < (e.kind === 'boss' ? 90 : 58)) desired.multiplyScalar(-0.85);
    e.evade.ph += dt * e.evade.f * (e.kind === 'boss' ? 0.5 : 1);
    const strafe = TMP_V2.copy(e.pos).sub(player.pos).cross(UP).normalize();
    desired.addScaledVector(strafe, Math.sin(e.evade.ph) * e.evade.a).normalize();
    const spd = e.type.speed * (e.kind === 'boss' ? 1 : 1);
    e.vel.lerp(desired.multiplyScalar(spd), damp(e.kind === 'boss' ? 0.8 : 1.9, dt));
    e.pos.addScaledVector(e.vel, dt);
    e.pos.y = clamp(e.pos.y, -54, 340);

    // 朝向：局部 -Z 是机头，需指向玩家 ⇒ 局部 +Z 背对玩家
    const z = TMP_V2.copy(e.pos).sub(player.pos).normalize();
    if (z.lengthSq() < 0.001) z.set(0, 0, 1);
    const x = new THREE.Vector3().crossVectors(UP, z).normalize();
    if (x.lengthSq() < 0.0001) x.set(1, 0, 0);
    const y = new THREE.Vector3().crossVectors(z, x);
    TMP_M.makeBasis(x, y, z);
    TMP_Q.setFromRotationMatrix(TMP_M);
    e.obj.quaternion.slerp(TMP_Q, damp(2.6, dt));
    // 侧倾
    const lateral = e.vel.clone().addScaledVector(desired, -e.vel.length());
    e.bank += (clamp(lateral.dot(x) * 0.05, -0.7, 0.7) - e.bank) * damp(3, dt);
    if (e.bankGroup) e.bankGroup.rotation.z = -e.bank;

    e.obj.position.copy(e.pos);

    // 威胁标记（始终朝向相机、按距离缩放到固定屏占比）
    if (e.marker) {
      const md = e.pos.distanceTo(player.pos);
      e.marker.visible = md > 42 && md < 900;
      if (e.marker.visible) {
        e.marker.position.copy(e.pos).addScaledVector(UP, e.radius * 2.0 + 7);
        e.marker.quaternion.copy(camera.quaternion);
        const pulse = 1 + Math.sin(GAME.time * 6 + e.evade.ph) * 0.09;
        e.marker.scale.setScalar(clamp(md * 0.016, 0.9, 5.0) * pulse * (e.kind === 'boss' ? 1.9 : 1));
        e.marker.material.opacity = clamp(1.25 - md / 520, 0.22, 0.92);
      }
    }

    // 开火
    e.fireCd -= dt;
    if (e.fireCd <= 0 && d < 240 && player.alive) {
      const ang = Math.acos(clamp(to.dot(player.fwd), -1, 1));
      if (ang < 0.5) {
        enemyFire(e);
        e.fireCd = e.type.fire * rnd(0.8, 1.25);
      } else e.fireCd = 0.25;
    }

    // 受击闪白
    const flashing = e.hitFlash > 0;
    if (flashing) e.hitFlash -= dt;
    if (flashing || e._wasFlashing) { flashObject(e.obj, flashing); e._wasFlashing = flashing; }

    // 撞机
    if (player.alive && d < e.radius + player.radius + 1.2) {
      damagePlayer(e.kind === 'boss' ? 30 : 20);
      if (e.kind === 'boss') e.hp -= 6;
      else killEnemy(e);
      explode(e.pos, 1.1, C.fire);
    }

    // 离太远就删除
    if (d > 1400) { e.alive = false; GAME.stats.far++; }
  }
}

/* =========================================================
 *  更新：弹丸 / 地雷 / 补给
 * ========================================================= */
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    if (b.missile && b.target && b.target.alive) {
      // 追踪
      const want = TMP_V.copy(b.target.pos).sub(b.pos).normalize();
      const dir = TMP_V2.copy(b.vel).normalize();
      dir.lerp(want, damp(3.4, dt)).normalize();
      b.vel.copy(dir).multiplyScalar(Math.min(b.speed, b.vel.length() + 130 * dt));
      b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      if (Math.random() < 0.75) {
        particles.spawn(b.pos, new THREE.Vector3(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)), C.smoke, rnd(2, 4), 0.5, 1.6);
      }
    }
    b.pos.addScaledVector(b.vel, dt);
    b.mesh.position.copy(b.pos);

    let hit = false;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (b.pos.distanceTo(e.pos) < e.radius + 1.4) {
        e.hp -= b.dmg;
        e.hitFlash = 0.12;
        hit = true;
        if (e.hp <= 0) killEnemy(e, b.missile);
        else {
          particles.spawn(b.pos, b.vel.clone().multiplyScalar(-0.15), C.spark, 3.4, 0.22, 3);
          if (b.missile) { explode(b.pos, 1.0, C.fire); areaDamage(b.pos, 20, 16); }
        }
        break;
      }
    }
    if (!hit) {
      for (const m of mines) {
        if (m.hp > 0 && b.pos.distanceTo(m.obj.position) < m.radius + 1.4) {
          m.hp -= b.dmg; hit = true;
          particles.spawn(b.pos, b.vel.clone().multiplyScalar(-0.15), C.spark, 3.2, 0.2, 3);
          if (m.hp <= 0) {
            explode(m.obj.position, 1.1, C.fire);
            addScore(50);
            scene.remove(m.obj);
            m.hp = -1;
          }
          break;
        }
      }
    }
    if (hit || b.life <= 0) {
      if (b.missile && !hit) explode(b.pos, 0.9, C.fire);
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }
}

function areaDamage(pos, radius, dmg) {
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = e.pos.distanceTo(pos);
    if (d < radius + e.radius) {
      e.hp -= dmg * (1 - d / (radius + e.radius) * 0.6);
      e.hitFlash = 0.12;
      if (e.hp <= 0) killEnemy(e, true);
    }
  }
}

function updateEBullets(dt) {
  for (let i = eBullets.length - 1; i >= 0; i--) {
    const b = eBullets[i];
    b.life -= dt;
    if (b.homing && player.alive) {
      const want = TMP_V.copy(player.pos).sub(b.pos).normalize();
      const dir = TMP_V2.copy(b.vel).normalize();
      dir.lerp(want, damp(b.turn, dt)).normalize();
      b.vel.copy(dir).multiplyScalar(Math.min(105, b.vel.length() + 26 * dt));
      if (Math.random() < 0.6) particles.spawn(b.pos, new THREE.Vector3(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)), C.red, rnd(1.8, 3.4), 0.4, 1.8);
    }
    b.pos.addScaledVector(b.vel, dt);
    b.mesh.position.copy(b.pos);

    let dead = b.life <= 0;
    if (!dead && player.alive) {
      if (b.pos.distanceTo(player.pos) < 4.2) {
        damagePlayer(b.dmg, b.homing);
        explode(b.pos, 0.7, C.red);
        dead = true;
      } else if (b.homing) {
        // 玩家可以击落来袭导弹
        if (b.pos.distanceTo(player.pos) > 210) dead = true;
      }
    }
    if (dead) {
      scene.remove(b.mesh);
      if (b.mesh.material && b.mesh.material !== G.eBulletMat) b.mesh.material.dispose();
      eBullets.splice(i, 1);
    }
  }
  // 来袭导弹警报
  let warn = false;
  for (const b of eBullets) if (b.homing && player.alive && b.pos.distanceTo(player.pos) < 230) warn = true;
  const wb = $('warnBox');
  if (warn) {
    if (wb.classList.contains('hidden')) {
      wb.classList.remove('hidden');
      audio.playVoice('vo_warn', true);
    }
    GAME.missWarn -= dt;
    if (GAME.missWarn <= 0) { GAME.missWarn = 1.1; audio.alarm(); }
  } else wb.classList.add('hidden');
}

function updateMines(dt) {
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    if (m.hp <= 0) { mines.splice(i, 1); continue; }
    m.obj.rotation.x += m.spin.x * dt;
    m.obj.rotation.y += m.spin.y * dt;
    m.obj.rotation.z += m.spin.z * dt;
    m.obj.material.emissiveIntensity = 1.2 + Math.sin(GAME.time * 6 + i) * 0.5;
    if (player.alive && m.obj.position.distanceTo(player.pos) < m.radius + 3) {
      damagePlayer(16);
      explode(m.obj.position, 1.2, C.red);
      scene.remove(m.obj);
      mines.splice(i, 1);
      continue;
    }
    if (m.obj.position.distanceTo(player.pos) > 900) {
      scene.remove(m.obj);
      mines.splice(i, 1);
    }
  }
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt;
    p.obj.rotation.y += p.spin * dt;
    p.obj.rotation.x += p.spin * 0.6 * dt;
    p.obj.material.opacity = 0.55 + 0.4 * Math.sin(GAME.time * 5 + i);
    if (player.alive && p.obj.position.distanceTo(player.pos) < 6) {
      collectPickup(p);
      scene.remove(p.obj);
      pickups.splice(i, 1);
      continue;
    }
    if (p.life <= 0) { scene.remove(p.obj); pickups.splice(i, 1); }
  }
}

/* =========================================================
 *  HUD
 * ========================================================= */
const radarCtx = $('radar').getContext('2d');

function drawRadar() {
  const ctx = radarCtx;
  const W = 300, H = 300, cx = W / 2, cy = H / 2, R = 138;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  // 背景
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(4,20,32,.55)'; ctx.fill();
  ctx.strokeStyle = 'rgba(58,231,255,.45)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = 'rgba(58,231,255,.18)'; ctx.lineWidth = 1;
  for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.arc(cx, cy, R * i / 3, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
  // 扫描线
  const sweep = (GAME.time * 1.6) % (Math.PI * 2);
  const grad = ctx.createConicGradient ? null : null;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R, sweep - 0.5, sweep);
  ctx.closePath();
  ctx.fillStyle = 'rgba(58,231,255,.12)'; ctx.fill();
  ctx.restore();

  const f = player.fwd, r = player.right;
  const blip = (pos, color, size) => {
    TMP_V.copy(pos).sub(player.pos);
    const fx = TMP_V.dot(f), fy = TMP_V.dot(r);
    const range = 460;
    if (Math.abs(fx) > range || Math.abs(fy) > range) return;
    const px = cx + (fy / range) * R;
    const py = cy - (fx / range) * R;
    ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
  };
  for (const m of mines) blip(m.obj.position, 'rgba(255,77,94,.9)', 3);
  for (const p of pickups) blip(p.obj.position, 'rgba(92,255,177,.95)', 3);
  for (const b of eBullets) if (b.homing) blip(b.pos, 'rgba(255,200,97,.95)', 3);
  for (const e of enemies) {
    if (!e.alive) continue;
    const col = e.kind === 'boss' ? 'rgba(196,107,255,1)' : e.kind === 'heavy' ? 'rgba(255,138,43,1)' : 'rgba(255,90,74,1)';
    blip(e.pos, col, e.kind === 'boss' ? 7 : 4.5);
  }
  // 自机
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 6, cy + 7); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 6, cy + 7);
  ctx.closePath();
  ctx.fillStyle = '#eafcff'; ctx.fill();
  ctx.restore();
}

function updateHUD(dt) {
  GAME.hudTick -= dt;
  const now = GAME.hudTick <= 0;
  if (now) GAME.hudTick = 0.06;

  $('score').textContent = GAME.score.toLocaleString();
  $('best').textContent = 'BEST ' + GAME.best.toLocaleString();
  $('wave').textContent = GAME.wave;
  $('hpBar').style.width = `${(player.hp / player.maxHp) * 100}%`;
  $('hpBar').classList.toggle('low', player.hp <= 35);
  $('hpNum').textContent = Math.ceil(player.hp);
  $('boostBar').style.width = `${player.boost}%`;
  $('boostNum').textContent = Math.round(player.boost);
  $('missileNum').textContent = player.missiles;
  $('speedNum').textContent = Math.round(player.speed * 3.1);
  $('altNum').textContent = Math.round(player.pos.y * 12 + 1200);
  $('throttleBar').style.width = `${((player.speed - 40) / (BOOST_SPEED - 40)) * 100}%`;

  // BOSS 血条
  const boss = enemies.find((e) => e.kind === 'boss' && e.alive);
  const bb = $('bossBar');
  if (boss) {
    bb.classList.remove('hidden');
    $('bossFill').style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    $('bossHpNum').textContent = Math.ceil(boss.hp);
  } else bb.classList.add('hidden');

  const cp = $('comboPanel');
  cp.classList.toggle('on', GAME.combo > 1.05);
  $('combo').textContent = 'x' + GAME.combo.toFixed(1);
  const wt = $('weaponTag');
  wt.textContent = player.triple > 0 ? 'TRIPLE' : 'GUN';
  wt.classList.toggle('hot', player.triple > 0);

  if (now) drawRadar();
}

/* =========================================================
 *  主循环
 * ========================================================= */
const clock = new THREE.Clock();

function frame() {
  GAME.frames++;
  const raw = Math.min(0.05, clock.getDelta());
  GAME.time += raw;
  audio.tickSubtitles(raw);

  if (GAME.state === 'playing') {
    if (GAME.timeScale < 1) GAME.timeScale = Math.min(1, GAME.timeScale + raw * 0.8);
    const dt = raw * GAME.timeScale;
    if (GAME.comboTimer > 0) {
      GAME.comboTimer -= dt;
      if (GAME.comboTimer <= 0) GAME.combo = 1;
    }
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateEBullets(dt);
    updateMines(dt);
    updatePickups(dt);
    updateDirector(dt);
    updateLock(dt);
    updateHUD(dt);
  } else if (GAME.state === 'dead') {
    const dt = raw * GAME.timeScale;
    GAME.deadTimer -= raw;
    updateEnemies(dt * 0.4);
    updateBullets(dt * 0.4);
    updateEBullets(dt);
    if (GAME.deadTimer <= 0) showGameOver();
  }

  particles.update(raw);
  rings.update(raw);
  flashes.update(raw);
  sky.update(GAME.time);
  stars.update(GAME.time, camera);
  grid.update(player.pos, GAME.dist, GAME.time);
  props.update(player.pos, player.fwd, raw);

  renderer.render(scene, camera);
}

/* =========================================================
 *  流程控制
 * ========================================================= */
function resetGame() {
  // 清理
  for (const e of enemies) scene.remove(e.obj);
  enemies.length = 0;
  for (const b of bullets) scene.remove(b.mesh);
  bullets.length = 0;
  for (const b of eBullets) scene.remove(b.mesh);
  eBullets.length = 0;
  for (const m of mines) scene.remove(m.obj);
  mines.length = 0;
  for (const p of pickups) scene.remove(p.obj);
  pickups.length = 0;

  GAME.score = 0; GAME.combo = 1; GAME.comboTimer = 0; GAME.maxCombo = 1;
  GAME.kills = 0; GAME.wave = 0; GAME.waveGap = 0; GAME.spawnQueue = [];
  GAME.dist = 0; GAME.shake = 0; GAME.timeScale = 1; GAME.deadTimer = 0;
  GAME.lowHpWarned = false;
  GAME.stats = { spawned: 0, removed: 0, far: 0, hit: 0 };
  GAME.frames = 0;

  player.pos.set(0, 24, 0);
  player.yaw = 0; player.pitch = 0; player.roll = 0; player.bank = 0;
  player.speed = BASE_SPEED; player.hp = player.maxHp;
  player.missiles = 6; player.boost = 100; player.triple = 0; player.invuln = 1.2;
  player.alive = true;
  player.obj.visible = true;
  player.engineGlow.visible = true;
  player.quat.identity();
  player.obj.position.copy(player.pos);
  player.fwd.set(0, 0, -1);
  camera.position.copy(player.pos).add(new THREE.Vector3(0, 2.9, 9.9));
  camera.fov = 62; camera.updateProjectionMatrix();
  lockTarget = null; locked = false;
  input.fire = false; input.missile = false; input.x = 0; input.y = 0;
}

function startGame() {
  audio.resume();
  resetGame();
  GAME.state = 'playing';
  setScreen(null);
  audio.startEngine();
  audio.playVoice('vo_start', true);
  startWave(1);
}

function showGameOver() {
  GAME.state = 'menu';
  GAME.best = Math.max(GAME.best, GAME.score);
  localStorage.setItem('skystrike3d.best', String(GAME.best));
  $('best').textContent = 'BEST ' + GAME.best.toLocaleString();
  $('goScore').textContent = GAME.score.toLocaleString();
  $('goWave').textContent = GAME.wave;
  $('goKills').textContent = GAME.kills;
  $('goCombo').textContent = 'x' + GAME.maxCombo.toFixed(1);
  $('goBest').textContent = GAME.score >= GAME.best ? '★ 新纪录 ★' : `最佳记录 ${GAME.best.toLocaleString()}`;
  setScreen('gameover');
}

function togglePause() {
  if (GAME.state === 'playing') {
    GAME.state = 'paused';
    setScreen('pause');
    audio.stopEngine();
  } else if (GAME.state === 'paused') {
    GAME.state = 'playing';
    setScreen(null);
    audio.startEngine();
  }
}

/* ---------- 按钮 ---------- */
$('btnStart').addEventListener('click', () => { audio.resume(); audio.ui(); startGame(); });
$('btnRetry').addEventListener('click', () => { audio.ui(); startGame(); });
$('btnResume').addEventListener('click', () => { audio.ui(); togglePause(); });
$('btnQuit').addEventListener('click', () => {
  audio.ui();
  GAME.state = 'menu';
  audio.stopEngine();
  setScreen('menu');
});
$('btnPause').addEventListener('click', () => { audio.ui(); togglePause(); });
let muted = false;
$('btnSound').addEventListener('click', () => {
  muted = !muted;
  audio.setMuted(muted);
  $('btnSound').textContent = muted ? '🔇' : '🔊';
  $('btnSound').classList.toggle('off', muted);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && GAME.state === 'playing') togglePause();
});

/* ---------- 启动 ---------- */
window.SKYSTRIKE = { GAME, player, enemies, bullets, eBullets, particles, pickups, mines, rings, flashes, camera, renderer, scene, startGame, input, audio, spawnEnemy, spawnBoss, fireMissile, damagePlayer, killEnemy, dropPickup, lock: () => ({ t: lockTarget, locked }), frames: () => GAME.frames };

loadAssets().then(() => {
  GAME.state = 'menu';
  setScreen('menu');
  // 菜单待机时也让镜头缓慢环绕
  player.pos.set(0, 24, 0);
  renderer.setAnimationLoop(frame);
}).catch((err) => {
  console.error(err);
  $('loadTip').textContent = '资源加载失败，请刷新重试';
});
