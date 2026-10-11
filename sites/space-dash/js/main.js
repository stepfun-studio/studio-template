import { Game } from './game.js';
import { Sfx } from './audio.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const el = {
  loading: $('#screen-loading'), loadFill: $('#load-fill'), loadTip: $('#load-tip'),
  title: $('#screen-title'), best: $('#best-score'),
  hud: $('#hud'), score: $('#hud-score'), dist: $('#hud-dist'), ducks: $('#hud-ducks'),
  dangerFill: $('#danger-fill'), dangerWrap: document.querySelector('.danger-wrap'),
  pop: $('#float-pop'),
  pause: $('#screen-pause'), over: $('#screen-over'),
  overTitle: $('#over-title'), overReason: $('#over-reason'),
  overScore: $('#over-score'), overDist: $('#over-dist'), overDucks: $('#over-ducks'), overBest: $('#over-best'),
  touchPad: $('#touch-pad'), fatal: $('#fatal'),
  sound: $('#btn-sound'),
  helpBtn: $('#btn-help'), helpCard: $('#help-card'), helpClose: $('#btn-help-close'),
  runHint: $('#run-hint')
};

const sfx = new Sfx();
const BEST_KEY = 'neondash.best';
const SOUND_KEY = 'neondash.sound';
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let selectedChar = 'robot';
let soldierReady = false;

el.best.textContent = best;

/* ---------- 提示条 ---------- */
let toastTimer = null;
function toast(text) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:absolute;left:50%;top:22%;transform:translateX(-50%);' +
      'padding:9px 18px;border-radius:99px;font-size:14px;font-weight:700;white-space:nowrap;' +
      'background:rgba(10,6,30,.85);border:1px solid rgba(53,240,255,.45);color:#eaf6ff;' +
      'box-shadow:0 0 24px rgba(53,240,255,.25);pointer-events:none;z-index:5;transition:opacity .3s';
    $('#app').appendChild(t);
  }
  t.textContent = text;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 1500);
}

function show(node) { node.classList.remove('hidden'); }
function hide(node) { node.classList.add('hidden'); }

/* ---------- 首屏操作说明：默认收起，只占右上角一个问号 ---------- */
function toggleHelp(force) {
  const open = force !== undefined ? force : el.helpCard.classList.contains('hidden');
  el.helpCard.classList.toggle('hidden', !open);
  if (open) sfx.select();
}
el.helpBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleHelp(); });
el.helpClose.addEventListener('click', (e) => { e.stopPropagation(); toggleHelp(false); });

/* ---------- 开局后自动淡出的操作提示（首屏不放说明） ---------- */
let hintTimer = null;
function flashRunHint() {
  const text = isTouchDevice()
    ? '左右滑动变道 · 上滑跳跃（再滑一次二段跳）· 下滑滑铲'
    : '<b>&larr; &rarr;</b> 变道 &nbsp;·&nbsp; <b>&uarr; / 空格</b> 跳跃（空中再按一次＝二段跳） &nbsp;·&nbsp; <b>&darr;</b> 滑铲';
  el.runHint.innerHTML = text;
  el.runHint.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.runHint.classList.remove('show'), 4200);
}

/* ---------- 启动 ---------- */
let game = null;

async function boot() {
  const canvas = $('#game-canvas');
  try {
    game = new Game(canvas, {
      onHud: renderHud,
      onEvent: handleEvent,
      onGameOver: handleGameOver,
      onPauseChange: (p) => { p ? show(el.pause) : hide(el.pause); }
    });
  } catch (err) {
    console.error(err);
    hide(el.loading);
    show(el.fatal);
    return;
  }

  try {
    await game.load((p, gltf) => {
      el.loadFill.style.width = `${Math.round(p * 100)}%`;
      el.loadTip.textContent = `正在装载 3D 模型… ${Math.round(p * 100)}%`;
    });
  } catch (err) {
    console.error(err);
    el.loadTip.textContent = '模型加载失败，请检查网络后刷新重试';
    return;
  }

  el.loadFill.style.width = '100%';
  el.loadTip.textContent = '准备就绪！';

  // 进入标题
  hide(el.loading);
  show(el.title);
  game.showcase('robot');
  requestAnimationFrame(() => game._fitHeroDistance());
  window.__NEON__ = game; // 便于调试

  // 后台预载士兵模型
  game.loadExtra('soldier').then(() => {
    soldierReady = true;
    const card = document.querySelector('.char-card[data-char="soldier"] .char-tag');
    if (card) card.textContent = '就绪';
  });

  requestAnimationFrame(loop);
}

function loop() {
  game.update();
  game.render();
  requestAnimationFrame(loop);
}

/* ---------- HUD ---------- */
function renderHud(h) {
  el.score.textContent = h.score;
  el.dist.textContent = `${h.dist} m`;
  el.ducks.textContent = h.ducks;
  el.dangerFill.style.width = `${Math.round(h.danger * 100)}%`;
  el.dangerWrap.classList.toggle('alert', h.danger > 0.66);
}

function handleEvent(ev) {
  if (ev.type === 'sfx') { sfx[ev.name] && sfx[ev.name](); return; }
  if (ev.type === 'toast') { toast(ev.text); return; }
  if (ev.type === 'shake') {
    document.getElementById('app').animate?.(
      [{ filter: 'saturate(1.6) brightness(1.25)' }, { filter: 'none' }],
      { duration: 260 }
    );
    return;
  }
  if (ev.type === 'duck') {
    sfx.duck();
    el.pop.textContent = '+10';
    el.pop.classList.remove('show');
    void el.pop.offsetWidth;
    el.pop.classList.add('show');
  }
}

function handleGameOver(r) {
  const isBest = r.score > best;
  if (isBest) {
    best = r.score;
    localStorage.setItem(BEST_KEY, String(best));
  }
  el.overTitle.textContent = r.reason;
  el.overReason.textContent = isBest ? '新纪录！' : '再来一次，一定能跑更远';
  el.overScore.textContent = r.score;
  el.overDist.textContent = `${r.distance} m`;
  el.overDucks.textContent = r.ducks;
  el.overBest.textContent = best;
  el.best.textContent = best;
  show(el.over);
  hide(el.hud);
  hide(el.touchPad);
}

/* ---------- 交互 ---------- */
$$('.char-card').forEach((card) => {
  card.addEventListener('click', () => {
    const id = card.dataset.char;
    if (id === 'soldier' && !soldierReady) {
      toast('士兵模型加载中…');
      return;
    }
    $$('.char-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
    selectedChar = id;
    sfx.select();
    game.showcase(id);
  });
});

$('#btn-start').addEventListener('click', () => {
  sfx.unlock(); sfx.start();
  hide(el.title); hide(el.over); hide(el.pause);
  toggleHelp(false);
  show(el.hud);
  if (isTouchDevice()) show(el.touchPad);
  game.start(selectedChar);
  flashRunHint();
});

$('#btn-again').addEventListener('click', () => {
  sfx.start();
  hide(el.over);
  show(el.hud);
  if (isTouchDevice()) show(el.touchPad);
  game.start(selectedChar);
  flashRunHint();
});

$('#btn-home').addEventListener('click', () => {
  hide(el.over); hide(el.hud); hide(el.touchPad);
  el.runHint.classList.remove('show');
  toggleHelp(false);
  show(el.title);
  game.showcase(selectedChar);
  requestAnimationFrame(() => game._fitHeroDistance());
});

$('#btn-resume').addEventListener('click', () => game.resume());
$('#btn-quit').addEventListener('click', () => {
  hide(el.pause);
  game.state = 'title';
  hide(el.hud); hide(el.touchPad);
  el.runHint.classList.remove('show');
  toggleHelp(false);
  show(el.title);
  game.showcase(selectedChar);
  requestAnimationFrame(() => game._fitHeroDistance());
});
$('#btn-pause').addEventListener('click', () => game.pause());

// 音效开关
let soundOn = localStorage.getItem(SOUND_KEY) !== '0';
sfx.setEnabled(soundOn);
el.sound.classList.toggle('muted', !soundOn);
el.sound.addEventListener('click', () => {
  soundOn = !soundOn;
  sfx.setEnabled(soundOn);
  localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0');
  el.sound.classList.toggle('muted', !soundOn);
  if (soundOn) sfx.select();
});

// 失焦自动暂停
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && game.state === 'playing') game.pause();
});

function isTouchDevice() {
  return matchMedia('(hover: none) and (pointer: coarse)').matches || 'ontouchstart' in window;
}

boot();
