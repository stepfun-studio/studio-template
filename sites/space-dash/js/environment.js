import * as THREE from 'three';
import { makeGroundTexture, makeBuildingTexture, makeGlowTexture, makeSkyTexture } from './textures.js';

const TRACK_HALF = 4.3;      // 赛道半宽
const SCROLL_LEN = 400;      // 场景纵深
const SPAWN_Z = -SCROLL_LEN; // 生成位置

/**
 * 构建霓虹城市环境：地面、护栏、灯柱、楼宇、拱门、星空、月亮
 */
export function createEnvironment(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const glowTex = makeGlowTexture();

  /* ---------- 天空 ---------- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 24, 16),
    new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  group.add(sky);

  /* ---------- 星星 ---------- */
  {
    const N = 900;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 420;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(THREE.MathUtils.randFloat(0.02, 0.85));
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) * 0.7 + 20;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const t = Math.random();
      col[i * 3] = 0.6 + t * 0.4;
      col[i * 3 + 1] = 0.75 + t * 0.25;
      col[i * 3 + 2] = 1.0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    group.add(new THREE.Points(g, new THREE.PointsMaterial({
      size: 2.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, fog: false, depthWrite: false
    })));
  }

  /* ---------- 月亮 + 光晕 ---------- */
  {
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(26, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: false })
    );
    moon.position.set(-150, 120, -430);
    group.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffd9a0, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.55, depthWrite: false, fog: false
    }));
    halo.scale.set(230, 230, 1);
    halo.position.copy(moon.position);
    group.add(halo);
  }

  /* ---------- 地面 ---------- */
  const groundTex = makeGroundTexture();
  groundTex.repeat.set(6, SCROLL_LEN / 10);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_HALF * 2, SCROLL_LEN),
    new THREE.MeshStandardMaterial({
      map: groundTex, emissiveMap: groundTex, emissive: 0x2a6cff, emissiveIntensity: 0.55,
      roughness: 0.55, metalness: 0.25
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -SCROLL_LEN / 2 + 20;
  group.add(ground);

  // 赛道外的暗色地面
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(600, SCROLL_LEN),
    new THREE.MeshStandardMaterial({ color: 0x080614, roughness: 1, metalness: 0 })
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.set(0, -0.06, -SCROLL_LEN / 2 + 20);
  group.add(outer);

  /* ---------- 护栏霓虹条 ---------- */
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x0a1230, emissive: 0x35f0ff, emissiveIntensity: 2.4, roughness: 0.3, metalness: 0.6
  });
  const railMat2 = new THREE.MeshStandardMaterial({
    color: 0x0a1230, emissive: 0xff3ea5, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0.6
  });
  [-1, 1].forEach((s, i) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, SCROLL_LEN), i === 0 ? railMat : railMat2);
    rail.position.set(s * (TRACK_HALF + 0.1), 0.55, -SCROLL_LEN / 2 + 20);
    group.add(rail);

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.1, SCROLL_LEN),
      new THREE.MeshStandardMaterial({ color: 0x120b2c, roughness: 0.85, metalness: 0.2, transparent: true, opacity: 0.9 })
    );
    wall.position.set(s * (TRACK_HALF + 0.45), 0.55, -SCROLL_LEN / 2 + 20);
    group.add(wall);
  });

  /* ---------- 灯柱 ---------- */
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x1a1440, emissive: 0xffd447, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0.5 });
  const lampPostMat = new THREE.MeshStandardMaterial({ color: 0x181038, roughness: 0.7, metalness: 0.4 });
  const lamps = [];
  const LAMP_GAP = 24;
  const LAMP_KILL_Z = 6;   // 路灯回收线（摄像机在 z≈11，必须在此之前收起）
  const LAMP_N = Math.ceil(SCROLL_LEN / LAMP_GAP) + 2;
  for (let i = 0; i < LAMP_N; i++) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.4, 0.18), lampPostMat);
    post.position.y = 2.2;
    g.add(post);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.24), lampMat);
    bulb.position.set(0, 4.35, 0);
    g.add(bulb);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffd447, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.55, depthWrite: false
    }));
    halo.scale.set(4, 4, 1);
    halo.position.set(0, 4.3, 0);
    g.add(halo);
    g.userData.halo = halo;
    g.position.set((i % 2 === 0 ? 1 : -1) * (TRACK_HALF + 1.0), 0, 12 - i * LAMP_GAP);
    lamps.push(g);
    group.add(g);
  }

  /* ---------- 楼宇 ---------- */
  const bTex = makeBuildingTexture();
  bTex.repeat.set(2, 6);
  const bMat = new THREE.MeshStandardMaterial({
    map: bTex, emissiveMap: bTex, emissive: 0xffffff, emissiveIntensity: 1.05,
    color: 0x2a2a44, roughness: 0.75, metalness: 0.35
  });
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x35f0ff, emissiveIntensity: 3 });
  const buildings = [];
  const B_N = 26;
  function resetBuilding(b, initial) {
    const side = Math.random() < 0.5 ? -1 : 1;
    b.w = THREE.MathUtils.randFloat(5, 13);
    b.h = THREE.MathUtils.randFloat(8, 46);
    b.d = THREE.MathUtils.randFloat(6, 16);
    b.scale.set(b.w, b.h, b.d);
    b.position.set(side * THREE.MathUtils.randFloat(TRACK_HALF + 7, TRACK_HALF + 34), b.h / 2 - 0.2,
      initial ? THREE.MathUtils.randFloat(-SCROLL_LEN, 12) : -SCROLL_LEN);
  }
  for (let i = 0; i < B_N; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), bMat);
    resetBuilding(b, true);
    buildings.push(b);
    group.add(b);
  }

  /* ---------- 拱门 ---------- */
  const archMat = new THREE.MeshStandardMaterial({ color: 0x140c34, emissive: 0x7c6bff, emissiveIntensity: 2.0, roughness: 0.4, metalness: 0.6 });
  const arches = [];
  const ARCH_GAP = 70;
  const ARCH_N = Math.ceil(SCROLL_LEN / ARCH_GAP) + 1;
  for (let i = 0; i < ARCH_N; i++) {
    const a = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(TRACK_HALF * 2 + 2.4, 0.5, 0.7), archMat);
    beam.position.y = 6.2;
    a.add(beam);
    [-1, 1].forEach(s => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.4, 0.7), archMat);
      leg.position.set(s * (TRACK_HALF + 1.0), 3.2, 0);
      a.add(leg);
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.14, 0.1),
        stripMat
      );
      strip.position.set(s * (TRACK_HALF + 0.7), 6.55, 0);
      a.add(strip);
    });
    a.position.z = 10 - i * ARCH_GAP;
    arches.push(a);
    group.add(a);
  }

  /* ---------- 灯光 ---------- */
  const hemi = new THREE.HemisphereLight(0x9fd8ff, 0x2a1050, 1.1);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffd9c0, 1.6);
  dir.position.set(-8, 18, -6);
  scene.add(dir);
  const front = new THREE.DirectionalLight(0x6fb6ff, 0.7);
  front.position.set(4, 8, 14);
  scene.add(front);

  /* ---------- 滚动更新 ---------- */
  let scroll = 0;
  function update(dt, speed) {
    const dz = speed * dt;

    // 地面贴图滚动
    scroll += dz / 10;
    groundTex.offset.y = scroll % 1;

    for (const l of lamps) {
      l.position.z += dz;
      // 路灯越过玩家就回收：否则会穿过摄像机，光晕被放大成一团过曝糊斑
      if (l.position.z > LAMP_KILL_Z) l.position.z -= SCROLL_LEN;
      const h = l.userData.halo;
      h.material.opacity = 0.55 * THREE.MathUtils.clamp((LAMP_KILL_Z - l.position.z) / 4, 0, 1);
    }
    for (const b of buildings) {
      b.position.z += dz;
      if (b.position.z > 20) resetBuilding(b, false);
    }
    for (const a of arches) {
      a.position.z += dz;
      if (a.position.z > 14) a.position.z -= SCROLL_LEN;
    }
  }

  return { group, update, groundTex, TRACK_HALF };
}
