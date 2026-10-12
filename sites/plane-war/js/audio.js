/* ============ 音频：WebAudio 音效 + TTS 语音包 ============ */

const VOICE_LINES = {
  vo_start: { text: '系统启动完成，战机准备就绪，出发啦！' },
  vo_wave: { text: '警告，新一批敌机正在接近，提高警戒。' },
  vo_lock: { text: '目标已锁定。' },
  vo_missile: { text: '导弹发射！' },
  vo_kill: { text: '干得漂亮！' },
  vo_combo: { text: '连续击落，你太厉害啦！' },
  vo_hit: { text: '机体中弹，注意规避！' },
  vo_warn: { text: '警告，敌方导弹正在接近，立即机动！' },
  vo_lowhp: { text: '警告，机体严重受损，情况危急！' },
  vo_supply: { text: '补给获取，继续加油！' },
  vo_boss: { text: '检测到大型敌机，建议使用导弹攻击。' },
  vo_over: { text: '任务失败，战机坠毁。' },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.buffers = {};
    this.onSubtitle = null;
    this._subTimer = 0;
    this.engine = null;
    this._noiseBuf = null;
    this._lastVoice = {};
  }

  async init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.ready = true; return; }
    this.ctx = new AC();
    // 不等待 resume：无用户手势时它会一直挂起，避免卡住加载流程
    this.ctx.resume().catch(() => {});
    this._bindGestureResume();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.master);

    this.voiceGain = this.ctx.createGain();
    this.voiceGain.gain.value = 1.0;
    this.voiceGain.connect(this.master);

    // 噪声缓冲
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;

    // 加载语音包
    const names = Object.keys(VOICE_LINES);
    await Promise.all(names.map((n) => this._loadVoice(n)));
    this.ready = true;
  }

  /** 首次用户手势时恢复被浏览器挂起的 AudioContext */
  _bindGestureResume() {
    const kick = () => {
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
      window.removeEventListener('touchstart', kick);
    };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
    window.addEventListener('touchstart', kick);
  }

  /** 在用户手势中调用，确保音频立刻可用 */
  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  _loadVoice(name) {
    return new Promise((resolve) => {
      fetch(`./audio/${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((ab) => this.ctx.decodeAudioData(ab))
        .then((buf) => { this.buffers[name] = buf; })
        .catch(() => { /* 语音缺失时静默 */ })
        .finally(resolve);
    });
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  /* ---------- 语音 ---------- */
  playVoice(name, force = false) {
    if (!this.ready || this.muted) return;
    const now = this.ctx.currentTime;
    if (!force && this._lastVoice[name] && now - this._lastVoice[name] < 0.6) return;
    this._lastVoice[name] = now;
    const buf = this.buffers[name];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 1;
    src.connect(g).connect(this.voiceGain);
    src.start();
    if (this.onSubtitle) {
      const line = VOICE_LINES[name];
      this.onSubtitle(line ? line.text : '', buf.duration + 0.1);
    }
  }

  /* ---------- 音效 ---------- */
  _env(node, t0, a, d, peak) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  _noise(t0, dur, freq, q, peak, type = 'lowpass') {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this._env(g, t0, 0.008, dur, peak);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.08);
  }

  _tone(t0, f0, f1, dur, peak, type = 'square') {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = this.ctx.createGain();
    this._env(g, t0, 0.005, dur, peak);
    o.connect(g).connect(this.sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  gun() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this._tone(t, 1400, 320, 0.09, 0.16, 'square');
    this._noise(t, 0.07, 5200, 1, 0.1, 'highpass');
  }

  enemyGun() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this._tone(t, 620, 180, 0.12, 0.07, 'sawtooth');
  }

  hit() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this._tone(t, 240, 90, 0.14, 0.22, 'square');
    this._noise(t, 0.16, 1800, 1, 0.24);
  }

  explosion(size = 1) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const d = 0.5 * size;
    this._noise(t, d, 1400 * size, 0.8, 0.5, 'lowpass');
    this._tone(t, 150 * size, 40, d * 0.9, 0.4, 'sine');
  }

  lockBeep(locked = false) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this._tone(t, locked ? 1250 : 880, locked ? 1250 : 880, 0.07, 0.13, 'sine');
  }

  missileLaunch() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.7, 700, 1.2, 0.32, 'bandpass');
    this._tone(t, 180, 900, 0.5, 0.1, 'sawtooth');
  }

  pickup() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this._tone(t, 700, 1400, 0.12, 0.16, 'sine');
    this._tone(t + 0.09, 1050, 1750, 0.14, 0.14, 'sine');
  }

  alarm() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this._tone(t, 880, 880, 0.11, 0.14, 'square');
    this._tone(t + 0.14, 660, 660, 0.11, 0.14, 'square');
  }

  ui() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this._tone(t, 500, 900, 0.09, 0.12, 'triangle');
  }

  /* ---------- 引擎轰鸣 ---------- */
  startEngine() {
    if (!this.ready || this.engine) return;
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 58;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 87;
    const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = 29;
    const nz = ctx.createBufferSource(); nz.buffer = this._noiseBuf; nz.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 3;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 7.5;
    const lfoG = ctx.createGain(); lfoG.gain.value = 26;
    lfo.connect(lfoG).connect(o1.frequency);

    o1.connect(g); o2.connect(g); o3.connect(g);
    const nzG = ctx.createGain(); nzG.gain.value = 0.5;
    nz.connect(lp).connect(nzG).connect(g);
    g.connect(this.master);
    o1.start(); o2.start(); o3.start(); nz.start(); lfo.start();
    g.gain.exponentialRampToValueAtTime(0.075, ctx.currentTime + 1.2);
    this.engine = { o1, o2, o3, nz, g, lp };
  }

  updateEngine(speedRatio, boost, throttle) {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 46 + speedRatio * 34 + (boost ? 16 : 0);
    this.engine.o1.frequency.setTargetAtTime(base, t, 0.15);
    this.engine.o2.frequency.setTargetAtTime(base * 1.51, t, 0.15);
    this.engine.o3.frequency.setTargetAtTime(base * 0.5, t, 0.2);
    this.engine.lp.frequency.setTargetAtTime(300 + speedRatio * 620 + (boost ? 400 : 0), t, 0.2);
    this.engine.g.gain.setTargetAtTime(0.05 + speedRatio * 0.055 + (boost ? 0.03 : 0), t, 0.25);
  }

  stopEngine() {
    if (!this.engine) return;
    const e = this.engine;
    const t = this.ctx.currentTime;
    e.g.gain.cancelScheduledValues(t);
    e.g.gain.setTargetAtTime(0.0001, t, 0.25);
    setTimeout(() => {
      try { e.o1.stop(); e.o2.stop(); e.o3.stop(); e.nz.stop(); } catch (err) { /* noop */ }
    }, 900);
    this.engine = null;
  }

  /* ---------- 字幕 ---------- */
  tickSubtitles(dt) {
    if (this._subTimer > 0) {
      this._subTimer -= dt;
      if (this._subTimer <= 0 && this.onSubtitle) this.onSubtitle('', 0);
    }
  }
}

export const VOICE_META = VOICE_LINES;
