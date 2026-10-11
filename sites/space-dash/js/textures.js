import * as THREE from 'three';

/** 用 Canvas 程序化生成贴图，避免任何外部图片依赖 */

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return { c, ctx: c.getContext('2d') };
}

/** 赛道地面：深色沥青 + 霓虹网格 */
export function makeGroundTexture() {
  const S = 512;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = '#0a0718';
  ctx.fillRect(0, 0, S, S);

  // 噪点
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // 网格
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(53,240,255,0.55)';
  ctx.shadowColor = 'rgba(53,240,255,0.8)';
  ctx.shadowBlur = 12;
  for (let i = 0; i <= 4; i++) {
    const p = (i * S) / 4;
    ctx.beginPath(); ctx.moveTo(p + 0.5, 0); ctx.lineTo(p + 0.5, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p + 0.5); ctx.lineTo(S, p + 0.5); ctx.stroke();
  }

  // 中心虚线（更亮）
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,62,165,0.5)';
  ctx.shadowColor = 'rgba(255,62,165,0.9)';
  for (let i = 0; i < 4; i++) {
    const x = (i * S) / 4 + S / 8;
    ctx.beginPath(); ctx.moveTo(x, S / 2 - 40); ctx.lineTo(x, S / 2 + 40); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 两侧楼宇：窗户灯光（同时作为自发光贴图） */
export function makeBuildingTexture() {
  const S = 256;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = '#0a0a16';
  ctx.fillRect(0, 0, S, S);

  const cols = 8, rows = 12;
  const cw = S / cols, ch = S / rows;
  const palette = ['#35f0ff', '#ff3ea5', '#ffd447', '#7c6bff', '#8affe1'];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (Math.random() < 0.42) continue;
      const pad = 3 + Math.random() * 4;
      ctx.fillStyle = palette[(Math.random() * palette.length) | 0];
      ctx.globalAlpha = 0.35 + Math.random() * 0.65;
      ctx.fillRect(x * cw + pad, y * ch + pad, cw - pad * 2, ch - pad * 2);
    }
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 圆形柔光（用于假泛光 / 接触阴影） */
export function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const S = 128;
  const { c, ctx } = canvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 天空渐变 */
export function makeSkyTexture() {
  const W = 64, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.00, '#01000a');
  g.addColorStop(0.42, '#120a3a');
  g.addColorStop(0.66, '#3b1a6b');
  g.addColorStop(0.80, '#7a2a6e');
  g.addColorStop(0.92, '#ff6b6b');
  g.addColorStop(1.00, '#ffb26b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/**
 * 同步蒙皮网格的绑定逆矩阵。
 * three.js 的渲染器每帧都会调用 SkinnedMesh.updateMatrixWorld() 来刷新
 * bindMatrixInverse，而 Object3D.updateWorldMatrix() 不会——只调后者就测量
 * Box3 会得到放大/缩小几十倍的错误结果，必须先跑一遍这个。
 */
export function refreshSkin(root) {
  root.updateWorldMatrix(true, true);
  root.traverse((o) => { if (o.isSkinnedMesh) o.updateMatrixWorld(false); });
}

/** 模型的真实世界包围盒（蒙皮安全） */
export function modelBox(root) {
  refreshSkin(root);
  return new THREE.Box3().setFromObject(root, true);
}

/** 把 obj 临时从父节点摘下来：Box3.setFromObject 量的是世界空间，
 *  父节点带位移时量到的中心会连父亲的偏移一起算进去，归一化就错了。
 *  （切角色时狐狸/机器人会被挂回旧的展示组里，正好踩这个坑） */
function detached(obj, fn) {
  const parent = obj.parent;
  const idx = parent ? parent.children.indexOf(obj) : -1;
  if (parent) parent.remove(obj);
  try { return fn(); } finally {
    if (parent) {
      parent.children.splice(idx < 0 ? parent.children.length : idx, 0, obj);
      obj.parent = parent;
    }
  }
}

export function fitToHeight(obj, targetHeight, { ground = true } = {}) {
  return detached(obj, () => {
    const box = modelBox(obj);
    const size = box.getSize(new THREE.Vector3());
    const s = targetHeight / Math.max(size.y, 1e-6);
    obj.scale.multiplyScalar(s);
    const box2 = modelBox(obj);
    if (ground) obj.position.y -= box2.min.y;
    obj.position.x -= (box2.min.x + box2.max.x) / 2;
    obj.position.z -= (box2.min.z + box2.max.z) / 2;
    return size.y * s;
  });
}

export function fitToSize(obj, target, axis = 'z') {
  return detached(obj, () => {
    const box = modelBox(obj);
    const size = box.getSize(new THREE.Vector3());
    const s = target / Math.max(size[axis], 1e-6);
    obj.scale.multiplyScalar(s);
    const box2 = modelBox(obj);
    obj.position.y -= box2.min.y;
    obj.position.x -= (box2.min.x + box2.max.x) / 2;
    obj.position.z -= (box2.min.z + box2.max.z) / 2;
    return size[axis] * s;
  });
}

/** 单位化尺寸（用于车辆等长条模型） */
