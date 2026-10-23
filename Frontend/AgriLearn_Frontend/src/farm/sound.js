let ctx = null;
let unlocked = false;
let muted = false;

// Browsers only allow audio after the first click
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => { unlocked = true; }, { once: true });
}

function ac() {
  if (!unlocked || muted) return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, dur, { to = freq, type = "sine", vol = 0.15, delay = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.2, freq = 1200, q = 0.8, type = "bandpass", delay = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export const sfx = {
  chop() {
    noise(0.12, { vol: 0.25, freq: 2200, q: 0.6 });
    tone(140, 0.12, { to: 60, type: "triangle", vol: 0.2 });
  },
  dig() {
    noise(0.22, { vol: 0.22, freq: 500, q: 0.7, type: "lowpass" });
    tone(90, 0.18, { to: 50, vol: 0.15 });
  },
  plant() {
    tone(300, 0.1, { to: 600, vol: 0.12 });
    tone(450, 0.12, { to: 900, vol: 0.1, delay: 0.08 });
  },
  ding() {
    tone(880, 0.5, { vol: 0.14 });
    tone(1320, 0.6, { vol: 0.1, delay: 0.1 });
  },
  whoosh() {
    noise(0.4, { vol: 0.1, freq: 900, q: 0.4 });
  },
  tick() {
    tone(1200, 0.04, { to: 900, vol: 0.04 });
  },
};

export const setMuted = (m) => { muted = m; };
export const isMuted = () => muted;