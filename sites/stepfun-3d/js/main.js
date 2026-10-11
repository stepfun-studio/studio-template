/* ═══════════════════════════════════════════════════════════
   阶跃星辰 · 星海藏馆 — StepFun Digital Pavilion
   three.js r160 · PBR · UnrealBloom · OrbitControls
   ═══════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { OrbitControls }    from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader }       from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }       from 'three/addons/postprocessing/OutputPass.js';

/* ─────────────────────────── 展品数据 ─────────────────────────── */

const EXHIBITS = [
  {
    id: 'helmet',
    file: 'assets/models/DamagedHelmet.json',
    no: '01',
    name: '探索者头盔',
    en: 'THE EXPLORER',
    tagline: '为星海远征而铸',
    desc: '磨损的涂装记录着一次次深空任务。装甲之下的微光，是指引归途的那颗星。',
    specs: [
      ['材质', 'PBR · 金属 / 粗糙度'],
      ['贴图', '2K · 5 通道'],
      ['授权', 'CC BY 4.0 / CC BY-NC 4.0'],
      ['来源', 'Khronos glTF Sample Assets']
    ],
    chips: ['实时 PBR', '可交互', '悬浮展陈'],
    accent: 0xffd9a8,
    frame: { pos: [2.9, 2.55, 5.9], target: [0, 1.62, 0] }
  },
  {
    id: 'lamp',
    file: 'assets/models/IridescenceLamp.json',
    no: '02',
    name: '虹彩灯座',
    en: 'IRIDESCENCE',
    tagline: '把一整个房间的光谱折叠进口袋',
    desc: '一枚被虹彩包裹的玻璃球体。光穿过它时发生色散，于是日常也被折成了小小的极光。',
    specs: [
      ['材质', 'KHR 透射 · 虹彩 · 体积'],
      ['光学', '色散 / 折射 / 薄膜干涉'],
      ['授权', 'CC BY 4.0'],
      ['来源', 'Khronos glTF Sample Assets']
    ],
    chips: ['光学材质', '实时折射', '悬浮展陈'],
    accent: 0xcfe4ff,
    frame: { pos: [1.4, 2.5, 6.4], target: [0, 1.66, 0] }
  },
  {
    id: 'skull',
    file: 'assets/models/ScatteringSkull.json',
    no: '03',
    name: '青玉星核',
    en: 'JADE CORE',
    tagline: '由光与时间共同雕琢',
    desc: '半透明的结构里，光被反复散射。它像一块凝固的星云，也像一次尚未结束的坍缩。',
    specs: [
      ['材质', '次表面散射 · 体积'],
      ['光学', '漫透射 / 色散 / IOR'],
      ['授权', 'CC0 1.0'],
      ['来源', 'Khronos glTF Sample Assets']
    ],
    chips: ['次表面散射', '体积材质', '悬浮展陈'],
    accent: 0x9ff0dc,
    frame: { pos: [-2.7, 2.3, 5.8], target: [0, 1.55, 0] }
  }
];

/* ─────────────────────────── 光环境 ─────────────────────────── */

const MOODS = {
  stellar: {
    key: 0xffe2bb, keyI: 2.7, rim: 0x7ab8ff, rimI: 3.2,
    fill: 0x2b3a5c, fillI: 0.5, amb: 0x1a2334, ambI: 0.55,
    envTop: 0xffffff, envTopI: 2.6, envWarm: 0xffcf9a, envWarmI: 2.4,
    envCool: 0x7fb0ff, envCoolI: 2.2, envBack: 0x9fd0ff, envBackI: 1.1,
    envI: 0.74, bloom: 0.58, exposure: 1.05,
    nebA: 0x1b2a4a, nebB: 0x2b2352, pool: 0.55
  },
  gold: {
    key: 0xffd39a, keyI: 3.3, rim: 0xffb066, rimI: 1.9,
    fill: 0x3d2c1c, fillI: 0.6, amb: 0x2b2118, ambI: 0.6,
    envTop: 0xfff0dd, envTopI: 2.4, envWarm: 0xffb35e, envWarmI: 3.2,
    envCool: 0x9a7bff, envCoolI: 1.2, envBack: 0xffc98a, envBackI: 1.4,
    envI: 0.82, bloom: 0.46, exposure: 1.02,
    nebA: 0x3d2b18, nebB: 0x2c1c30, pool: 0.6
  },
  blue: {
    key: 0xd8e8ff, keyI: 2.2, rim: 0x5f7cff, rimI: 3.6,
    fill: 0x1c2545, fillI: 0.6, amb: 0x141a2e, ambI: 0.55,
    envTop: 0xdfe9ff, envTopI: 2.2, envWarm: 0x7fa8ff, envWarmI: 1.6,
    envCool: 0x5f7cff, envCoolI: 3.0, envBack: 0x8f7fff, envBackI: 1.6,
    envI: 0.66, bloom: 0.70, exposure: 1.08,
    nebA: 0x16224a, nebB: 0x241a4a, pool: 0.5
  }
};

/* ─────────────────────────── 工具 ─────────────────────────── */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = t => {
  const c1 = 1.34, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const tweens = new Set();
function tween({ dur = 1, delay = 0, ease = easeInOutCubic, onUpdate, onComplete }) {
  return new Promise(resolve => {
    tweens.add({ t: -delay, dur, ease, onUpdate, onComplete, resolve });
  });
}
function updateTweens(dt) {
  for (const tw of [...tweens]) {
    tw.t += dt;
    if (tw.t < 0) continue;
    const k = clamp(tw.t / tw.dur, 0, 1);
    tw.onUpdate && tw.onUpdate(tw.ease(k), k);
    if (k >= 1) {
      tweens.delete(tw);
      tw.onComplete && tw.onComplete();
      tw.resolve();
    }
  }
}

/* ─────────────────────────── 基础对象 ─────────────────────────── */

const canvas = document.getElementById('stage');
const isMobile = matchMedia('(max-width: 860px)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.75 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x070b14, 15, 64);

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 220);
camera.position.set(0.4, 3.6, 12.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.rotateSpeed = 0.78;
controls.zoomSpeed = 0.85;
controls.panSpeed = 0.5;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.minDistance = 3.1;
controls.maxDistance = 14;
controls.minPolarAngle = 0.16;
controls.maxPolarAngle = 1.66;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.55;

/* ─────────────────────── 后处理（泛光） ─────────────────────── */

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.75 : 2));
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.72, 0.82
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ─────────────────────── 背景：星云天幕 ─────────────────────── */

const backdropMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    uTime:  { value: 0 },
    uTop:   { value: new THREE.Color(0x070b16) },
    uBot:   { value: new THREE.Color(0x0b1122) },
    uNebA:  { value: new THREE.Color(0x1b2a4a) },
    uNebB:  { value: new THREE.Color(0x2b2352) }
  },
  vertexShader: /* glsl */`
    varying vec3 vPos;
    void main(){
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform float uTime;
    uniform vec3 uTop, uBot, uNebA, uNebB;
    varying vec3 vPos;

    float hash(vec3 p){
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 x){
      vec3 i = floor(x), f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                     mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                     mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p){
      float a = 0.5, s = 0.0;
      for(int i = 0; i < 5; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; }
      return s;
    }
    void main(){
      vec3 d = normalize(vPos);
      float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 col = mix(uBot, uTop, pow(h, 1.35));

      float neb = fbm(d * 2.6 + vec3(0.0, uTime * 0.012, uTime * 0.006));
      col += uNebA * smoothstep(0.44, 0.96, neb) * 0.55;

      float neb2 = fbm(d * 4.3 + vec3(uTime * 0.01, 0.0, -uTime * 0.008));
      col += uNebB * smoothstep(0.56, 1.0, neb2) * 0.38;

      float g = pow(max(0.0, dot(d, normalize(vec3(0.12, 0.10, -1.0)))), 5.0);
      col += uNebA * g * 0.10;

      gl_FragColor = vec4(col, 1.0);
    }`
});
const backdrop = new THREE.Mesh(new THREE.SphereGeometry(95, 48, 32), backdropMat);
scene.add(backdrop);

/* ─────────────────────── 星野 / 浮尘 ─────────────────────── */

function makeStars(count) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const col = new Float32Array(count * 3);
  const palette = [0xffffff, 0xffe8c8, 0xcfe4ff, 0xd9c39a, 0x9fd0ff].map(c => new THREE.Color(c));

  for (let i = 0; i < count; i++) {
    const r = 26 + Math.random() * 46;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - 2 * Math.random());
    pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) * 0.72 + 4;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    size[i] = 0.6 + Math.pow(Math.random(), 3.4) * 2.5;
    phase[i] = Math.random();
    const c = palette[(Math.random() * palette.length) | 0];
    const b = 0.45 + Math.random() * 0.55;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uPr: { value: renderer.getPixelRatio() } },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aPhase; attribute vec3 aColor;
      uniform float uTime, uPr;
      varying vec3 vColor; varying float vTw;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPr * (120.0 / max(1.0, -mv.z));
        vTw = 0.55 + 0.45 * sin(uTime * 1.4 + aPhase * 6.2831);
        vColor = aColor;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vTw;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a *= a;
        gl_FragColor = vec4(vColor * vTw, a * vTw);
      }`
  });
  return new THREE.Points(geo, mat);
}

const stars = makeStars(isMobile ? 600 : 1150);
scene.add(stars);

function makeDust(count) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const speed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = 1.2 + Math.random() * 6.5, a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 7;
    pos[i * 3 + 2] = Math.sin(a) * r;
    size[i] = 0.45 + Math.random() * 1.05;
    speed[i] = 0.05 + Math.random() * 0.16;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uPr: { value: renderer.getPixelRatio() }, uColor: { value: new THREE.Color(0xd9c39a) } },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aSpeed;
      uniform float uTime, uPr;
      varying float vA;
      void main(){
        vec3 p = position;
        p.y = mod(p.y + uTime * aSpeed, 7.0);
        p.x += sin(uTime * 0.25 + p.z * 2.0) * 0.18;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPr * (170.0 / max(1.0, -mv.z));
        vA = smoothstep(7.0, 4.5, p.y) * 0.32;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(uColor, a);
      }`
  });
  return new THREE.Points(geo, mat);
}
const dust = makeDust(isMobile ? 90 : 190);
scene.add(dust);

/* ─────────────────────── 地面 / 展台 ─────────────────────── */

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(46, 96),
  new THREE.MeshStandardMaterial({ color: 0x05070d, metalness: 1.0, roughness: 0.33 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

function radialTexture(inner, stops) {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, inner, s / 2, s / 2, s / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const shadowTex = radialTexture(0, [[0, 'rgba(0,0,0,.85)'], [0.45, 'rgba(0,0,0,.45)'], [1, 'rgba(0,0,0,0)']]);
const poolTex = radialTexture(0, [[0, 'rgba(255,255,255,.95)'], [0.35, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);

const stageGroup = new THREE.Group();
scene.add(stageGroup);

const PED_TOP = 0.145;

const pedestal = new THREE.Group();
const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(1.52, 1.66, 0.29, 128),
  new THREE.MeshStandardMaterial({ color: 0x0a0d15, metalness: 0.98, roughness: 0.2 })
);
disc.position.y = PED_TOP - 0.145;
pedestal.add(disc);

const discEdge = new THREE.Mesh(
  new THREE.TorusGeometry(1.53, 0.008, 12, 200),
  new THREE.MeshBasicMaterial({ color: 0xd9c39a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
);
discEdge.rotation.x = -Math.PI / 2;
discEdge.position.y = PED_TOP;
pedestal.add(discEdge);

const contactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(3.6, 3.6),
  new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTex, transparent: true, opacity: 0.75, depthWrite: false })
);
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.position.y = PED_TOP + 0.002;
pedestal.add(contactShadow);

const pool = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 9),
  new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xd9c39a })
);
pool.rotation.x = -Math.PI / 2;
pool.position.y = 0.012;
pedestal.add(pool);
stageGroup.add(pedestal);

/* 悬浮光环 */
function makeRing(radius, tube, color, opacity) {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 10, 220),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  return m;
}
const ringA = makeRing(2.62, 0.0075, 0xd9c39a, 0.9);
const ringB = makeRing(2.05, 0.004, 0x8fd3ff, 0.55);
ringB.rotation.set(-Math.PI / 2 + 0.42, 0, 0.3);
stageGroup.add(ringA, ringB);

/* 悬浮光束 */
const beamMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uColor: { value: new THREE.Color(0xd9c39a) }, uOpacity: { value: 0.1 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
    void main(){
      float edge = smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x);
      float fall = pow(1.0 - vUv.y, 2.0);
      gl_FragColor = vec4(uColor, edge * fall * uOpacity);
    }`
});
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.05, 3.4, 64, 1, true), beamMat);
beam.position.y = 1.7;
stageGroup.add(beam);

/* ─────────────────────── 灯光 ─────────────────────── */

const keyLight = new THREE.DirectionalLight(0xffe2bb, 2.7);
keyLight.position.set(-3.6, 5.4, 4.4);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x7ab8ff, 3.2);
rimLight.position.set(4.4, 2.8, -4.8);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0x2b3a5c, 0.5);
fillLight.position.set(0.6, 1.4, 6.2);
scene.add(fillLight);

const ambLight = new THREE.HemisphereLight(0x1a2334, 0x05070c, 0.55);
scene.add(ambLight);

const poolLight = new THREE.PointLight(0xd9c39a, 3, 9, 2);
poolLight.position.set(0, 0.5, 0);
scene.add(poolLight);

/* ─────────────────────── 环境反射（PMREM） ─────────────────────── */

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

function buildEnvironment(mood) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(26, 15, 26),
    new THREE.MeshBasicMaterial({ color: 0x05070c, side: THREE.BackSide })
  );
  s.add(room);

  const panel = (w, h, color, intensity, pos, look) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
        side: THREE.DoubleSide
      })
    );
    m.position.set(...pos);
    m.lookAt(...look);
    s.add(m);
  };

  panel(12, 7, mood.envTop, mood.envTopI, [0, 6.6, 0], [0, 0, 0]);
  panel(9, 8, mood.envWarm, mood.envWarmI, [-8, 1.8, 2.4], [0, 1.2, 0]);
  panel(9, 8, mood.envCool, mood.envCoolI, [8, 1.8, -1.6], [0, 1.2, 0]);
  panel(12, 3.4, mood.envBack, mood.envBackI, [0, 2.4, -9], [0, 1.4, 0]);
  panel(10, 5, mood.envWarm, 0.35, [0, -1.5, 8], [0, 0, 0]);

  const rt = pmrem.fromScene(s, 0.035);
  s.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return rt;
}

/* ─────────────────────── 状态 & 目标值 ─────────────────────── */

const state = {
  exhibit: 0,
  mood: 'stellar',
  autoRotate: !reduceMotion,
  busy: false,
  started: false,
  interacted: false
};

const cur = {
  key: new THREE.Color(), rim: new THREE.Color(), fill: new THREE.Color(),
  amb: new THREE.Color(), pool: new THREE.Color(),
  nebA: new THREE.Color(), nebB: new THREE.Color(),
  accent: new THREE.Color(),
  keyI: 0, rimI: 0, fillI: 0, ambI: 0, envI: 0, bloom: 0, poolI: 0, exposure: 0
};
const tgt = { ...cur };
for (const k of ['key', 'rim', 'fill', 'amb', 'pool', 'nebA', 'nebB', 'accent']) tgt[k] = new THREE.Color();

let envTargets = {};
function setMoodTargets(name) {
  const m = MOODS[name];
  tgt.key.set(m.key); tgt.rim.set(m.rim); tgt.fill.set(m.fill); tgt.amb.set(m.amb);
  tgt.nebA.set(m.nebA); tgt.nebB.set(m.nebB);
  tgt.keyI = m.keyI; tgt.rimI = m.rimI; tgt.fillI = m.fillI; tgt.ambI = m.ambI;
  tgt.envI = m.envI; tgt.bloom = m.bloom; tgt.exposure = m.exposure; tgt.poolI = m.pool;
  envTargets = m;
}

function applyEnvironment(name) {
  const m = MOODS[name];
  const rt = buildEnvironment(m);
  if (scene.environment) scene.environment.dispose();
  scene.environment = rt.texture;
  scene.environmentIntensity = m.envI;
}

function setAccent(hex) { tgt.accent.set(hex); }

/* ─────────────────────── 展品装载 ─────────────────────── */

const FIT = 2.15;
const FLOAT_GAP = 0.62;
const cache = new Map();
let current = null;
const loader = new GLTFLoader();

function prepareModel(gltf) {
  const root = gltf.scene;
  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = false; o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        if (!m) return;
        if ('envMapIntensity' in m) m.envMapIntensity = 1.05;
        if (m.map) m.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        m.needsUpdate = true;
      });
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = FIT / maxDim;
  root.position.copy(center).negate();

  const h = size.y * scale;
  const group = new THREE.Group();
  group.add(root);
  group.scale.setScalar(scale);

  return {
    group, root, scale, height: h,
    baseY: FLOAT_GAP + h * 0.5
  };
}

/* 模型以 base64 形式打包在 JSON 中，下载后解码为 glTF 二进制再解析 */
function fetchBase64(url, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'text';
    xhr.onprogress = ev => {
      if (onProgress) onProgress({ lengthComputable: ev.lengthComputable, loaded: ev.loaded, total: ev.total });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText).d); }
        catch (err) { reject(err); }
      } else reject(new Error(`HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('模型下载失败'));
    xhr.send();
  });
}

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function loadEntry(ex, onProgress) {
  if (cache.has(ex.id)) return cache.get(ex.id);
  const b64 = await fetchBase64(ex.file, onProgress);
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(base64ToArrayBuffer(b64), '', resolve, reject);
  });
  const entry = prepareModel(gltf);
  entry.ex = ex;
  cache.set(ex.id, entry);
  return entry;
}

/* ─────────────────────── UI ─────────────────────── */

const ui = {
  loader: document.getElementById('loader'),
  loaderBar: document.getElementById('loaderBar'),
  loaderStatus: document.getElementById('loaderStatus'),
  plaqueInner: document.getElementById('plaqueInner'),
  exNo: document.getElementById('exNo'),
  exTitle: document.getElementById('exTitle'),
  exEn: document.getElementById('exEn'),
  exTagline: document.getElementById('exTagline'),
  exDesc: document.getElementById('exDesc'),
  exSpecs: document.getElementById('exSpecs'),
  exChips: document.getElementById('exChips'),
  switcher: document.getElementById('switcher'),
  creditModel: document.getElementById('creditModel'),
  hint: document.getElementById('hint'),
  btnRotate: document.getElementById('btnRotate'),
  btnReset: document.getElementById('btnReset'),
  moodGroup: document.getElementById('moodGroup'),
  about: document.getElementById('about'),
  aboutClose: document.getElementById('aboutClose'),
  navAbout: document.getElementById('navAbout'),
  navExhibits: document.getElementById('navExhibits')
};

/* 切换器 */
EXHIBITS.forEach((ex, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sw-item' + (i === 0 ? ' is-active' : '');
  b.dataset.index = i;
  b.innerHTML = `<span class="sw-no">${ex.no}</span>
    <span class="sw-body"><span class="sw-name">${ex.name}</span>
    <span class="sw-en">${ex.en}</span></span>`;
  b.addEventListener('click', () => switchTo(i));
  ui.switcher.appendChild(b);
});
const swItems = [...ui.switcher.querySelectorAll('.sw-item')];

function paintPlaque(ex) {
  ui.exNo.textContent = ex.no;
  ui.exTitle.textContent = ex.name;
  ui.exEn.textContent = ex.en;
  ui.exTagline.textContent = ex.tagline;
  ui.exDesc.textContent = ex.desc;
  ui.exSpecs.innerHTML = ex.specs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  ui.exChips.innerHTML = ex.chips.map(c => `<span>${c}</span>`).join('');
  ui.creditModel.textContent = `模型 ${ex.file.split('/').pop().replace(/\.[^.]+$/, '')} · ${ex.specs[2][1]}`;
  ui.plaqueInner.classList.remove('is-swapping');
  void ui.plaqueInner.offsetWidth;
  ui.plaqueInner.classList.add('is-swapping');
}

/* ─────────────────────── 切换展品 ─────────────────────── */

let pendingIndex = null;

async function switchTo(i, opts = {}) {
  if (state.busy) { pendingIndex = i; return; }
  if (i === state.exhibit && current) return;
  state.busy = true;
  const ex = EXHIBITS[i];
  state.exhibit = i;

  swItems.forEach((el, k) => el.classList.toggle('is-active', k === i));
  paintPlaque(ex);
  setAccent(ex.accent);
  if (!state.interacted) { state.interacted = true; ui.hint.classList.add('is-hidden'); }

  controls.autoRotate = false;
  const entry = await loadEntry(ex);

  if (current) {
    const out = current;
    await tween({
      dur: 0.5, ease: easeInOutCubic,
      onUpdate: k => {
        out.group.position.y = out.baseY - k * 1.1;
        out.group.scale.setScalar(out.scale * (1 - 0.4 * k));
      }
    });
    stageGroup.remove(out.group);
  }

  const g = entry.group;
  g.scale.setScalar(entry.scale * 0.8);
  g.position.y = entry.baseY - 1.1;
  stageGroup.add(g);
  current = entry;

  await tween({
    dur: 1.25, ease: easeOutBack,
    onUpdate: k => {
      g.position.y = entry.baseY - 1.1 * (1 - k);
      g.scale.setScalar(entry.scale * (0.8 + 0.2 * k));
    }
  });

  await tweenCamera(ex.frame.pos, ex.frame.target, 1.5);
  controls.autoRotate = state.autoRotate;
  state.busy = false;
  if (pendingIndex !== null && pendingIndex !== i) {
    const next = pendingIndex; pendingIndex = null;
    switchTo(next);
  } else {
    pendingIndex = null;
  }
}

function frameVectors(ex) {
  const p = new THREE.Vector3(...ex.frame.pos);
  const t = new THREE.Vector3(...ex.frame.target);
  if (isMobile) {
    const dir = p.clone().sub(t);
    p.copy(t).add(dir.setLength(dir.length() * 1.22));
    t.y -= 0.95; p.y -= 0.2;
  }
  return [p, t];
}

function tweenCamera(pos, target, dur = 1.4) {
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  let p1 = new THREE.Vector3(...pos), t1 = new THREE.Vector3(...target);
  if (isMobile) {
    const dir = p1.clone().sub(t1);
    p1.copy(t1).add(dir.setLength(dir.length() * 1.22));
    t1.y -= 0.95; p1.y -= 0.2;
  }
  return tween({
    dur, ease: easeInOutCubic,
    onUpdate: k => {
      camera.position.lerpVectors(p0, p1, k);
      controls.target.lerpVectors(t0, t1, k);
    }
  });
}

/* ─────────────────────── 交互 ─────────────────────── */

function setMood(name) {
  if (state.mood === name) return;
  state.mood = name;
  setMoodTargets(name);
  applyEnvironment(name);
  ui.moodGroup.querySelectorAll('.ctl-mood').forEach(b =>
    b.classList.toggle('is-active', b.dataset.mood === name));
}

ui.moodGroup.addEventListener('click', e => {
  const b = e.target.closest('.ctl-mood');
  if (b) setMood(b.dataset.mood);
});

ui.btnRotate.addEventListener('click', () => {
  state.autoRotate = !state.autoRotate;
  controls.autoRotate = state.autoRotate;
  ui.btnRotate.classList.toggle('is-active', state.autoRotate);
  ui.btnRotate.setAttribute('aria-pressed', String(state.autoRotate));
});

ui.btnReset.addEventListener('click', () => {
  const ex = EXHIBITS[state.exhibit];
  controls.autoRotate = false;
  tweenCamera(ex.frame.pos, ex.frame.target, 1.2).then(() => {
    controls.autoRotate = state.autoRotate;
  });
});

const toggleAbout = force => {
  const open = force !== undefined ? force : !ui.about.classList.contains('is-open');
  ui.about.classList.toggle('is-open', open);
  ui.about.setAttribute('aria-hidden', String(!open));
};
ui.navAbout.addEventListener('click', () => toggleAbout());
ui.aboutClose.addEventListener('click', () => toggleAbout(false));
ui.navExhibits.addEventListener('click', () => {
  swItems.forEach(el => el.classList.remove('is-pulse'));
  void ui.switcher.offsetWidth;
  swItems.forEach(el => el.classList.add('is-pulse'));
  setTimeout(() => swItems.forEach(el => el.classList.remove('is-pulse')), 1600);
});

addEventListener('keydown', e => {
  if (e.key === '1') switchTo(0);
  else if (e.key === '2') switchTo(1);
  else if (e.key === '3') switchTo(2);
  else if (e.key.toLowerCase() === 'r') ui.btnReset.click();
  else if (e.key.toLowerCase() === 'a') ui.navAbout.click();
  else if (e.code === 'Space') { e.preventDefault(); ui.btnRotate.click(); }
});

/* 指针交互 */
let resumeTimer = 0;
controls.addEventListener('start', () => {
  canvas.classList.add('is-dragging');
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
  if (!state.interacted) { state.interacted = true; ui.hint.classList.add('is-hidden'); }
});
controls.addEventListener('end', () => {
  canvas.classList.remove('is-dragging');
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => { controls.autoRotate = state.autoRotate; }, 2600);
});
canvas.addEventListener('pointermove', e => {
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = (e.clientY / window.innerHeight) * 2 - 1;
  rimLight.position.x = 4.4 + nx * 1.4;
  rimLight.position.y = 2.8 - ny * 1.0;
});

/* ─────────────────────── 尺寸 ─────────────────────── */

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixel, isMobile ? 1.75 : 2));
  renderer.setSize(w, h);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.75 : 2));
  composer.setSize(w, h);
  const pr = renderer.getPixelRatio();
  stars.material.uniforms.uPr.value = pr;
  dust.material.uniforms.uPr.value = pr;
}
addEventListener('resize', onResize);

/* ─────────────────────── 主循环 ─────────────────────── */

let elapsed = 0;
let lastT = performance.now() / 1000;

function dampCur(dt) {
  const k = 1 - Math.pow(0.0016, dt);
  cur.key.lerp(tgt.key, k); cur.rim.lerp(tgt.rim, k);
  cur.fill.lerp(tgt.fill, k); cur.amb.lerp(tgt.amb, k);
  cur.pool.lerp(tgt.pool, k); cur.accent.lerp(tgt.accent, k);
  cur.nebA.lerp(tgt.nebA, k); cur.nebB.lerp(tgt.nebB, k);
  cur.keyI = lerp(cur.keyI, tgt.keyI, k);
  cur.rimI = lerp(cur.rimI, tgt.rimI, k);
  cur.fillI = lerp(cur.fillI, tgt.fillI, k);
  cur.ambI = lerp(cur.ambI, tgt.ambI, k);
  cur.bloom = lerp(cur.bloom, tgt.bloom, k);
  cur.exposure = lerp(cur.exposure, tgt.exposure, k);
  cur.poolI = lerp(cur.poolI, tgt.poolI, k);

  keyLight.color.copy(cur.key); keyLight.intensity = cur.keyI;
  rimLight.color.copy(cur.rim); rimLight.intensity = cur.rimI;
  fillLight.color.copy(cur.fill); fillLight.intensity = cur.fillI;
  ambLight.color.copy(cur.amb); ambLight.intensity = cur.ambI;
  poolLight.color.copy(cur.accent); poolLight.intensity = cur.poolI * 3.0;
  pool.material.color.copy(cur.accent); pool.material.opacity = cur.poolI;
  discEdge.material.color.copy(cur.accent);
  beamMat.uniforms.uColor.value.copy(cur.accent);
  ringA.material.color.copy(cur.accent);
  ringB.material.color.copy(cur.rim);
  dust.material.uniforms.uColor.value.copy(cur.accent);
  backdropMat.uniforms.uNebA.value.copy(cur.nebA);
  backdropMat.uniforms.uNebB.value.copy(cur.nebB);
  bloom.strength = cur.bloom;
  renderer.toneMappingExposure = cur.exposure;
  scene.environmentIntensity = tgt.envI;
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() / 1000;
  const dt = Math.min(now - lastT, 0.1);
  lastT = now;
  elapsed += dt;

  updateTweens(dt);
  dampCur(dt);
  controls.update();

  backdropMat.uniforms.uTime.value = elapsed;
  stars.material.uniforms.uTime.value = elapsed;
  dust.material.uniforms.uTime.value = elapsed;
  stars.rotation.y = elapsed * 0.004;
  dust.rotation.y = -elapsed * 0.01;

  ringA.rotation.z = elapsed * 0.09;
  ringA.rotation.x = -Math.PI / 2 + Math.sin(elapsed * 0.12) * 0.05;
  ringB.rotation.z = -elapsed * 0.14;

  if (current) {
    const g = current.group;
    g.position.y = current.baseY + Math.sin(elapsed * 0.75) * 0.05;
    g.rotation.y = Math.sin(elapsed * 0.22) * 0.055;
    g.rotation.z = Math.sin(elapsed * 0.17 + 1.2) * 0.014;
    current.root.rotation.y = elapsed * 0.05;
  }

  composer.render();
}

/* ─────────────────────── 启动 ─────────────────────── */

async function boot() {
  animate();

  setMoodTargets('stellar');
  applyEnvironment('stellar');
  // 初始即对齐目标，避免开场跳变
  cur.key.copy(tgt.key); cur.rim.copy(tgt.rim); cur.fill.copy(tgt.fill);
  cur.amb.copy(tgt.amb); cur.pool.copy(tgt.pool); cur.accent.copy(tgt.accent);
  cur.nebA.copy(tgt.nebA); cur.nebB.copy(tgt.nebB);
  cur.keyI = tgt.keyI; cur.rimI = tgt.rimI; cur.fillI = tgt.fillI; cur.ambI = tgt.ambI;
  cur.bloom = tgt.bloom; cur.exposure = tgt.exposure; cur.poolI = tgt.poolI;
  dampCur(0.016);

  paintPlaque(EXHIBITS[0]);
  setAccent(EXHIBITS[0].accent);

  const first = await loadEntry(EXHIBITS[0], ev => {
    if (ev && ev.lengthComputable) {
      const p = Math.round((ev.loaded / ev.total) * 100);
      ui.loaderBar.style.width = p + '%';
      ui.loaderStatus.textContent = `正在汇聚星光 … ${p}%`;
    }
  });

  const g = first.group;
  g.scale.setScalar(first.scale * 0.8);
  g.position.y = first.baseY - 1.1;
  stageGroup.add(g);
  current = first;

  ui.loaderBar.style.width = '100%';
  ui.loaderStatus.textContent = '星光就位';
  await tween({ dur: 0.45 });
  ui.loader.classList.add('is-done');

  await tween({
    dur: 1.3, ease: easeOutBack,
    onUpdate: k => {
      g.position.y = first.baseY - 1.1 * (1 - k);
      g.scale.setScalar(first.scale * (0.8 + 0.2 * k));
    }
  });
  await tweenCamera(EXHIBITS[0].frame.pos, EXHIBITS[0].frame.target, 2.4);
  controls.autoRotate = state.autoRotate;

  // 后台预载其余展品
  loadEntry(EXHIBITS[1]).catch(() => {});
  loadEntry(EXHIBITS[2]).catch(() => {});

  setTimeout(() => { if (!state.interacted) ui.hint.classList.remove('is-hidden'); }, 1200);
}

boot();

/* 调试钩子 */
window.__pavilion = {
  THREE, scene, camera, controls, renderer, composer,
  EXHIBITS, MOODS, state,
  get current() { return current; },
  get cache() { return cache; }
};
