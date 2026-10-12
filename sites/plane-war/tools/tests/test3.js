const { connect } = require('../cdp');
const URL = process.env.URL || 'http://127.0.0.1:8099/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (s) => JSON.stringify(s);

(async () => {
  const cdp = await connect();
  const logs = [];
  cdp.on((m) => {
    const p = m.params || {};
    if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') logs.push('[console.error] ' + (p.args || []).map((a) => a.value).join(' '));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('[EXCEPTION] ' + (p.exceptionDetails.exception ? p.exceptionDetails.exception.description : p.exceptionDetails.text));
    else if (m.method === 'Log.entryAdded' && p.entry.level === 'error') logs.push('[log.error] ' + p.entry.text);
    else if (m.method === 'Network.responseReceived' && p.response.status >= 400) logs.push('[HTTP' + p.response.status + '] ' + p.response.url);
  });
  const ev = async (e) => (await cdp.eval(e));
  const V = 'Object.getPrototypeOf(window.SKYSTRIKE.player.pos).constructor';

  await cdp.send('Page.navigate', { url: URL });
  for (let i = 0; i < 45; i++) { await sleep(1000); if ((await ev(`window.SKYSTRIKE?window.SKYSTRIKE.GAME.state:'x'`)) === 'menu') break; }
  console.log('[boot] ' + await ev(`JSON.stringify({state:window.SKYSTRIKE.GAME.state,voices:Object.keys(window.SKYSTRIKE.audio.buffers).length,menu:document.getElementById('menu').classList.contains('hidden')===false})`));
  await cdp.screenshot('/tmp/v_menu.png');

  await ev(`window.SKYSTRIKE.startGame()`);
  await sleep(1500);
  const f0 = await ev(`window.SKYSTRIKE.frames()`);
  await sleep(4000);
  const f1 = await ev(`window.SKYSTRIKE.frames()`);
  console.log(`[fps] 无头软渲染 ${((f1 - f0) / 4).toFixed(1)}（render+finish 仅 1.1ms，真实 GPU 上非瓶颈）`);

  /* --- 战斗：锁定 / 机炮 / 导弹 --- */
  await ev(`(()=>{const S=window.SKYSTRIKE,V=${V};
    for(let i=0;i<4;i++) S.spawnEnemy('scout',{pos:S.player.pos.clone().add(new V((i-1.5)*14,2,-90-i*16))});
    S.spawnEnemy('ace',{pos:S.player.pos.clone().add(new V(28,8,-110))});
    S.spawnEnemy('heavy',{pos:S.player.pos.clone().add(new V(-28,-6,-115))});})()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 405, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(7000);
  console.log('[lock] ' + await ev(`JSON.stringify((()=>{const S=window.SKYSTRIKE,l=S.lock();return {target:!!l.t,locked:l.locked,kills:S.GAME.kills,score:S.GAME.score,parts:S.particles.count}})())`));
  await cdp.screenshot('/tmp/v_lock.png');
  console.log('[missile] ' + await ev(`(window.SKYSTRIKE.fireMissile(),'sent')`));
  await sleep(1500);
  console.log('[afterMissile] ' + await ev(`JSON.stringify({kills:window.SKYSTRIKE.GAME.kills,score:window.SKYSTRIKE.GAME.score,combo:window.SKYSTRIKE.GAME.combo})`));

  /* --- BOSS + 血条 --- */
  await ev(`window.SKYSTRIKE.spawnBoss()`);
  await sleep(2500);
  console.log('[boss] ' + await ev(`JSON.stringify((()=>{const S=window.SKYSTRIKE,b=S.enemies.find(e=>e.kind==='boss');return {alive:!!b,hp:b?b.hp:0,bar:!document.getElementById('bossBar').classList.contains('hidden'),w:document.getElementById('bossFill').style.width}})())`));
  await cdp.screenshot('/tmp/v_boss.png');

  /* --- 补给 --- */
  await ev(`(()=>{const S=window.SKYSTRIKE,V=${V};S.dropPickup(S.player.pos.clone().add(new V(0,0,-25)));})()`);
  await sleep(1200);
  console.log('[pickup] ' + await ev(`JSON.stringify({hp:Math.round(window.SKYSTRIKE.player.hp),msl:window.SKYSTRIKE.player.missiles,triple:window.SKYSTRIKE.player.triple})`));

  /* --- 受伤 / 低血量 --- */
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 405, button: 'left', buttons: 0 });
  await ev(`window.SKYSTRIKE.damagePlayer(70)`);
  await sleep(900);
  console.log('[lowhp] ' + await ev(`JSON.stringify({hp:Math.round(window.SKYSTRIKE.player.hp),sub:document.getElementById('subtitle').textContent,warn:document.getElementById('warnBox').classList.contains('on'),alarm:window.SKYSTRIKE.audio.voice})`));
  await cdp.screenshot('/tmp/v_lowhp.png');

  /* --- 死亡 → 结算 --- */
  await ev(`window.SKYSTRIKE.damagePlayer(999)`);
  await sleep(16000);
  console.log('[dead] ' + await ev(`JSON.stringify({state:window.SKYSTRIKE.GAME.state,shown:!document.getElementById('gameover').classList.contains('hidden'),score:document.getElementById('goScore').textContent,kills:document.getElementById('goKills').textContent,wave:document.getElementById('goWave').textContent,best:localStorage.getItem('skystrike3d.best')})`));
  await cdp.screenshot('/tmp/v_gameover.png');

  /* --- 重开 --- */
  await ev(`document.getElementById('btnRetry').click()`);
  await sleep(2000);
  console.log('[retry] ' + await ev(`JSON.stringify({state:window.SKYSTRIKE.GAME.state,hp:Math.round(window.SKYSTRIKE.player.hp),score:window.SKYSTRIKE.GAME.score,enemies:window.SKYSTRIKE.enemies.length,best:window.SKYSTRIKE.GAME.best})`));

  /* --- 波次推进 --- */
  await ev(`(()=>{const S=window.SKYSTRIKE;for(const e of S.enemies.slice()) S.killEnemy(e);})()`);
  await sleep(500);
  await ev(`window.SKYSTRIKE.GAME.waveGap = 0.02`);
  await sleep(6000);
  console.log('[wave2] ' + await ev(`JSON.stringify({wave:window.SKYSTRIKE.GAME.wave,queue:window.SKYSTRIKE.GAME.spawnQueue.length,ann:document.getElementById('announce').textContent})`));
  await cdp.screenshot('/tmp/v_wave2.png');

  /* --- 暂停 / 静音 --- */
  await ev(`document.getElementById('btnPause').click()`);
  await sleep(600);
  console.log('[pause] ' + await ev(`JSON.stringify({state:window.SKYSTRIKE.GAME.state,shown:!document.getElementById('pause').classList.contains('hidden')})`));
  await ev(`document.getElementById('btnResume').click()`);
  await sleep(600);
  await ev(`document.getElementById('btnSound').click()`);
  await sleep(400);
  console.log('[mute] ' + await ev(`JSON.stringify({muted:window.SKYSTRIKE.audio.muted,gain:window.SKYSTRIKE.audio.master.gain.value,btn:document.getElementById('btnSound').textContent})`));
  await ev(`document.getElementById('btnSound').click()`);

  /* --- 键盘操控 --- */
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
  await sleep(2500);
  const k1 = await ev(`JSON.stringify((()=>{const S=window.SKYSTRIKE,V=${V};const n=new V(0,0,-1).applyQuaternion(S.player.quat);return {nose:[+n.x.toFixed(2),+n.y.toFixed(2),+n.z.toFixed(2)],y:+S.player.pos.y.toFixed(1)}})())`);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
  await sleep(2000);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
  console.log('[keys] ' + k1);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
  await sleep(4000);
  console.log('[boost] ' + await ev(`JSON.stringify({speed:+window.SKYSTRIKE.player.speed.toFixed(0),fov:+window.SKYSTRIKE.camera.fov.toFixed(1),tag:document.getElementById('weaponTag').textContent})`));
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });

  await sleep(2500);
  await cdp.screenshot('/tmp/v_final.png');
  console.log('[end] ' + await ev(`JSON.stringify((()=>{const S=window.SKYSTRIKE;return {state:S.GAME.state,wave:S.GAME.wave,score:S.GAME.score,kills:S.GAME.kills,calls:S.renderer.info.render.calls,tris:S.renderer.info.render.triangles,tex:S.renderer.info.memory.textures,geo:S.renderer.info.memory.geometries,parts:S.particles.count}})())`));
  console.log('--- 日志(' + logs.length + ') ---\n' + logs.slice(0, 20).join('\n'));
  process.exit(0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
