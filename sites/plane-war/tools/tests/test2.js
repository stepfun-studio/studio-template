const { connect } = require('../cdp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.env.URL || 'http://127.0.0.1:8099/index.html';

(async () => {
  const cdp = await connect();
  const logs = [];
  cdp.on((msg) => {
    const p = msg.params || {};
    if (msg.method === 'Runtime.consoleAPICalled') logs.push(`[console.${p.type}] ${(p.args || []).map((a) => a.value).join(' ')}`);
    else if (msg.method === 'Runtime.exceptionThrown') logs.push(`[EXCEPTION] ${p.exceptionDetails.exception && p.exceptionDetails.exception.description || p.exceptionDetails.text}`);
    else if (msg.method === 'Log.entryAdded' && p.entry.level === 'error') logs.push(`[log.error] ${p.entry.text}`);
    else if (msg.method === 'Network.responseReceived' && p.response.status >= 400) logs.push(`[HTTP${p.response.status}] ${p.response.url}`);
  });

  await cdp.send('Page.navigate', { url: URL });
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    if ((await cdp.eval(`window.SKYSTRIKE ? window.SKYSTRIKE.GAME.state : 'boot'`)) === 'menu') break;
  }
  await cdp.eval(`window.SKYSTRIKE.startGame()`);
  await sleep(1200);

  // 1) 帧率（用 three 自己的 frame 计数）
  const f0 = await cdp.eval(`window.SKYSTRIKE.frames()`);
  await sleep(3000);
  const f1 = await cdp.eval(`window.SKYSTRIKE.frames()`);
  console.log(`[fps] ${((f1 - f0) / 3).toFixed(1)} (游戏逻辑帧)`);

  // 2) 手动放敌机在正前方并锁定 + 导弹
  await cdp.eval(`(()=>{
    const S=window.SKYSTRIKE;
    for(let i=0;i<3;i++){
      const p=S.player.pos.clone().add(new (Object.getPrototypeOf(S.player.pos).constructor)(0,0,-70-i*18));
      S.spawnEnemy('scout',{pos:p});
    }
    S.spawnEnemy('ace',{pos:S.player.pos.clone().add(new (Object.getPrototypeOf(S.player.pos).constructor)(30,10,-90))});
    S.spawnEnemy('heavy',{pos:S.player.pos.clone().add(new (Object.getPrototypeOf(S.player.pos).constructor)(-30,-6,-95))});
  })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 405, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(2500);
  console.log('[lock] ' + await cdp.eval(`JSON.stringify((()=>{const S=window.SKYSTRIKE;const l=S.lock();return {has:!!l.t,locked:l.locked,enemies:S.enemies.length,kills:S.GAME.kills,score:S.GAME.score,stats:S.GAME.stats}})())`));
  await cdp.screenshot('/tmp/action.png');

  // 3) 发射导弹
  await cdp.eval(`window.SKYSTRIKE.fireMissile()`);
  await sleep(1200);
  console.log('[missile] ' + await cdp.eval(`JSON.stringify((()=>{const S=window.SKYSTRIKE;return {missiles:S.player.missiles,bullets:S.bullets.filter(b=>b.missile).length,kills:S.GAME.kills,score:S.GAME.score}})())`));

  // 4) BOSS
  await cdp.eval(`window.SKYSTRIKE.spawnBoss()`);
  await sleep(2000);
  console.log('[boss] ' + await cdp.eval(`JSON.stringify((()=>{const S=window.SKYSTRIKE;const b=S.enemies.find(e=>e.kind==='boss');return {boss:!!b,bossHp:b?b.hp:0,scale:b?+b.obj.scale.x.toFixed(2):0,enemies:S.enemies.length}})())`));
  await cdp.screenshot('/tmp/boss.png');

  // 5) 补给
  await cdp.eval(`window.SKYSTRIKE.dropPickup(window.SKYSTRIKE.player.pos.clone().add(new (Object.getPrototypeOf(window.SKYSTRIKE.player.pos).constructor)(0,0,-20)))`);
  await sleep(600);
  console.log('[pickup] ' + await cdp.eval(`JSON.stringify({hp:Math.round(window.SKYSTRIKE.player.hp),msl:window.SKYSTRIKE.player.missiles})`));

  // 6) 受伤 → 死亡 → 结算
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 405, button: 'left', buttons: 0 });
  await cdp.eval(`window.SKYSTRIKE.damagePlayer(40)`);
  await sleep(700);
  console.log('[hit] ' + await cdp.eval(`JSON.stringify({hp:Math.round(window.SKYSTRIKE.player.hp),dmgFlash:document.getElementById('dmgFlash').classList.contains('on'),subtitle:document.getElementById('subtitle').textContent.slice(0,20)})`));
  await cdp.eval(`window.SKYSTRIKE.damagePlayer(200)`);
  await sleep(3500);
  console.log('[dead] ' + await cdp.eval(`JSON.stringify({state:window.SKYSTRIKE.GAME.state,goHidden:document.getElementById('gameover').classList.contains('hidden'),goScore:document.getElementById('goScore').textContent,goKills:document.getElementById('goKills').textContent,best:localStorage.getItem('skystrike3d.best')})`));
  await cdp.screenshot('/tmp/gameover.png');

  // 7) 重开 + 暂停
  await cdp.eval(`document.getElementById('btnRetry').click()`);
  await sleep(1200);
  console.log('[retry] ' + await cdp.eval(`JSON.stringify({state:window.SKYSTRIKE.GAME.state,hp:Math.round(window.SKYSTRIKE.player.hp),enemies:window.SKYSTRIKE.enemies.length,score:window.SKYSTRIKE.GAME.score})`));
  await cdp.eval(`document.getElementById('btnPause').click()`);
  await sleep(400);
  console.log('[pause] ' + await cdp.eval(`JSON.stringify({state:window.SKYSTRIKE.GAME.state,pauseHidden:document.getElementById('pause').classList.contains('hidden')})`));
  await cdp.eval(`document.getElementById('btnResume').click()`);
  await sleep(400);
  console.log('[resume] ' + await cdp.eval(`JSON.stringify({state:window.SKYSTRIKE.GAME.state})`));

  // 8) 静音按钮
  await cdp.eval(`document.getElementById('btnSound').click()`);
  await sleep(200);
  console.log('[mute] ' + await cdp.eval(`JSON.stringify({muted:window.SKYSTRIKE.audio.muted,gain:window.SKYSTRIKE.audio.master.gain.value})`));
  await cdp.eval(`document.getElementById('btnSound').click()`);

  // 9) 键盘操控
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
  await sleep(1500);
  console.log('[keys] ' + await cdp.eval(`JSON.stringify((()=>{const S=window.SKYSTRIKE;const V=Object.getPrototypeOf(S.player.pos).constructor;const n=new V(0,0,-1).applyQuaternion(S.player.quat);return {up:!!S.input.keys.up,nose:[+n.x.toFixed(2),+n.y.toFixed(2),+n.z.toFixed(2)],y:+S.player.pos.y.toFixed(1)}})())`));
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
  await sleep(1200);
  console.log('[keys2] ' + await cdp.eval(`JSON.stringify((()=>{const S=window.SKYSTRIKE;return {y:+S.player.pos.y.toFixed(1),speed:+S.player.speed.toFixed(0)}})())`));

  // 10) 加力
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
  await sleep(2500);
  console.log('[boost] ' + await cdp.eval(`JSON.stringify({speed:+window.SKYSTRIKE.player.speed.toFixed(0),boost:Math.round(window.SKYSTRIKE.player.boost),fov:+window.SKYSTRIKE.camera.fov.toFixed(1)})`));
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });

  await sleep(1500);
  await cdp.screenshot('/tmp/final.png');
  console.log('[end] ' + await cdp.eval(`JSON.stringify((()=>{const S=window.SKYSTRIKE;return {state:S.GAME.state,wave:S.GAME.wave,score:S.GAME.score,kills:S.GAME.kills,enemies:S.enemies.length,calls:S.renderer.info.render.calls,tris:S.renderer.info.render.triangles,parts:S.particles.count}})())`));
  console.log('--- 日志(' + logs.length + ') ---\n' + logs.slice(0, 30).join('\n'));
  process.exit(0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
