#!/usr/bin/env node
/**
 * verify-model.js —— 战机模型健康检查（本项目曾经的线上事故回归测试）
 *
 * 检查项：
 *   1. makeJet() 产物的尺寸 / 网格数 / 三角面数
 *   2. 顶点里是否出现 NaN（曾经的 bug：量化+交错的整数顶点缓冲被原样写回浮点）
 *   3. 翼展/机长比是否与真机一致（F-16≈0.66，L-159≈0.75）
 *
 * 用法：
 *   先起本地服务，再跑
 *     node tools/serve.js &            # 或 python3 -m http.server 8099
 *     node tools/tests/verify-model.js
 *   可选环境变量：URL=http://127.0.0.1:8099/index.html  CDP=http://127.0.0.1:9222
 */
'use strict';
const { connect } = require('../cdp');

const URL = process.env.URL || 'http://127.0.0.1:8099/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 真机尺寸（米）：机长 / 翼展 / 机高 —— 用于核对比例
const SPEC = {
  f16: { real: { len: 15.06, span: 9.96, h: 4.88 }, opt: { length: 6.6, yawFix: Math.PI } },
  l159: { real: { len: 12.72, span: 9.54, h: 4.36 }, opt: { length: 6.0, yawFix: -Math.PI / 2 } },
};

const pageFn = `(async () => {
  const THREE = await import('/js/vendor/three.module.js');
  const { GLTFLoader } = await import('/js/vendor/addons/loaders/GLTFLoader.js');
  const M = await import('/js/models.js');
  const out = {};
  for (const [name, url, opt] of [
    ['f16', '/assets/models/f16.glb', ${JSON.stringify(SPEC.f16.opt).replace('"Math.PI"', 'Math.PI')}],
    ['l159', '/assets/models/l159.glb', ${JSON.stringify(SPEC.l159.opt).replace('"-Math.PI / 2"', '-Math.PI / 2')}],
  ]) {
    const buf = await (await fetch(url)).arrayBuffer();
    const g = await new GLTFLoader().parseAsync(buf, '');
    const jet = M.makeJet(g.scene, opt);
    const s = new THREE.Box3().setFromObject(jet).getSize(new THREE.Vector3());
    let meshes = 0, tris = 0, nan = 0, interleaved = 0, quantized = 0;
    jet.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const p = o.geometry.attributes.position;
      const arr = p.array;
      for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) nan++;
      tris += o.geometry.index ? o.geometry.index.count / 3 : p.count / 3;
      if (p.isInterleavedBufferAttribute) interleaved++;
      if (p.isInterleavedBufferAttribute && p.normalized) quantized++;
    });
    const inner = jet.getObjectByName('optimized');
    out[name] = {
      size: [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)],
      spanRatio: +(s.x / s.z).toFixed(3),
      meshes, tris: Math.round(tris), nanVerts: nan,
      interleavedAttrs: interleaved, quantizedAttrs: quantized,
      innerScale: +(inner ? inner.scale.x : NaN).toFixed(4),
    };
  }
  return JSON.stringify(out, null, 1);
})()`;

(async () => {
  const cdp = await connect();
  await cdp.send('Page.navigate', { url: URL });
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    const st = await cdp.eval(`window.SKYSTRIKE ? window.SKYSTRIKE.GAME.state : 'boot'`);
    if (st === 'menu' || st === 'playing') break;
  }
  const raw = await cdp.eval(pageFn, true);
  const r = JSON.parse(raw);

  let fail = 0;
  const check = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) fail++; };
  for (const [name, d] of Object.entries(r)) {
    const real = SPEC[name].real;
    console.log(`\n${name.toUpperCase()}  尺寸 ${d.size.join(' × ')}  网格 ${d.meshes}  三角面 ${d.tris}`);
    check(d.nanVerts === 0, `顶点无 NaN（当前 ${d.nanVerts}）`);
    check(d.interleavedAttrs === 0 && d.quantizedAttrs === 0,
      `烘焙后已去交错/去量化（interleaved=${d.interleavedAttrs}, quantized=${d.quantizedAttrs}）`);
    const realSpan = real.span / real.len;
    check(Math.abs(d.spanRatio - realSpan) < 0.08,
      `翼展/机长 = ${d.spanRatio}（真机 ${realSpan.toFixed(2)}）→ 机翼存在`);
    check(d.tris > 5000, `三角面数 ${d.tris} > 5000（模型未塌成块）`);
    check(d.innerScale > 0.1 && d.innerScale < 1.5, `归一化尺度 ${d.innerScale} 合理`);
  }
  console.log(fail ? `\n✗ ${fail} 项未通过` : '\n✅ 模型全部健康');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
