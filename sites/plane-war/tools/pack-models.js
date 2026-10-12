#!/usr/bin/env node
/**
 * pack-models.js —— 把 assets/models/*.glb 转成 base64 的 ES Module（js/data-*.js）
 *
 * 为什么这样做：发布平台 / 部分静态托管会拒绝或不稳定地服务 .glb 这类二进制扩展名，
 * 因此把模型整体内嵌成 JS 字符串，运行时由 GLTFLoader 直接解析 ArrayBuffer。
 * 游戏本身完全不依赖 assets/models/ 目录，.glb 仅作为源素材保留。
 *
 * 用法（在项目根目录执行）：
 *   node tools/pack-models.js            # 重新生成 js/data-f16.js 与 js/data-l159.js
 *   node tools/pack-models.js --check    # 只校验现有文件是否与 .glb 一致，不写入
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHUNK = 120; // 每行 base64 字符数

const JOBS = [
  { glb: 'assets/models/f16.glb', out: 'js/data-f16.js', name: 'F16_GLB' },
  { glb: 'assets/models/l159.glb', out: 'js/data-l159.js', name: 'L159_GLB' },
];

function render(rel, abs, name) {
  const bin = fs.readFileSync(abs);
  const b64 = bin.toString('base64');
  const lines = [];
  for (let i = 0; i < b64.length; i += CHUNK) lines.push(b64.slice(i, i + CHUNK));
  return [
    '/* 开源战机模型（Sketchfab · CC BY 4.0）以 base64 内嵌，规避发布平台对二进制扩展名的限制。',
    `   源文件：${rel}（${bin.length} 字节） */`,
    `export const ${name} =`,
    lines.map((l, i) => `  '${l}'${i === lines.length - 1 ? ';' : ' +'}`).join('\n'),
    '',
  ].join('\n');
}

const checkOnly = process.argv.includes('--check');
let bad = 0;
for (const j of JOBS) {
  const abs = path.join(ROOT, j.glb);
  const outAbs = path.join(ROOT, j.out);
  if (!fs.existsSync(abs)) { console.error(`✗ 缺少源模型 ${j.glb}`); bad++; continue; }
  const text = render(j.glb, abs, j.name);
  if (checkOnly) {
    const cur = fs.existsSync(outAbs) ? fs.readFileSync(outAbs, 'utf8') : '';
    const ok = cur === text;
    console.log(`${ok ? '✓' : '✗'} ${j.out} ${ok ? '与源 .glb 一致' : '与源 .glb 不一致（需重新生成）'}`);
    if (!ok) bad++;
  } else {
    fs.writeFileSync(outAbs, text);
    console.log(`✓ ${j.glb} (${fs.statSync(abs).size}B) → ${j.out}`);
  }
}
process.exit(bad ? 1 : 0);
