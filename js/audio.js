// Einfacher gezupfter Gitarrenklang (Karplus-Strong), ohne Samples.
let ctx = null;
let master = null;
const cache = new Map();
export const sound = { enabled: true };

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function pluckBuffer(midi) {
  if (cache.has(midi)) return cache.get(midi);
  const sr = ctx.sampleRate;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const dur = 2.2;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  // Die Mittelung im Filter verzögert um eine halbe Probe, daher period - 0.5
  const N = Math.max(2, Math.round(sr / freq - 0.5));
  const ring = new Float32Array(N);
  // Anschlag: gefiltertes Rauschen, etwas weicher für tiefe Saiten
  let last = 0;
  const soft = midi < 52 ? 0.5 : 0.65;
  for (let i = 0; i < N; i++) {
    last += soft * (Math.random() * 2 - 1 - last);
    ring[i] = last;
  }
  const decay = midi < 52 ? 0.9985 : 0.997;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const a = ring[idx];
    const nxt = idx + 1 === N ? 0 : idx + 1;
    ring[idx] = decay * 0.5 * (a + ring[nxt]);
    out[i] = a * 0.8;
    idx = nxt;
  }
  // sanftes Ein- und Ausblenden
  const fadeIn = Math.floor(sr * 0.002);
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  const fadeOut = Math.floor(sr * 0.3);
  for (let i = 0; i < fadeOut; i++) out[len - 1 - i] *= i / fadeOut;
  cache.set(midi, buf);
  return buf;
}

export function playMidi(midi, when = 0, gain = 1) {
  if (!sound.enabled) return;
  const c = ensure();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = pluckBuffer(midi);
  const g = c.createGain();
  g.gain.value = gain;
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3800;
  src.connect(tone).connect(g).connect(master);
  src.start(c.currentTime + when);
}

export function playSequence(midis, step = 0.45) {
  midis.forEach((m, i) => playMidi(m, i * step));
}

// Kurzer, leiser Hinweiston für Fehler
export function playError() {
  if (!sound.enabled) return;
  const c = ensure();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(220, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(150, c.currentTime + 0.18);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.18, c.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.22);
  o.connect(g).connect(master);
  o.start();
  o.stop(c.currentTime + 0.25);
}
