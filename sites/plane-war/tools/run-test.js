const { connect } = require('./cdp');

const URL = process.env.URL || 'http://127.0.0.1:8099/index.html';
const PLAY = +(process.env.PLAY || 6000);
const SHOT = process.env.SHOT || '/tmp/shot.png';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const cdp = await connect();
  const logs = [];
  cdp.on((msg) => {
    const p = msg.params || {};
    if (msg.method === 'Runtime.consoleAPICalled') {
      const txt = (p.args || []).map((a) => (a.value !== undefined ? a.value : (a.description || a.type))).join(' ');
      logs.push(`[console.${p.type}] ${txt}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push(`[EXCEPTION] ${p.exceptionDetails.exception && p.exceptionDetails.exception.description || p.exceptionDetails.text}`);
    } else if (msg.method === 'Log.entryAdded') {
      if (p.entry.level !== 'warning' || /shader|GL_INVALID|WebGL/i.test(p.entry.text))
        logs.push(`[log.${p.entry.level}] ${p.entry.text}`);
    } else if (msg.method === 'Network.loadingFailed') logs.push(`[NETFAIL] ${p.errorText}`);
    else if (msg.method === 'Network.responseReceived' && p.response.status >= 400) logs.push(`[HTTP${p.response.status}] ${p.response.url}`);
  });

  await cdp.send('Page.navigate', { url: URL });
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    const st = await cdp.eval(`window.SKYSTRIKE ? window.SKYSTRIKE.GAME.state : 'boot'`);
    if (st === 'menu' || st === 'playing') break;
  }
  console.log('[info] ' + await cdp.eval(`JSON.stringify((()=>{
    const S=window.SKYSTRIKE;
    const jet=S.player.obj.children[0];
    return {
      state:S.GAME.state,
      voices:Object.keys(S.audio.buffers).length,
      jetSize:jet.userData.size?[+jet.userData.size.x.toFixed(2),+jet.userData.size.y.toFixed(2),+jet.userData.size.z.toFixed(2)]:null,
      guns:S.player.guns.map(g=>[+g.x.toFixed(2),+g.y.toFixed(2),+g.z.toFixed(2)]),
      audioCtx:S.audio.ctx?S.audio.ctx.state:'none',
      prog:S.renderer.info.programs.length,
    };
  })())`));
  await cdp.screenshot('/tmp/menu.png');

  await cdp.eval(`window.SKYSTRIKE.startGame()`);
  await sleep(2500);
  // FPS 采样
  await cdp.eval(`window.__f0=performance.now();window.__n=0;window.__fpsHook=()=>{window.__n++};window.SKYSTRIKE.renderer.setAnimationLoop(()=>{});`);
  await cdp.eval(`(function(){const f=()=>{window.__n++;requestAnimationFrame(f)};f()})()`);
  await sleep(3000);
  console.log('[fps] ' + await cdp.eval(`JSON.stringify({fps:+(window.__n/((performance.now()-window.__f0)/1000)).toFixed(1), vp:[innerWidth,innerHeight]})`));
  console.log('[mid] ' + await cdp.eval(`JSON.stringify({state:window.SKYSTRIKE.GAME.state,wave:window.SKYSTRIKE.GAME.wave,enemies:window.SKYSTRIKE.enemies.length,audio:window.SKYSTRIKE.audio.ctx.state})`));

  // 真实鼠标事件测试
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1000, y: 480, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(400);
  console.log('[fire-check] ' + await cdp.eval(`JSON.stringify({inputFire:window.SKYSTRIKE.input.fire, bullets:window.SKYSTRIKE.bullets.length})`));
  await sleep(PLAY);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1000, y: 480, button: 'left', buttons: 0 });

  console.log('[after] ' + await cdp.eval(`JSON.stringify((()=>{
    const S=window.SKYSTRIKE;
    const V=Object.getPrototypeOf(S.player.pos).constructor;
    const nose=new V(0,0,-1).applyQuaternion(S.player.quat);
    return {
      state:S.GAME.state, score:S.GAME.score, kills:S.GAME.kills, wave:S.GAME.wave,
      enemies:S.enemies.length, bullets:S.bullets.length, eBul:S.eBullets.length,
      parts:S.particles.count, hp:Math.round(S.player.hp), missiles:S.player.missiles,
      playerY:+S.player.pos.y.toFixed(1), camY:+S.camera.position.y.toFixed(1),
      camDist:+S.camera.position.distanceTo(S.player.pos).toFixed(1),
      nose:[+nose.x.toFixed(2),+nose.y.toFixed(2),+nose.z.toFixed(2)],
      calls:S.renderer.info.render.calls, tris:S.renderer.info.render.triangles,
      enemiesInfo:S.enemies.slice(0,4).map(e=>{
        const n=new V(0,0,-1).applyQuaternion(e.obj.quaternion);
        const toP=S.player.pos.clone().sub(e.pos).normalize();
        return {kind:e.kind,noseDotToPlayer:+n.dot(toP).toFixed(3),d:+e.pos.distanceTo(S.player.pos).toFixed(0)};
      }),
      lock: (()=>{const l=S.lock(); return {has:!!l.t, locked:l.locked};})(),
      stats:JSON.parse(JSON.stringify(S.GAME.stats)),
      queue:S.GAME.spawnQueue.length,
      elementAtPoint:(()=>{const el=document.elementFromPoint(window.innerWidth/2,window.innerHeight/2);return el?el.id||el.tagName:'none'})(),
      vp:[window.innerWidth,window.innerHeight],
    };
  })())`));
  await cdp.screenshot(SHOT);
  console.log('[shot] ' + SHOT);
  console.log('--- 页面日志(' + logs.length + ') ---');
  console.log(logs.slice(0, 40).join('\n'));
  process.exit(0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
