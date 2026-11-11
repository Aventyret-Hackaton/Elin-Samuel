// Allt ljud syntetiseras med WebAudio. AudioContext skapas först vid användargest (boot-gate).
let ctx: AudioContext | null = null;

export function ensureAudio(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const DTMF: Record<string, [number, number]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '0': [941, 1336],
};

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export const MODEM_DURATION = 8.4;

/** 90-tals modem: uppringning (DTMF), svarston, handskakning, brus. ~8,4 s. */
export function playModem(): { duration: number; stop: () => void } {
  const c = ensureAudio();
  const master = c.createGain();
  master.gain.value = 0.55;
  master.connect(c.destination);
  const t0 = c.currentTime + 0.15;
  const stops: Array<() => void> = [];

  const tone = (freqs: number[], start: number, dur: number, gain: number, type: OscillatorType = 'sine') => {
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0 + start);
    g.gain.linearRampToValueAtTime(gain, t0 + start + 0.006);
    g.gain.setValueAtTime(gain, t0 + start + dur - 0.006);
    g.gain.linearRampToValueAtTime(0, t0 + start + dur);
    g.connect(master);
    for (const f of freqs) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.connect(g);
      o.start(t0 + start);
      o.stop(t0 + start + dur + 0.02);
    }
  };

  // Lur upp: kort klick
  tone([1200], 0.0, 0.015, 0.2, 'square');

  // Uppringning
  const digits = '5551234';
  digits.split('').forEach((d, i) => tone(DTMF[d], 0.35 + i * 0.2, 0.1, 0.16));

  // Svarston 2100 Hz
  tone([2100], 2.1, 0.7, 0.14);

  // Handskakning: slumpmässiga tonsteg (square genom lågpass)
  const rnd = seeded(1990);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2800;
  const hg = c.createGain();
  hg.gain.setValueAtTime(0, t0 + 2.8);
  hg.gain.linearRampToValueAtTime(0.11, t0 + 3.0);
  hg.gain.setValueAtTime(0.11, t0 + 6.6);
  hg.gain.linearRampToValueAtTime(0, t0 + 6.9);
  lp.connect(hg).connect(master);
  const hi = [1200, 1800, 2400, 980, 1650, 2100, 2250, 1380, 1500];
  const lo = [600, 900, 1200, 750, 1050];
  const o1 = c.createOscillator();
  o1.type = 'square';
  const o2 = c.createOscillator();
  o2.type = 'sawtooth';
  const g2 = c.createGain();
  g2.gain.value = 0.55;
  for (let t = 2.8; t < 6.9; t += 0.045 + rnd() * 0.05) o1.frequency.setValueAtTime(hi[Math.floor(rnd() * hi.length)], t0 + t);
  for (let t = 2.8; t < 6.9; t += 0.12 + rnd() * 0.1) o2.frequency.setValueAtTime(lo[Math.floor(rnd() * lo.length)], t0 + t);
  o1.connect(lp);
  o2.connect(g2).connect(lp);
  o1.start(t0 + 2.8); o1.stop(t0 + 7);
  o2.start(t0 + 2.8); o2.stop(t0 + 7);

  // Brus som växer och sedan dör ut
  const n = c.createBufferSource();
  n.buffer = noiseBuffer(c, 6);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.5;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0, t0 + 2.8);
  ng.gain.linearRampToValueAtTime(0.14, t0 + 6.8);
  ng.gain.linearRampToValueAtTime(0, t0 + MODEM_DURATION);
  n.connect(bp).connect(ng).connect(master);
  n.start(t0 + 2.8);
  n.stop(t0 + MODEM_DURATION + 0.1);

  return {
    duration: MODEM_DURATION,
    stop: () => {
      master.gain.cancelScheduledValues(c.currentTime);
      master.gain.setValueAtTime(master.gain.value, c.currentTime);
      master.gain.linearRampToValueAtTime(0, c.currentTime + 0.2);
      stops.forEach((s) => s());
    },
  };
}

/** Lågt CRT-/rumssurr. Returnerar stopp-funktion. */
export function playHum(): () => void {
  const c = ensureAudio();
  const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(0.5, c.currentTime + 3);
  g.connect(c.destination);
  const nodes: AudioScheduledSourceNode[] = [];
  for (const [f, v] of [[50, 0.03], [100, 0.015], [15734, 0.004]] as const) {
    const o = c.createOscillator();
    const og = c.createGain();
    o.frequency.value = f;
    og.gain.value = v;
    o.connect(og).connect(g);
    o.start();
    nodes.push(o);
  }
  const n = c.createBufferSource();
  n.buffer = noiseBuffer(c, 4);
  n.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  const ng = c.createGain();
  ng.gain.value = 0.02;
  n.connect(lp).connect(ng).connect(g);
  n.start();
  nodes.push(n);
  return () => {
    g.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
    setTimeout(() => nodes.forEach((x) => x.stop()), 600);
  };
}

export function blip(freq = 880, dur = 0.06, gain = 0.12) {
  const c = ensureAudio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

/** Svepande brus för övergångar. */
export function whoosh(dur = 1.2) {
  const c = ensureAudio();
  const n = c.createBufferSource();
  n.buffer = noiseBuffer(c, dur + 0.2);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(200, c.currentTime);
  bp.frequency.exponentialRampToValueAtTime(5000, c.currentTime + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(0.25, c.currentTime + dur * 0.6);
  g.gain.linearRampToValueAtTime(0, c.currentTime + dur);
  n.connect(bp).connect(g).connect(c.destination);
  n.start();
  n.stop(c.currentTime + dur + 0.1);
}
