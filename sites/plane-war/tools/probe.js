const { connect } = require('./cdp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const cdp = await connect();
  const logs = [];
  cdp.on((m) => { if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails.text); });
  await cdp.send('Page.navigate', { url: URL });
  for (let i = 0; i < 45; i++) { await sleep(1000); if ((await cdp.eval(`window.SKYSTRIKE?window.SKYSTRIKE.GAME.state:'x'`)) === 'menu') break; }
  await cdp.eval(`window.SKYSTRIKE.startGame()`);
  await sleep(1200);
  await cdp.eval(`(()=>{const S=window.SKYSTRIKE;const V=Object.getPrototypeOf(S.player.pos).constructor;
    S.spawnEnemy('scout',{pos:S.player.pos.clone().add(new V(0,0,-120))});
    S.spawnEnemy('heavy',{pos:S.player.pos.clone().add(new V(40,0,-120))});
    S.spawnEnemy('ace',{pos:S.player.pos.clone().add(new V(-40,0,-120))});})()`);
  await sleep(600);
  console.log(await cdp.eval(`JSON.stringify((()=>{
    const S=window.SKYSTRIKE;
    const out=[];
    S.scene.traverse(o=>{
      if(!o.isMesh && !o.isPoints) return;
      const d=o.getWorldPosition(new (Object.getPrototypeOf(S.player.pos).constructor)()).distanceTo(S.camera.position);
      const mat=Array.isArray(o.material)?o.material[0]:o.material;
      const col=mat&&mat.color?('#'+mat.color.getHexString()):'-';
      out.push({name:o.name||o.type, geo:o.geometry.type, d:+d.toFixed(0), col, op:mat?+ (mat.opacity||1):1, vis:o.visible, blend:mat?mat.blending:'-', kids:o.children.length});
    });
    out.sort((a,b)=>a.d-b.d);
    return out.filter(o=>o.d>25).slice(0,60);
  })(),null,1)`));
  console.log('[enemies] ' + await cdp.eval(`JSON.stringify(window.SKYSTRIKE.enemies.map(e=>({k:e.kind,pos:e.pos.toArray().map(v=>+v.toFixed(0)),sc:+e.obj.scale.x.toFixed(2),meshes:(()=>{let n=0;e.obj.traverse(o=>{if(o.isMesh)n++});return n})()})))`));
  console.log(logs.join('\n'));
  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
