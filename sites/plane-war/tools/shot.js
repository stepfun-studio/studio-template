const { connect } = require('./cdp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const cdp = await connect();
  await cdp.send('Page.navigate', { url: URL });
  for (let i = 0; i < 45; i++) { await sleep(1000); if ((await cdp.eval(`window.SKYSTRIKE?window.SKYSTRIKE.GAME.state:'x'`)) === 'menu') break; }
  await cdp.screenshot('/tmp/z_menu.png');
  await cdp.eval(`window.SKYSTRIKE.startGame()`);
  await sleep(2500);
  await cdp.eval(`(()=>{const S=window.SKYSTRIKE,V=Object.getPrototypeOf(S.player.pos).constructor;
    S.spawnEnemy('ace',{pos:S.player.pos.clone().add(new V(6,3,-95))});
    S.spawnEnemy('scout',{pos:S.player.pos.clone().add(new V(-9,-2,-120))});
    S.spawnEnemy('heavy',{pos:S.player.pos.clone().add(new V(0,6,-150))});
    S.player.missiles=8; S.player.triple=12;})()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 405, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(9000);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 405, button: 'left', buttons: 0 });
  await cdp.screenshot('/tmp/z_play.png');
  await cdp.eval(`window.SKYSTRIKE.spawnBoss()`);
  await sleep(4000);
  await cdp.screenshot('/tmp/z_boss.png');
  console.log('[end] ' + await cdp.eval(`JSON.stringify((()=>{const S=window.SKYSTRIKE;return {state:S.GAME.state,kills:S.GAME.kills,score:S.GAME.score,combo:+S.GAME.combo.toFixed(2),locked:S.lock().locked,calls:S.renderer.info.render.calls,tris:S.renderer.info.render.triangles,parts:S.particles.count}})())`));
  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
