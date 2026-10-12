import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { F16_GLB } from './data-f16.js';
import { L159_GLB } from './data-l159.js';

const loader = new GLTFLoader();

/* 模型二进制（GLB）以 base64 内嵌在 js/data-*.js 中 */
const MODEL_B64 = { f16: F16_GLB, l159: L159_GLB };
const MODEL_CACHE = {};

function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** 载入开源战机模型（GLB 二进制内嵌于 js/data-*.js） */
export function loadModel(name) {
  if (MODEL_CACHE[name]) return Promise.resolve(MODEL_CACHE[name]);
  return new Promise((resolve, reject) => {
    try {
      const buf = b64ToArrayBuffer(MODEL_B64[name]);
      loader.parse(buf, '', (gltf) => { MODEL_CACHE[name] = gltf; resolve(gltf); }, reject);
    } catch (e) { reject(e); }
  });
}

/* ---------------- 网格合并：按「材质签名 + 属性签名」分桶 ---------------- */
function attrSig(g) {
  const ks = Object.keys(g.attributes).sort();
  return ks.map((k) => `${k}:${g.attributes[k].itemSize}:${g.attributes[k].normalized ? 1 : 0}`).join('|')
    + '|idx:' + (g.index ? 1 : 0)
    + '|morph:' + Object.keys(g.morphAttributes || {}).sort().join(',');
}

function matSig(m) {
  if (!m) return 'null';
  const hex = (c) => (c && c.getHexString ? '#' + c.getHexString() : '');
  const parts = [
    m.type, m.name || '', hex(m.color), hex(m.emissive), m.emissiveIntensity,
    m.metalness, m.roughness, m.opacity, m.transparent ? 1 : 0, m.side, m.blending,
    m.flatShading ? 1 : 0, m.vertexColors ? 1 : 0, m.alphaTest,
    m.map ? m.map.uuid : '', m.normalMap ? m.normalMap.uuid : '', m.emissiveMap ? m.emissiveMap.uuid : '',
    m.roughnessMap ? m.roughnessMap.uuid : '', m.metalnessMap ? m.metalnessMap.uuid : '',
    m.aoMap ? m.aoMap.uuid : '', m.alphaMap ? m.alphaMap.uuid : '', m.depthWrite ? 1 : 0,
  ];
  return parts.join('~');
}

const NORM_DIV = { Int8Array: 127, Uint8Array: 255, Int16Array: 32767, Uint16Array: 65535 };

/**
 * 把顶点属性「去交错 + 去量化」成紧凑的 Float32 BufferAttribute。
 *
 * 这些开源模型（Sketchfab 导出）的 position/normal/uv 是共享同一 buffer 的
 * InterleavedBufferAttribute 且带 normalized 整型存储。直接对它们做
 * BufferGeometry.applyMatrix4() 会把浮点变换结果写回整型共享数组而全部截断成
 * 0/±1，同时污染同一 buffer 里的其它属性——模型会被摧毁成看不出形状的碎块。
 * 因此烘焙世界矩阵前必须先转成独立的 Float32 属性。
 */
function compactAttrs(g) {
  for (const key of Object.keys(g.attributes)) {
    const a = g.attributes[key];
    if (!a || !a.array) continue;
    const interleaved = a.isInterleavedBufferAttribute === true;
    if (!interleaved && !a.normalized) continue; // 普通 Float32 属性无需处理
    const div = a.normalized ? (NORM_DIV[a.array.constructor.name] || 1) : 1;
    const count = a.count;
    const itemSize = a.itemSize;
    const out = new Float32Array(count * itemSize);
    const src = a.array;
    if (interleaved) {
      const stride = a.data.stride;
      const offset = a.offset;
      for (let i = 0; i < count; i++) {
        const base = i * stride + offset;
        for (let c = 0; c < itemSize; c++) out[i * itemSize + c] = src[base + c] / div;
      }
    } else {
      const n = Math.min(count * itemSize, src.length);
      for (let i = 0; i < n; i++) out[i] = src[i] / div;
    }
    const na = new THREE.BufferAttribute(out, itemSize, false);
    na.name = a.name;
    g.setAttribute(key, na);
  }
}

/**
 * 把 gltf 场景里同一材质、同一套顶点属性的网格合并，
 * 大幅降低 draw call（L-159 由 56 个网格降到 3 个）。
 */
function optimize(root) {
  const buckets = new Map();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
    const g = o.geometry.clone();
    compactAttrs(g); // 先去交错/去量化，否则 applyMatrix4 会截断并污染共享数组
    const el = o.matrixWorld.elements;
    const identity = el[0] === 1 && el[1] === 0 && el[2] === 0 && el[3] === 0
      && el[4] === 0 && el[5] === 1 && el[6] === 0 && el[7] === 0
      && el[8] === 0 && el[9] === 0 && el[10] === 1 && el[11] === 0
      && el[12] === 0 && el[13] === 0 && el[14] === 0 && el[15] === 1;
    if (!identity) g.applyMatrix4(o.matrixWorld);
    g.computeBoundingBox(); // clone() 继承的是局部旧值，烘焙后必须重算
    g.computeBoundingSphere();
    if (!g.attributes.normal) g.computeVertexNormals();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.length !== 1) { // 多材质网格不参与合并，保持原样
      const key = 'raw:' + o.uuid;
      if (!buckets.has(key)) buckets.set(key, { meshes: [], mat: mats });
      buckets.get(key).meshes.push({ mesh: o });
      return;
    }
    const key = matSig(mats[0]) + '||' + attrSig(g);
    if (!buckets.has(key)) buckets.set(key, { geos: [], mat: mats[0] });
    buckets.get(key).geos.push(g);
  });

  const group = new THREE.Group();
  group.name = 'optimized';
  for (const b of buckets.values()) {
    if (b.meshes) { // 原样保留的多材质网格
      for (const it of b.meshes) group.add(it.mesh);
      continue;
    }
    let merged = b.geos[0];
    if (b.geos.length > 1) {
      merged = mergeGeometries(b.geos, false);
      for (const g of b.geos) if (g !== merged) g.dispose();
    }
    if (!merged) continue;
    if (!merged.attributes.normal) merged.computeVertexNormals();
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.name = 'jetpart';
    group.add(mesh);
  }
  return group;
}

/** 提升自发光（尾焰/喷口）强度，让引擎在暗背景下发亮 */
function boostEmissive(root, amount) {
  if (!amount) return;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || !m.emissive || m.emissiveIntensity <= 0) continue;
      const n = `${m.name || ''} ${(m.userData && m.userData.name) || ''}`;
      const named = /burner|nozzle|exhaust|flame|engine|after|glow|hot/i.test(n);
      if (named || m.emissive.getHex() !== 0) {
        m.emissiveIntensity = Math.min(6, m.emissiveIntensity * (1 + amount));
      }
    }
  });
}

export function makeJet(gltfScene, opt = {}) {
  const { length = 6, yawFix = 0, tint = null, emissive = 0 } = opt;

  const inner = optimize(gltfScene);
  if (emissive) boostEmissive(inner, emissive);

  if (tint) {
    inner.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || !m.color) continue;
        m.color = m.color.clone().lerp(new THREE.Color(tint), 0.55);
        if (m.emissive && m.emissiveIntensity > 0) m.emissive = new THREE.Color(tint);
      }
    });
  }

  // 居中 + 归一化尺寸
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  const scale = length / (span || 1);
  inner.position.copy(center).multiplyScalar(-1);
  inner.scale.setScalar(scale);

  const pivot = new THREE.Group(); // 机头朝向 -Z
  pivot.name = 'jetPivot';
  pivot.add(inner);
  pivot.rotation.y = yawFix;

  const bank = new THREE.Group(); // 侧倾（滚转视觉）
  bank.name = 'jetBank';
  bank.add(pivot);

  const root = new THREE.Group();
  root.name = 'jetRoot';
  root.add(bank);

  // 归一化后的尺寸（局部坐标）
  const s = size.clone().multiplyScalar(scale);
  root.userData.size = s;
  root.userData.inner = inner;
  root.userData.bank = bank;
  return root;
}

/** 克隆所有材质：让每个敌机独立，避免受击闪白互相影响 */
export function cloneMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) o.material = o.material.map((m) => (m ? m.clone() : m));
    else if (o.material) o.material = o.material.clone();
  });
}

const _WHITE = new THREE.Color(0xffffff);

/** 整体染色（敌机阵营色）；userData._base 记录原色，可重复调用不叠加 */
export function tintObject(root, color, amount = 0.6) {
  const c = new THREE.Color(color);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || !m.color) continue;
      if (!m.userData._base) m.userData._base = m.color.clone();
      m.color.set(m.userData._base.r, m.userData._base.g, m.userData._base.b).lerp(c, amount);
      if (m.emissive && m.emissiveIntensity > 0) m.emissive.copy(c);
    }
  });
}

/** 受击闪白 / 还原 */
export function flashObject(root, on) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || !m.color) continue;
      const base = m.userData._base;
      if (on) {
        if (base) m.color.set(base.r, base.g, base.b).lerp(_WHITE, 0.82);
        else m.color.lerp(_WHITE, 0.82);
      } else if (base) m.color.set(base.r, base.g, base.b);
    }
  });
}

/** 取出侧倾组（clone 后 userData 会丢引用，故用名字查找） */
export function getBank(root) {
  return root.getObjectByName('jetBank') || null;
}

/** 机炮口位置（左右各一） */
export function gunOffsets(root, along = 0.82) {
  const s = root.userData.size;
  const halfW = Math.max(s.x, s.z) * 0.22;
  const y = -s.y * 0.06;
  const z = -Math.max(s.x, s.z) * along;
  return [new THREE.Vector3(-halfW, y, z), new THREE.Vector3(halfW, y, z)];
}

/** 尾喷口位置 */
export function tailOffset(root) {
  const s = root.userData.size;
  return new THREE.Vector3(0, -s.y * 0.05, Math.max(s.x, s.z) * 0.52);
}

export function disposeJet(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m) return;
        for (const k in m) {
          const v = m[k];
          if (v && v.isTexture) v.dispose();
        }
      });
    }
  });
}
