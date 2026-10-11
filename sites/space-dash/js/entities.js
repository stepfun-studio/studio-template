import * as THREE from 'three';
import { fitToHeight, fitToSize, makeGlowTexture, refreshSkin } from './textures.js';

/* ============================================================
   通用工具
   ============================================================ */

/** 二段跳：空翻时长 / 喷气光时长 */
const FLIP_T = 0.42;
const BOOST_T = 0.34;

/**
 * 运行时检测模型“脸”朝向：找名字含 visor/face/head 的网格，
 * 用它相对整体包围盒中心的方向作为正面。找不到就默认 +Z。
 */
export function detectForward(model, defaultDir = new THREE.Vector3(0, 0, 1)) {
  refreshSkin(model);
  const box = new THREE.Box3().setFromObject(model, true);
  const center = box.getCenter(new THREE.Vector3());
  let best = null;
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (!/visor|face|head|eye|goggle|beak/i.test(o.name || '')) return;
    const b = new THREE.Box3().setFromObject(o, true);
    const c = b.getCenter(new THREE.Vector3());
    const d = c.sub(center);
    d.y = 0;
    if (d.lengthSq() < 1e-6) return;
    if (!best || d.length() > best.length()) best = d.normalize();
  });
  return best ? best : defaultDir.clone().normalize();
}

/** 让模型的 forward 方向指向 target 方向所需的 Y 轴旋转 */
export function yawToFace(model, forward, target) {
  return Math.atan2(forward.x, forward.z) - Math.atan2(target.x, target.z);
}

function glowSprite(tex, color, size, opacity = 0.85) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  s.scale.set(size, size, 1);
  return s;
}

/* ============================================================
   可操控角色（机器人 / 士兵）
   ============================================================ */
export const CHARACTERS = {
  robot: {
    id: 'robot', name: '机器人', file: 'models/RobotExpressive.glb.json',
    height: 1.72, laneShift: 11, jumpV: 9.9, gravity: -26,
    anims: { idle: 'Idle', run: 'Running', jump: 'Jump', slide: 'Walking', dead: 'Death', cheer: 'ThumbsUp' },
    once: ['jump', 'dead', 'cheer'],
    // 模型自身坐标里面朝 +Z（黑色眼片在 +Z 一侧）。朝向必须写死：按网格名/位置自动判断
    // 会随奔跑姿态抖动，机器人曾被判成 -Z，于是正脸对着摄像机、像在倒着跑。
    forward: [0, 0, 1]
  },
  soldier: {
    id: 'soldier', name: '星际士兵', file: 'models/Soldier.glb.json',
    height: 1.8, laneShift: 11, jumpV: 9.9, gravity: -26,
    anims: { idle: 'Idle', run: 'Run', jump: 'Run', slide: 'Walk', dead: 'Idle', cheer: 'Idle' },
    once: ['cheer'],
    forward: [0, 0, -1]   // 面罩在 -Z 一侧
  }
};

export class Runner {
  constructor(gltf, cfg, glowTex) {
    this.cfg = cfg;
    this.group = new THREE.Group();     // 世界位置
    this.pivot = new THREE.Group();     // 用于滑铲倾斜
    this.group.add(this.pivot);
    this.spin = new THREE.Group();      // 二段跳空翻层（原点在腰高）
    this.spin.position.y = cfg.height * 0.5;
    this.pivot.add(this.spin);

    const model = gltf.scene;
    fitToHeight(model, cfg.height);
    model.position.y -= cfg.height * 0.5;   // 让 spin 原点落在角色腰高，空翻绕中心转
    // 朝向：优先用角色配置里写死的模型自身朝向，自动检测只作兜底
    this.forward = cfg.forward ? new THREE.Vector3().fromArray(cfg.forward) : detectForward(model);
    model.rotation.y = yawToFace(model, this.forward, new THREE.Vector3(0, 0, -1));
    this.spin.add(model);

    // 接触阴影（假阴影）
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({
        map: glowTex, color: 0x000000, transparent: true, opacity: 0.5,
        blending: THREE.NormalBlending, depthWrite: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.group.add(shadow);
    this.shadow = shadow;

    // 脚下喷气光
    this.thrust = glowSprite(glowTex, 0x35f0ff, 1.6, 0.0);
    this.thrust.position.y = 0.25;
    this.group.add(this.thrust);

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
    this.state = '';
    this.velocityY = 0;
    this.jumping = false;
    this.jumps = 0;        // 本次滞空已用掉的跳跃次数（1 = 起跳，2 = 二段跳）
    this.sliding = false;
    this.slideT = 0;
    this.bob = Math.random() * 10;
    this.flipT = 0;        // 二段跳空翻剩余时间
    this.boostT = 0;       // 二段跳喷气光剩余时间

    this.setState('idle');
  }

  /** 首屏展示：把模型转 180° 正对摄像机。
   *  游戏里角色要"朝屏幕深处跑"，所以是背对摄像机；标题界面则要求看着玩家。 */
  setShowcase(on) {
    this.spin.rotation.y = on ? Math.PI : 0;
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    const name = this.cfg.anims[s] || this.cfg.anims.run;
    const act = this.actions[name];
    if (!act) return;
    const once = this.cfg.once.includes(s);
    const prev = this.current;
    act.reset();
    act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    act.clampWhenFinished = once;
    act.enabled = true;
    act.setEffectiveWeight(1);
    if (prev && prev !== act) { act.play(); act.crossFadeFrom(prev, 0.16, true); }
    else act.play();
    this.current = act;
  }

  /** 重放一次性动画（二段跳时 Jump 已经在放，需要从头再来） */
  _replay(s) {
    const name = this.cfg.anims[s] || this.cfg.anims.run;
    const act = this.actions[name];
    if (!act) return;
    act.reset();
    act.setLoop(THREE.LoopOnce, Infinity);
    act.clampWhenFinished = true;
    act.enabled = true;
    act.setEffectiveWeight(1);
    act.play();
    this.current = act;
    this.state = s;
  }

  /** 返回 1 = 起跳，2 = 二段跳，0 = 没跳成 */
  jump() {
    if (this.sliding) return 0;
    if (!this.jumping) {
      this.jumping = true;
      this.jumps = 1;
      this.velocityY = this.cfg.jumpV;
      this.sliding = false;
      this.pivot.rotation.x = 0;
      this.setState('jump');
      return 1;
    }
    if (this.jumps < 2) {
      // 二段跳：空中再蹬一次，速度比地面起跳低一点，总高度约 2.8
      this.jumps = 2;
      this.velocityY = this.cfg.jumpV * 0.72;
      this.sliding = false;
      this.pivot.rotation.x = 0;
      this.flipT = FLIP_T;
      this.boostT = BOOST_T;
      this._replay('jump');
      return 2;
    }
    return 0;
  }

  slide() {
    if (this.sliding) return false;
    if (this.jumping) { this.velocityY = Math.min(this.velocityY, -6); } // 空中下压
    this.sliding = true;
    this.slideT = 0.62;
    this.setState('slide');
    return true;
  }

  /** 返回角色碰撞盒（世界 AABB） */
  box() {
    const h = this.sliding ? 0.42 : 0.86;
    const y = this.group.position.y + h;
    return {
      minX: this.group.position.x - 0.4, maxX: this.group.position.x + 0.4,
      minY: y - h, maxY: y + h,
      minZ: this.group.position.z - 0.36, maxZ: this.group.position.z + 0.36
    };
  }

  update(dt, time) {
    this.mixer.update(dt);
    this.bob += dt;

    // 跳跃物理
    if (this.jumping) {
      this.velocityY += this.cfg.gravity * dt;
      this.group.position.y += this.velocityY * dt;
      if (this.group.position.y <= 0) {
        this.group.position.y = 0;
        this.velocityY = 0;
        this.jumping = false;
        this.jumps = 0;
        if (!this.sliding) this.setState('run');
      }
    }

    // 滑铲计时
    if (this.sliding) {
      this.slideT -= dt;
      this.pivot.rotation.x = -1.15;
      this.group.position.y = 0.06;
      if (this.slideT <= 0) {
        this.sliding = false;
        this.pivot.rotation.x = 0;
        this.group.position.y = 0;
        if (!this.jumping) this.setState('run');
      }
    } else if (!this.jumping) {
      // 奔跑时的轻微上下起伏
      this.pivot.position.y = Math.abs(Math.sin(this.bob * 11)) * 0.055;
      this.pivot.rotation.x = 0.06;
    } else if (this.flipT > 0) {
      // 二段跳前空翻
      this.flipT = Math.max(0, this.flipT - dt);
      this.spin.rotation.x = -Math.PI * 2 * (1 - this.flipT / FLIP_T);
      this.pivot.rotation.x = -0.12;
    } else {
      this.spin.rotation.x = 0;
      this.pivot.rotation.x = -0.12;
    }

    // 二段跳喷气光衰减
    if (this.boostT > 0) this.boostT = Math.max(0, this.boostT - dt);
    const boost = this.boostT / BOOST_T;
    if (this.jumping || boost > 0) {
      this.thrust.material.opacity = 0.55 + boost * 0.45;
      this.thrust.scale.setScalar(1.6 * (1 + boost * 1.5));
    } else {
      this.thrust.material.opacity = 0;
    }

    // 阴影贴地
    this.shadow.position.y = 0.02 - this.group.position.y;
    const sh = THREE.MathUtils.clamp(1 - this.group.position.y * 0.45, 0.35, 1);
    this.shadow.scale.set(1.4 * sh, 1.4 * sh, 1);
    this.shadow.material.opacity = 0.5 * sh;
  }
}

/* ============================================================
   狐狸（追击者）
   ============================================================ */
export class Fox {
  constructor(gltf, glowTex) {
    this.group = new THREE.Group();
    const model = gltf.scene;
    fitToHeight(model, 1.0);
    this.forward = detectForward(model);
    model.rotation.y = yawToFace(model, this.forward, new THREE.Vector3(0, 0, -1));
    this.group.add(model);

    this.aura = glowSprite(glowTex, 0xff4d3d, 3.4, 0.0);
    this.aura.position.y = 0.9;
    this.group.add(this.aura);

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
    this._play('Run');
    this.bob = 0;
  }

  _play(name) {
    const act = this.actions[name];
    if (!act || this.current === act) return;
    const prev = this.current;
    act.reset().setEffectiveWeight(1).play();
    if (prev) act.crossFadeFrom(prev, 0.25, true);
    this.current = act;
  }

  update(dt, dist) {
    this.mixer.update(dist > 5.6 ? dt * 1.05 : dt * 0.85);
    this._play(dist > 5.6 ? 'Run' : 'Walk');
    this.bob += dt;
    this.group.position.y = Math.abs(Math.sin(this.bob * 13)) * 0.09;
    this.group.rotation.z = Math.sin(this.bob * 13) * 0.03;
    // 越近越红
    const danger = THREE.MathUtils.clamp(1 - (dist - 3) / 5.5, 0, 1);
    this.aura.material.opacity = 0.15 + danger * 0.85;
    this.aura.scale.setScalar(3.0 + danger * 1.6);
  }
}

/* ============================================================
   小黄鸭（收集物）
   ============================================================ */
const duckMat = new THREE.MeshStandardMaterial({
  color: 0xffd447, emissive: 0xff9d00, emissiveIntensity: 0.85, roughness: 0.3, metalness: 0.45
});

export function makeDuck(gltf, glowTex) {
  const g = new THREE.Group();
  const m = gltf.scene.clone(true);
  fitToHeight(m, 0.52);
  m.traverse((o) => { if (o.isMesh) o.material = duckMat; });
  g.add(m);
  const halo = glowSprite(glowTex, 0xffd447, 1.5, 0.75);
  g.add(halo);
  g.userData.halo = halo;
  g.userData.kind = 'duck';
  g.userData.half = new THREE.Vector3(0.4, 0.34, 0.4);
  g.userData.centerY = 0.3;
  return g;
}

/* ============================================================
   障碍物工厂
   ============================================================ */
const MAT = {
  dark: new THREE.MeshStandardMaterial({ color: 0x191233, roughness: 0.6, metalness: 0.45 }),
  cyan: new THREE.MeshStandardMaterial({ color: 0x061428, emissive: 0x35f0ff, emissiveIntensity: 2.6, roughness: 0.35, metalness: 0.5 }),
  pink: new THREE.MeshStandardMaterial({ color: 0x220a1a, emissive: 0xff3ea5, emissiveIntensity: 2.4, roughness: 0.35, metalness: 0.5 }),
  gold: new THREE.MeshStandardMaterial({ color: 0x2a1c00, emissive: 0xffd447, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0.5 }),
  violet: new THREE.MeshStandardMaterial({ color: 0x1a0a2e, emissive: 0x9d6bff, emissiveIntensity: 2.4, roughness: 0.35, metalness: 0.5 })
};

/** 需要跳跃的矮路障 */
export function makeBarrier(glowTex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.78, 0.55), MAT.dark);
  body.position.y = 0.39;
  g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.14, 0.62), MAT.gold);
  top.position.y = 0.82;
  g.add(top);
  for (let i = -1; i <= 1; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.06), MAT.cyan);
    s.position.set(i * 0.62, 0.4, 0.3);
    g.add(s);
  }
  const halo = glowSprite(glowTex, 0xffd447, 2.4, 0.5);
  halo.position.y = 0.5;
  g.add(halo);
  g.userData = { kind: 'barrier', half: new THREE.Vector3(1.03, 0.42, 0.3), centerY: 0.4, halo };
  return g;
}

/** 必须变道绕开的高墙 */
export function makeWall(glowTex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.25, 0.55), MAT.dark);
  body.position.y = 1.12;
  g.add(body);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.0, 0.08), i % 2 ? MAT.pink : MAT.cyan);
    s.position.set(-0.6 + i * 0.6, 1.1, 0.3);
    g.add(s);
  }
  const cap = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 0.62), MAT.pink);
  cap.position.y = 2.28;
  g.add(cap);
  const halo = glowSprite(glowTex, 0xff3ea5, 2.8, 0.5);
  halo.position.y = 1.1;
  g.add(halo);
  // 墙是“必须变道”的障碍：碰撞盒向上延伸到二段跳最高点(≈2.45)，防止从顶上翻过去
  g.userData = { kind: 'wall', half: new THREE.Vector3(0.96, 1.6, 0.3), centerY: 1.6, halo };
  return g;
}

/** 必须滑铲通过的横梁（横跨整条赛道） */
export function makeBeam(glowTex) {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.42, 0.5), MAT.dark);
  bar.position.y = 1.5;
  g.add(bar);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(9.7, 0.14, 0.58), MAT.violet);
  strip.position.y = 1.42;
  g.add(strip);
  for (let i = -4; i <= 4; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.12), MAT.cyan);
    t.position.set(i * 1.0, 1.78, 0.28);
    g.add(t);
  }
  [-1, 1].forEach((s) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.6, 0.5), MAT.dark);
    post.position.set(s * 4.75, 1.8, 0);
    g.add(post);
  });
  const halo = glowSprite(glowTex, 0x9d6bff, 9, 0.4);
  halo.position.y = 1.7;
  g.add(halo);
  g.userData = { kind: 'beam', half: new THREE.Vector3(4.6, 1.15, 0.28), centerY: 2.3, halo };
  return g;
}

/** 鹦鹉：空中威胁，会朝玩家飞来 */
export function makeParrot(gltf, glowTex) {
  const g = new THREE.Group();
  const m = gltf.scene.clone(true);
  fitToSize(m, 1.85, 'x');
  m.traverse((o) => {
    if (o.isMesh) o.material = new THREE.MeshStandardMaterial({
      color: 0x6dff8c, emissive: 0x2fe35a, emissiveIntensity: 2.3, roughness: 0.36, metalness: 0.2
    });
  });
  const fwd = detectForward(m);
  m.rotation.y = yawToFace(m, fwd, new THREE.Vector3(0, 0, 1));
  g.add(m);
  const halo = glowSprite(glowTex, 0x62ff8a, 3.6, 0.9);
  halo.position.y = 0.1;
  g.add(halo);
  // 模型本地 y∈[0,0.78]，碰撞盒与视觉一致；飞行底边 > 滑铲盒顶(0.90)，站立盒顶(1.72) 必撞
  g.userData = { kind: 'parrot', half: new THREE.Vector3(0.82, 0.35, 1.05), centerY: 0.35, halo, spin: 0.55 };
  return g;
}

/** 飞驰的跑车（迎面而来） */
export function makeCar(gltf, glowTex) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  const m = gltf.scene.clone(true);
  // 车内外观细节在 1.8 米宽的车身上完全是亚像素，直接隐藏可省下 1/3 三角形与draw call
  const SKIP = /interior|steering|leather|carpet/i;
  m.traverse((o) => { if (o.isMesh && SKIP.test(o.name || '')) o.visible = false; });
  fitToSize(m, 1.8, 'x');
  // 用车轮节点判断车头方向，再把车头对准 +Z（朝玩家冲来）
  let fr = null, rr = null;
  m.traverse((o) => {
    const n = (o.name || '').toLowerCase();
    if (n.includes('wheel_fr')) fr = o;
    if (n.includes('wheel_rr')) rr = o;
  });
  m.updateWorldMatrix(true, true);
  let fwd = new THREE.Vector3(0, 0, -1);
  if (fr && rr) {
    const a = fr.getWorldPosition(new THREE.Vector3());
    const b = rr.getWorldPosition(new THREE.Vector3());
    const d = a.sub(b); d.y = 0;
    if (d.lengthSq() > 1e-6) fwd = d.normalize();
  }
  inner.rotation.y = yawToFace(inner, fwd, new THREE.Vector3(0, 0, 1));
  inner.add(m);
  g.add(inner);

  // 车灯光柱
  [-0.62, 0.62].forEach((x) => {
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 5.5, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff0c0, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      })
    );
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(x, 0.55, 3.2);
    g.add(beam);
  });
  const halo = glowSprite(glowTex, 0xffb347, 4.5, 0.5);
  halo.position.set(0, 0.8, 0);
  g.add(halo);
  g.userData = { kind: 'car', half: new THREE.Vector3(0.92, 0.5, 2.1), centerY: 0.5, halo };
  return g;
}

/* ============================================================
   碰撞
   ============================================================ */
export function aabbOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX &&
         a.minY < b.maxY && a.maxY > b.minY &&
         a.minZ < b.maxZ && a.maxZ > b.minZ;
}

export function entityBox(e) {
  const u = e.userData;
  const x = e.position.x, y = e.position.y + u.centerY, z = e.position.z;
  return {
    minX: x - u.half.x, maxX: x + u.half.x,
    minY: y - u.half.y, maxY: y + u.half.y,
    minZ: z - u.half.z, maxZ: z + u.half.z
  };
}

/** 扫掠碰撞盒：把 z 区间向前一帧的位置扩展，避免高速/低帧率下穿透 */
export function entityBoxSwept(e, move) {
  const b = entityBox(e);
  if (move > 0) b.minZ -= move;
  return b;
}
