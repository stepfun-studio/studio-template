/**
 * 极简 WebAudio 音效合成器（不依赖任何外部音频文件）
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  /** 必须在用户手势中调用一次 */
  unlock() {
    this._ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.3;
    this.master.connect(this.ctx.destination);
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.unlock();
  }

  _tone({ freq = 440, to = null, dur = 0.14, type = 'square', vol = 0.5, delay = 0 }) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  _noise({ dur = 0.25, vol = 0.4, freq = 900, q = 1, delay = 0 }) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  jump()   { this._tone({ freq: 320, to: 760, dur: 0.16, type: 'square', vol: 0.35 }); }
  jump2()  { this._tone({ freq: 620, to: 1180, dur: 0.14, type: 'square', vol: 0.32 });
             this._tone({ freq: 940, to: 1500, dur: 0.1, type: 'triangle', vol: 0.22, delay: 0.04 }); }
  slide()  { this._noise({ dur: 0.3, vol: 0.28, freq: 1500 }); }
  duck()   { this._tone({ freq: 880, dur: 0.07, type: 'triangle', vol: 0.4 });
             this._tone({ freq: 1320, dur: 0.1, type: 'triangle', vol: 0.35, delay: 0.06 }); }
  hit()    { this._noise({ dur: 0.4, vol: 0.55, freq: 500, q: 0.7 });
             this._tone({ freq: 180, to: 60, dur: 0.35, type: 'sawtooth', vol: 0.3 }); }
  lane()   { this._tone({ freq: 520, dur: 0.05, type: 'sine', vol: 0.18 }); }
  select() { this._tone({ freq: 660, to: 990, dur: 0.09, type: 'sine', vol: 0.3 }); }
  start()  { [523, 659, 784, 1046].forEach((f, i) => this._tone({ freq: f, dur: 0.12, type: 'square', vol: 0.3, delay: i * 0.08 })); }
  over()   { [660, 550, 440, 330, 220].forEach((f, i) => this._tone({ freq: f, dur: 0.22, type: 'sawtooth', vol: 0.28, delay: i * 0.13 })); }
  milestone() { [784, 988, 1318].forEach((f, i) => this._tone({ freq: f, dur: 0.1, type: 'triangle', vol: 0.25, delay: i * 0.06 })); }
}
