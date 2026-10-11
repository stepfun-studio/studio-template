import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import { DRACOLoader } from '../vendor/loaders/DRACOLoader.js';
import { RoomEnvironment } from '../vendor/environments/RoomEnvironment.js';
import { createEnvironment } from './environment.js';
import {
  CHARACTERS, Runner, Fox,
  makeDuck, makeBarrier, makeWall, makeBeam, makeParrot, makeCar,
  aabbOverlap, entityBoxSwept
} from './entities.js';
import { makeGlowTexture } from './textures.js';

const HERO_FOV = 58;      // 首屏展示用视场角
const LANES = [-2.5, 0, 2.5];
const SPAWN_Z = -190;
const DESPAWN_Z = 16;

const BASE_SPEED = 15;
const MAX_SPEED = 45;
const ACCEL = 0.42;

const FOX_START = 8.6;
const FOX_KILL = 3.0;
const FOX_HIT = 2.3;

const MODELS = {
  robot: 'models/RobotExpressive.glb.json',
  fox: 'models/Fox.glb.json',
  duck: 'models/duck.glb.json',
  parrot: 'models/Parrot.glb.json',
  soldier: 'models/Soldier.glb.json',
  car: 'models/ferrari.glb.json'
};

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui; // {onHud, onEvent, onGameOver, onPauseChange}

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a0524, 55, 165);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 700);
    this.camera.position.set(0, 4.3, 10.8);
    this.camera.lookAt(0, 1.5, -8);

    // 环境反射
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environment = this.envTex;
      pmrem.dispose();
    } catch (e) { /* 忽略，不影响运行 */ }

    this.glowTex = makeGlowTexture();
    this.env = createEnvironment(this.scene);

    // 首屏角色展示台：脚下光晕 + 旋转光环（只在标题界面可见）
    this.pedestal = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 48),
      new THREE.MeshBasicMaterial({ map: this.glowTex, color: 0x35f0ff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.03;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.52, 1.66, 64),
      new THREE.MeshBasicMaterial({ color: 0x8f7bff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    this.pedestalDisc = disc;
    this.pedestalRing = ring;
    this.pedestal.add(disc, ring);
    this.pedestal.position.set(0, 0, 0);
    this.pedestal.visible = false;
    this.scene.add(this.pedestal);

    this.assets = {};
    this.pools = {};
    this.active = [];
    this.state = 'loading';
    this.clock = new THREE.Clock();
    this._shake = 0;
    this._cheerT = 0;
    this._carLoaded = false;
    this._carLoading = false;
    this._lastHud = {};
    this.heroDist = 5.1;   // 首屏展示时机位与角色的距离（按上下 UI 占位自适应）
    this.heroLookY = 0.9;  // 首屏展示时注视点的高度

    // Draco 解码器（duck / ferrari 使用了网格压缩）
    this.draco = new DRACOLoader();
    this.draco.setDecoderPath(new URL('../vendor/libs/draco/gltf/', import.meta.url).href);
    this.gltfLoader = new GLTFLoader().setDRACOLoader(this.draco);

    this._bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /* ---------- 资源加载 ---------- */
  async load(onProgress) {
    const entries = [
      ['robot', MODELS.robot], ['fox', MODELS.fox],
      ['duck', MODELS.duck], ['parrot', MODELS.parrot]
    ];
    let done = 0;
    await Promise.all(entries.map(async ([key, url]) => {
      const gltf = await this.gltfLoader.loadAsync(url);
      this._tuneMaterials(gltf.scene);
      this.assets[key] = gltf;
      done++;
      onProgress && onProgress(done / entries.length, gltf);
    }));
    this._buildPools();
  }

  async loadExtra(charId) {
    if (this.assets[charId]) return;
    const gltf = await this.gltfLoader.loadAsync(MODELS[charId]);
    this._tuneMaterials(gltf.scene);
    this.assets[charId] = gltf;
  }

  async _loadCar() {
    if (this._carLoaded || this.assets.car) return;
    this._carLoaded = true;
    try {
      const gltf = await this.gltfLoader.loadAsync(MODELS.car);
      this._tuneMaterials(gltf.scene);
      this.assets.car = gltf;
      // 跑车对象池（共享同一个 gltf，需要 clone 才能多辆同时存在）
      this.pools.car = [];
      for (let i = 0; i < 3; i++) {
        const e = makeCar(gltf, this.glowTex);
        e.visible = false;
        this.scene.add(e);
        this.pools.car.push(e);
      }
      this.ui.onEvent && this.ui.onEvent({ type: 'toast', text: '注意！前方出现飞驰跑车' });
    } catch (e) { this._carLoaded = false; }
  }

  _tuneMaterials(root) {
    root.traverse((o) => {
      if (o.isMesh && o.material) {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) {
          if ('envMapIntensity' in m) m.envMapIntensity = 0.32;
          if (m.map) m.map.anisotropy = 4;
        }
      }
    });
  }

  _buildPools() {
    const P = (kind, n, factory) => {
      this.pools[kind] = [];
      for (let i = 0; i < n; i++) {
        const e = factory();
        e.visible = false;
        this.scene.add(e);
        this.pools[kind].push(e);
      }
    };
    P('duck', 34, () => makeDuck(this.assets.duck, this.glowTex));
    P('barrier', 10, () => makeBarrier(this.glowTex));
    P('wall', 12, () => makeWall(this.glowTex));
    P('beam', 4, () => makeBeam(this.glowTex));
    P('parrot', 5, () => makeParrot(this.assets.parrot, this.glowTex));
  }

  _acquire(kind, factory) {
    const pool = this.pools[kind];
    if (!pool || !pool.length) return null;
    const e = pool.pop();
    e.visible = true;
    this.active.push(e);
    return e;
  }

  _release(e) {
    e.visible = false;
    const i = this.active.indexOf(e);
    if (i >= 0) this.active.splice(i, 1);
    e.userData.alive = false;
    (this.pools[e.userData.kind] || (this.pools[e.userData.kind] = [])).push(e);
  }

  /* ---------- 开局 ---------- */
  _ensureActors(charId) {
    charId = CHARACTERS[charId] ? charId : 'robot';
    if (this.player && this.charId === charId) {
      this.player.group.position.set(0, 0, 0);
      this.player.pivot.rotation.set(0, 0, 0);
      this.player.pivot.visible = true;
      return;
    }
    if (this.player) this.scene.remove(this.player.group);
    if (this.fox) this.scene.remove(this.fox.group);

    const cfg = CHARACTERS[charId];
    this.charId = charId;
    this.player = new Runner(this.assets[charId] || this.assets.robot, cfg, this.glowTex);
    this.player.group.position.set(0, 0, 0);
    this.scene.add(this.player.group);

    this.fox = new Fox(this.assets.fox, this.glowTex);
    this.scene.add(this.fox.group);
  }

  /** 标题界面的角色展示 */
  showcase(charId) {
    this._ensureActors(charId);
    for (const e of [...this.active]) this._release(e);
    this.player.setState('idle');
    this.player.setShowcase(true);     // 标题界面：角色正脸看着玩家
    this.pedestal.visible = true;      // 脚下展示台
    this.fox.group.position.set(0, 0, FOX_START + 1.5);
    this.foxDist = FOX_START;
    this.speed = BASE_SPEED;
    this.state = 'title';
    this._emitHud(true);
  }

  start(charId) {
    this._ensureActors(charId);
    for (const e of [...this.active]) this._release(e);

    this.lane = 1;
    this.speed = BASE_SPEED;
    this.distance = 0;
    this.ducks = 0;
    this.score = 0;
    this.foxDist = FOX_START;
    this.invuln = 0;
    this.elapsed = 0;
    this.pedestal.visible = false;
    this.distSinceRow = 6;
    this.nextMilestone = 500;
    this.player.setState('run');
    this.player.setShowcase(false);    // 跑起来之后改回背对摄像机

    this.state = 'playing';
    this.clock.getDelta();
    this._emitHud(true);
  }

  /* ---------- 输入 ---------- */
  _bindInput() {
    const keyMap = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
      ArrowDown: 'slide', KeyS: 'slide'
    };
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const act = keyMap[e.code];
      if (act) { e.preventDefault(); this.act(act); return; }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
    });

    // 触屏手势
    let sx = 0, sy = 0, st = 0, swiping = false;
    const el = this.canvas;
    el.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      sx = t.clientX; sy = t.clientY; st = performance.now(); swiping = true;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (!swiping) return;
      swiping = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      const ad = Math.max(Math.abs(dx), Math.abs(dy));
      if (ad < 26) { this.act('jump'); return; }       // 轻点 = 跳
      if (Math.abs(dx) > Math.abs(dy)) this.act(dx > 0 ? 'right' : 'left');
      else this.act(dy > 0 ? 'slide' : 'jump');
    }, { passive: true });

    // 屏幕按钮
    document.querySelectorAll('#touch-pad .tbtn').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.act(b.dataset.act); });
    });
  }

  act(a) {
    if (this.state !== 'playing') return;
    if (a === 'left') this._shift(-1);
    else if (a === 'right') this._shift(1);
    else if (a === 'jump') {
      const n = this.player.jump();
      if (n) this.ui.onEvent && this.ui.onEvent({ type: 'sfx', name: n === 2 ? 'jump2' : 'jump' });
    }
    else if (a === 'slide') { if (this.player.slide()) this.ui.onEvent && this.ui.onEvent({ type: 'sfx', name: 'slide' }); }
  }

  _shift(d) {
    const n = THREE.MathUtils.clamp(this.lane + d, 0, 2);
    if (n === this.lane) return;
    this.lane = n;
    this.ui.onEvent && this.ui.onEvent({ type: 'sfx', name: 'lane' });
  }

  pause() { if (this.state !== 'playing') return; this.state = 'paused'; this.ui.onPauseChange && this.ui.onPauseChange(true); }
  resume() { if (this.state !== 'paused') return; this.state = 'playing'; this.clock.getDelta(); this.ui.onPauseChange && this.ui.onPauseChange(false); }

  /* ---------- 生成器 ---------- */
  get difficulty() {
    return THREE.MathUtils.clamp((this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 0, 1);
  }

  _spawnRow() {
    const t = this.difficulty;
    const table = [
      ['wall1', 3.0],
      ['wall2', 2.4],
      ['barrier_all', t > 0.1 ? 1.8 : 0],
      ['beam_all', t > 0.2 ? 1.4 : 0],
      ['barrier2', 1.9],
      ['mix', t > 0.06 ? 2.0 : 0],
      ['parrot1', t > 0.3 ? 1.2 : 0],
      ['car1', t > 0.16 && this.assets.car ? 1.3 : 0],
      ['ducks', 2.2],
      ['empty', 1.1]
    ];
    const total = table.reduce((s, x) => s + x[1], 0);
    let r = Math.random() * total;
    let kind = 'empty';
    for (const [k, w] of table) { r -= w; if (r <= 0) { kind = k; break; } }

    const lanes = [0, 1, 2];
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const pick = () => (Math.random() * 3) | 0;

    const add = (k, lane, extraZ = 0) => {
      const e = this._acquire(k);
      if (!e) return null;
      e.position.set(LANES[lane], 0, SPAWN_Z + extraZ);
      e.userData.alive = true;
      return e;
    };

    switch (kind) {
      case 'wall1': add('wall', pick()); break;
      case 'wall2': { const s = shuffle([...lanes]).slice(0, 2); s.forEach((l) => add('wall', l)); break; }
      case 'barrier_all': lanes.forEach((l) => add('barrier', l)); break;
      case 'beam_all': add('beam', 1); break;
      case 'barrier2': {
        const s = shuffle([...lanes]);
        add('barrier', s[0]); add('barrier', s[1]);
        this._duckLine(s[2], 3);
        break;
      }
      case 'mix': {
        const s = shuffle([...lanes]);
        add('wall', s[0]); add('barrier', s[1]);
        this._duckLine(s[2], 3);
        break;
      }
      case 'parrot1': add('parrot', pick()); break;
      case 'car1': add('car', pick()); break;
      case 'ducks': this._duckLine(pick(), 4 + ((Math.random() * 3) | 0)); break;
      default: break;
    }

    // 偶尔在空行放几只鸭子
    if (kind !== 'ducks' && kind !== 'barrier2' && kind !== 'mix' && Math.random() < 0.35) {
      this._duckLine(pick(), 2);
    }
  }

  _duckLine(lane, n) {
    for (let i = 0; i < n; i++) {
      const e = this._acquire('duck');
      if (!e) return;
      const arc = Math.sin((i / Math.max(1, n - 1)) * Math.PI) * 1.3;
      e.position.set(LANES[lane], 0, SPAWN_Z - i * 3.2);
      e.userData.alive = true;
      e.userData.arc = arc;
    }
  }

  /* ---------- 主循环 ---------- */
  update() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;

    if (this.state === 'paused') return dt;

    if (this.state === 'playing') {
      this.elapsed += dt;
      this.speed = Math.min(MAX_SPEED, BASE_SPEED + this.elapsed * ACCEL);
      const dz = this.speed * dt;
      this.distance += dz;

      // 玩家横向移动
      const targetX = LANES[this.lane];
      this.player.group.position.x += (targetX - this.player.group.position.x) * Math.min(1, dt * this.charShift());
      this.player.update(dt, time);

      // 狐狸
      this.foxDist = Math.min(FOX_START, this.foxDist + dt * 0.55);
      const foxX = this.player.group.position.x * 0.82;
      this.fox.group.position.x += (foxX - this.fox.group.position.x) * Math.min(1, dt * 5);
      this.fox.group.position.z = this.foxDist;
      this.fox.update(dt, this.foxDist);

      // 无敌闪烁
      if (this.invuln > 0) {
        this.invuln -= dt;
        this.player.pivot.visible = (Math.floor(time * 18) % 2) === 0;
        if (this.invuln <= 0) this.player.pivot.visible = true;
      }

      // 实体滚动
      const pbox = this.player.box();
      for (let i = this.active.length - 1; i >= 0; i--) {
        const e = this.active[i];
        const extra = e.userData.kind === 'car' ? this.speed * 0.5 : (e.userData.kind === 'parrot' ? this.speed * 0.3 : 0);
        const move = dz + extra * dt;
        e.position.z += move;

        if (e.userData.kind === 'duck') {
          e.rotation.y += dt * 3.4;
          e.position.y = 0.55 + Math.sin(time * 3 + e.position.z * 0.2) * 0.14;
          if (e.userData.arc) e.position.y += e.userData.arc;
        } else if (e.userData.kind === 'parrot') {
          e.rotation.y += dt * e.userData.spin;
          e.position.y = 1.38 + Math.sin(time * 2.4 + e.position.z * 0.1) * 0.06;
        } else if (e.userData.kind === 'car') {
          e.position.y = 0;
          // 跑车掠过摄像机时会把光晕放大成糊斑，按距离衰减
          const h = e.userData.halo;
          if (h) h.material.opacity = 0.5 * THREE.MathUtils.clamp((13 - e.position.z) / 6, 0, 1);
        }

        // 收集
        if (e.userData.kind === 'duck' && e.userData.alive) {
          if (aabbOverlap(pbox, entityBoxSwept(e, move))) {
            e.userData.alive = false;
            this.ducks++;
            this.ui.onEvent && this.ui.onEvent({ type: 'duck' });
            this._release(e);
            continue;
          }
        }

        // 撞击
        if (e.userData.kind !== 'duck' && e.userData.alive && this.invuln <= 0) {
          if (aabbOverlap(pbox, entityBoxSwept(e, move))) {
            this._hit(e);
            continue;
          }
        }

        if (e.position.z > DESPAWN_Z) this._release(e);
      }

      // 生成新行
      this.distSinceRow += dz;
      const gap = THREE.MathUtils.lerp(18, 10.5, this.difficulty);
      if (this.distSinceRow >= gap) { this.distSinceRow -= gap; this._spawnRow(); }

      // 解锁跑车
      if (!this.assets.car && !this._carLoading && this.difficulty > 0.16) {
        this._carLoading = true;
        this._loadCar().finally(() => { this._carLoading = false; });
      }

      // 里程碑
      if (this.distance >= this.nextMilestone) {
        this.nextMilestone += 500;
        this.player.setState('cheer');
        this._cheerT = 1.4;
        this.ui.onEvent && this.ui.onEvent({ type: 'sfx', name: 'milestone' });
        this.ui.onEvent && this.ui.onEvent({ type: 'toast', text: `${Math.floor(this.distance)} m 达成！` });
      }
      if (this._cheerT > 0) {
        this._cheerT -= dt;
        if (this._cheerT <= 0 && this.player.state === 'cheer') this.player.setState('run');
      }

      this.score = Math.floor(this.distance) + this.ducks * 10;
      this._emitHud();
      this._updateCamera(dt, true);
    } else {
      // 标题 / 结束画面：缓慢环绕展示
      this._updateCamera(dt, false);
      if (this.player) this.player.mixer.update(dt * 0.9);
      if (this.fox) this.fox.mixer.update(dt * 0.9);
    }

    this.env.update(dt, this.state === 'playing' ? this.speed : 7);
    return dt;
  }

  charShift() { return CHARACTERS[this.charId] ? CHARACTERS[this.charId].laneShift : 11; }

  _hit(e) {
    this.invuln = 1.15;
    this._shake = 0.45;
    this.speed = Math.max(BASE_SPEED, this.speed * 0.62);
    this.foxDist -= FOX_HIT;
    this.ui.onEvent && this.ui.onEvent({ type: 'sfx', name: 'hit' });
    this.ui.onEvent && this.ui.onEvent({ type: 'shake' });

    if (this.foxDist <= FOX_KILL) {
      this.foxDist = FOX_KILL;
      this._gameOver('caught');
      return;
    }
    this.ui.onEvent && this.ui.onEvent({ type: 'toast', text: '撞到了！狐狸逼近了…' });
    // 障碍物被撞飞
    e.userData.alive = false;
    e.position.y += 0.4;
    this._release(e);
  }

  _gameOver(reason) {
    this.state = 'over';
    this.pedestal.visible = false;
    this.player.setState('dead');
    this.ui.onEvent && this.ui.onEvent({ type: 'sfx', name: 'over' });
    this.ui.onGameOver && this.ui.onGameOver({
      reason: reason === 'caught' ? '被狐狸追上了！' : '撞毁了…',
      score: this.score, distance: Math.floor(this.distance), ducks: this.ducks
    });
  }

  _emitHud(force) {
    const h = {
      score: this.score || 0,
      dist: Math.floor(this.distance),
      ducks: this.ducks || 0,
      danger: THREE.MathUtils.clamp(1 - (this.foxDist - FOX_KILL) / (FOX_START - FOX_KILL), 0, 1)
    };
    if (!force && this._lastHud.score === h.score && this._lastHud.dist === h.dist &&
        this._lastHud.ducks === h.ducks && Math.abs(this._lastHud.danger - h.danger) < 0.01) return;
    this._lastHud = h;
    this.ui.onHud && this.ui.onHud(h);
  }

  /** 首屏角色居中：量一下上下 UI 占多高，把角色正好摆在中间空档里 */
  _fitHeroDistance() {
    const top = document.querySelector('.title-top');
    const bottom = document.querySelector('.title-bottom');
    if (!top || !bottom) return;
    const H = this.canvas.clientHeight || window.innerHeight;
    // 用 offset* 量：入场动画的 transform 不会污染结果
    const bandTop = top.offsetTop + top.offsetHeight;
    const bandBot = bottom.offsetTop;
    const band = bandBot - bandTop - 48;          // 上下各留 24px 呼吸
    if (band < 80) return;
    const tan = Math.tan(HERO_FOV * Math.PI / 360);
    // 角色高约 1.72m，令其在画面中约占中间空档的 82%
    // 环绕时最近会再靠近 0.55m，先把这段余量算进去，保证最近时不撞 UI
    this.heroDist = THREE.MathUtils.clamp(1.72 * H / (2 * tan * 0.82 * band) + 0.55, 3.6, 12);
    // 空档中心往往低于画面中心，注视点跟着上移，角色才落在空档正中
    const off = ((bandTop + bandBot) / 2 - H / 2) * (2 * this.heroDist * tan) / H;
    this.heroLookY = THREE.MathUtils.clamp(0.86 + off, 0.3, 1.8);
  }

  _updateCamera(dt, playing) {
    let cx = 0, cy = 4.3, cz = 10.8;
    if (playing) {
      cx = this.player.group.position.x * 0.45;
      cz = 10.8 + (this.speed - BASE_SPEED) * 0.055;
    } else {
      // 首屏展示：角色居中，低机位缓慢环绕
      const t = this.clock.elapsedTime * 0.22;
      cx = Math.sin(t) * 2.6;
      cz = this.heroDist + Math.cos(t) * 0.55;
      cy = 2.0 + Math.sin(t * 1.6) * 0.1;
      // 展示台呼吸 + 光环旋转
      if (this.pedestal.visible) {
        this.pedestalRing.rotation.z += dt * 0.5;
        const pulse = 0.5 + Math.sin(t * 2.2) * 0.16;
        this.pedestalDisc.material.opacity = 0.34 + pulse * 0.22;
        this.pedestalDisc.scale.setScalar(1 + Math.sin(t * 2.2) * 0.05);
      }
    }
    if (this._shake > 0) {
      this._shake = Math.max(0, this._shake - dt * 1.6);
      cx += (Math.random() - 0.5) * this._shake * 1.4;
      cy += (Math.random() - 0.5) * this._shake * 1.0;
    }
    this.camera.position.x += (cx - this.camera.position.x) * Math.min(1, dt * 6);
    this.camera.position.y += (cy - this.camera.position.y) * Math.min(1, dt * 4);
    this.camera.position.z += (cz - this.camera.position.z) * Math.min(1, dt * 3);
    if (playing) {
      this.camera.lookAt(this.player ? this.player.group.position.x * 0.55 : 0, 1.5, -8);
    } else {
      // 标题界面盯住角色胸口，把角色摆在画面正中
      this.camera.lookAt(this.player ? this.player.group.position.x * 0.5 : 0, this.heroLookY, 0);
    }

    const fov = playing ? 60 + (this.speed - BASE_SPEED) * 0.22 : HERO_FOV;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 2);
      this.camera.updateProjectionMatrix();
    }
  }

  render() { this.renderer.render(this.scene, this.camera); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._fitHeroDistance();
  }
}
