const { connect } = require('../cdp');
const URL = process.env.URL || 'http://127.0.0.1:8099/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = 'Object.getPrototypeOf(window.SKYSTRIKE.player.pos).constructor';

(async () => {
  const cdp = await connect();
  const logs = [];
  cdp.on((m) => {
    const p = m.params || {};
    if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') logs.push('[console.error] ' + (p.args || []).map((a) => a.value).join(' '));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('[EXCEPTION] ' + (p.exceptionDetails.exception ? p.exceptionDetails.exception.description : p.exceptionDetails.text));
    else if (m.method === 'Network.responseReceived' && p.response.status >= 400) logs.push('[HTTP' + p.response.status + '] ' + p.response.url);
  });
  const ev = async (e) => (await cdp.eval(e));

  await cdp.send('Page.navigate', { url: URL });
  for (let i = 0; i < 45; i++) { await sleep(1000); if ((await ev(`window.SKYSTRIKE?window.SKYSTRIKE.GAME.state:'x'`)) === 'menu') break; }
  await ev(`window.SKYSTRIKE.startGame()`);
  await sleep(2000);

  // 把敌机放到准星正前方（x≈0），确保持续命中
  await ev(`(()=>{const S=window.SKYSTRIKE,V=${V};
    for(let i=0;i<3;i++) S.spawnEnemy('scout',{pos:S.player.pos.clone().add(new V(0,0,-75-i*18))});
    S.spawnEnemy('ace',{pos:S.player.pos.clone().add(new V(0,4,-120))});
    S.spawnEnemy('heavy',{pos:S.player.pos.clone().add(new V(0,-4,-140))});})()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 405, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(9000);
  console.log('[fight] ' + await ev(`JSON.stringify((()=>{const S=window.SKYSTRIKE,l=S.lock();return {kills:S.GAME.kills,score:S.GAME.score,combo:+S.GAME.combo.toFixed(2),maxCombo:+S.GAME.maxCombo.toFixed(2),locked:l.locked,parts:S.particles.count,rings:S.renderer.info.render.calls}})())`));
  await cdp.screenshot('/tmp/w_fight.png');

  // 锁定后导弹
  console.log('[lock] ' + await ev(`JSON.stringify(window.SKYSTRIKE.lock())`));
  console.log('[fireMissile] ' + await ev(`(window.SKYSTRIKE.fireMissile(),'sent')`));
  await sleep(6000);
  console.log('[afterMissile] ' + await ev(`JSON.stringify({kills:window.SKYSTRIKE.GAME.kills,score:window.SKYSTRIKE.GAME.score,msl:window.SKYSTRIKE.player.missiles})`));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 405, button: 'left', buttons: 0 });

  // 补给（三种都试）
  for (const kind of ['hp', 'msl', 'power']) {
    await ev(`(()=>{const S=window.SKYSTRIKE,V=${V};
      const p=S.player.pos.clone().add(new V(0,0,-45));
      S.dropPickup(p);})()`);
    await sleep(7000);
    console.log(`[pickup:${kind}] ` + await ev(`JSON.stringify({hp:Math.round(window.SKYSTRIKE.player.hp),msl:window.SKYSTRIKE.player.missiles,triple:window.SKYSTRIKE.player.triple,left:window.SKYSTRIKE.pickups.length})`));
  }

  // 低血量
  await ev(`window.SKYSTRIKE.damagePlayer(80)`);
  await sleep(1200);
  console.log('[lowhp] ' + await ev(`JSON.stringify({hp:Math.round(window.SKYSTRIKE.player.hp),barLow:document.getElementById('hpBar').classList.contains('low'),vig:document.getElementById('vignette').classList.contains('low')||getComputedStyle(document.getElementById('vignette')).boxShadow!=='none'})`));
  await cdp.screenshot('/tmp/w_lowhp.png');

  // 死亡 → 结算
  await ev(`window.SKYSTRIKE.damagePlayer(999)`);
  await sleep(26000);
  console.log('[dead] ' + await ev(`JSON.stringify({state:window.SKYSTRIKE.GAME.state,shown:!document.getElementById('gameover').classList.contains('hidden'),score:document.getElementById('goScore').textContent,kills:document.getElementById('goKills').textContent,wave:document.getElementById('goWave').textContent,best:localStorage.getItem('skystrike3d.best'),bestUI:document.getElementById('best').textContent})`));
  await cdp.screenshot('/tmp/w_gameover.png');

  // 重开 + 波次推进
  await ev(`document.getElementById('btnRetry').click()`);
  await sleep(2500);
  console.log('[retry] ' + await ev(`JSON.stringify({state:window.SKYSTRIKE.GAME.state,hp:Math.round(window.SKYSTRIKE.player.hp),score:window.SKYSTRIKE.GAME.score,best:window.SKYSTRIKE.GAME.best})`));
  await ev(`(()=>{const S=window.SKYSTRIKE;for(const e of S.enemies.slice()) S.killEnemy(e);})()`);
  await ev(`window.SKYSTRIKE.GAME.waveGap = 0.02`);
  await sleep(8000);
  console.log('[wave2] ' + await ev(`JSON.stringify({wave:window.SKYSTRIKE.GAME.wave,queue:window.SKYSTRIKE.GAME.spawnQueue.length,ann:document.getElementById('announce').textContent,hp:Math.round(window.SKYSTRIKE.player.hp)})`));
  await sleep(6000);
  await cdp.screenshot('/tmp/w_wave2.png');
  console.log('[end] ' + await ev(`JSON.stringify((()=>{const S=window.SKYSTRIKE;return {state:S.GAME.state,wave:S.GAME.wave,score:S.GAME.score,kills:S.GAME.kills,enemies:S.enemies.length,calls:S.renderer.info.render.calls,tris:S.renderer.info.render.triangles,tex:S.renderer.info.memory.textures,geo:S.renderer.info.memory.geometries,prog:S.renderer.info.programs.length,parts:S.particles.count}})())`));
  console.log('--- 日志(' + logs.length + ') ---\n' + logs.slice(0, 20).join('\n'));
  process.exit(0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
