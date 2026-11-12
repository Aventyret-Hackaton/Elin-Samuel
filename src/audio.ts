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

/** Tangentklick (kort brusknäpp). */
export function keyClick() {
  const c = ensureAudio();
  const n = c.createBufferSource();
  n.buffer = noiseBuffer(c, 0.06);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200 + Math.random() * 900;
  bp.Q.value = 1.4;
  const g = c.createGain();
  g.gain.setValueAtTime(0.2, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.045);
  n.connect(bp).connect(g).connect(c.destination);
  n.start();
  n.stop(c.currentTime + 0.06);
}

/** Persienn som dras upp: skramlande knäppar som blir tätare. */
export function rattle(dur = 2.6) {
  const c = ensureAudio();
  const t0 = c.currentTime + 0.02;
  let t = 0;
  let gap = 0.12;
  while (t < dur) {
    const n = c.createBufferSource();
    n.buffer = noiseBuffer(c, 0.04);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 + Math.random() * 1400;
    bp.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.13, t0 + t);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.035);
    n.connect(bp).connect(g).connect(c.destination);
    n.start(t0 + t);
    n.stop(t0 + t + 0.05);
    t += gap;
    gap = Math.max(0.028, gap * 0.94);
  }
}

/**
 * Bil som kör förbi på blöt gata utanför: däckväs, dovt motorljud, dopplereffekt och panorering vänster -> höger.
 * Synkas med bilens ljuskägla (som är starkast mitt i svepet). Dämpat, som genom en källarvägg, och lite olika varje gång.
 * Spelas bara om ljudet redan är upplåst (boot-gaten), så inget AudioContext skapas utan användargest.
 */
export function carPass(dur = 5) {
  if (!ctx || ctx.state !== 'running') return;
  const c = ctx;
  const t0 = c.currentTime + 0.05;
  const mid = t0 + dur * 0.5;
  const end = t0 + dur;
  const vary = 0.85 + Math.random() * 0.3; // olika bilar: tonhöjd och styrka

  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.16 * vary, mid); // närmast mitt i svepet
  out.gain.exponentialRampToValueAtTime(0.0001, end);
  const pan = c.createStereoPanner();
  pan.pan.setValueAtTime(-0.85, t0);
  pan.pan.linearRampToValueAtTime(0.85, end);
  // Väggen: mörkare ljud långt bort, ljusare när bilen är som närmast
  const wall = c.createBiquadFilter();
  wall.type = 'lowpass';
  wall.frequency.setValueAtTime(700, t0);
  wall.frequency.exponentialRampToValueAtTime(2600, mid);
  wall.frequency.exponentialRampToValueAtTime(600, end);
  out.connect(wall).connect(pan).connect(c.destination);

  // Däck mot blöt asfalt: brus i ett band som glider nedåt när bilen passerat (doppler)
  const hiss = c.createBufferSource();
  hiss.buffer = noiseBuffer(c, dur + 0.3);
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.7;
  band.frequency.setValueAtTime(1500 * vary, t0);
  band.frequency.linearRampToValueAtTime(1700 * vary, mid - 0.15);
  band.frequency.exponentialRampToValueAtTime(950 * vary, mid + 0.35);
  band.frequency.linearRampToValueAtTime(800 * vary, end);
  const hg = c.createGain();
  hg.gain.value = 1.0;
  hiss.connect(band).connect(hg).connect(out);
  hiss.start(t0);
  hiss.stop(end + 0.1);

  // Motor: två lågt filtrerade sågtänder som glider ned över passagen
  for (const [f, v] of [[46, 0.5], [92, 0.25]] as const) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 1.07 * vary, t0);
    o.frequency.linearRampToValueAtTime(f * 1.05 * vary, mid - 0.2);
    o.frequency.exponentialRampToValueAtTime(f * 0.93 * vary, mid + 0.4);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const og = c.createGain();
    og.gain.value = v;
    o.connect(lp).connect(og).connect(out);
    o.start(t0);
    o.stop(end + 0.1);
  }
  // Lågt rummel från vägen
  const rumble = c.createBufferSource();
  rumble.buffer = noiseBuffer(c, dur + 0.3);
  const rl = c.createBiquadFilter();
  rl.type = 'lowpass';
  rl.frequency.value = 120;
  const rg = c.createGain();
  rg.gain.value = 1.4;
  rumble.connect(rl).connect(rg).connect(out);
  rumble.start(t0);
  rumble.stop(end + 0.1);
}

// ---------- Vinstfanfar i 8-bitarsstil ----------
// Egen komposition (I–IV–V–I i C-dur), inte en kopia av någon spelmelodi. NES-känsla: pulsvåg 50 % och 25 %,
// triangelvåg i basen, raka toner med kort attack och tvärt slut.
const HZ: Record<string, number> = {
  C3: 130.81, F3: 174.61, G3: 196.0,
  G4: 392.0, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51,
};

let pulse25: PeriodicWave | null = null;
function pulseWave(c: AudioContext, duty: number): PeriodicWave {
  const n = 32;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return c.createPeriodicWave(re, im);
}

function chipNote(
  c: AudioContext,
  out: AudioNode,
  freq: number,
  start: number,
  dur: number,
  vol: number,
  kind: 'square' | 'pulse25' | 'triangle',
  vibrato = false,
) {
  const o = c.createOscillator();
  if (kind === 'pulse25') o.setPeriodicWave((pulse25 ??= pulseWave(c, 0.25)));
  else o.type = kind;
  o.frequency.setValueAtTime(freq, start);
  if (vibrato) {
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = 6;
    depth.gain.setValueAtTime(0, start);
    depth.gain.linearRampToValueAtTime(freq * 0.012, start + 0.25);
    lfo.connect(depth).connect(o.frequency);
    lfo.start(start);
    lfo.stop(start + dur + 0.05);
  }
  const g = c.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.006);
  g.gain.setValueAtTime(vol, start + dur - 0.03);
  g.gain.linearRampToValueAtTime(0, start + dur);
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/** "Banan klarad": snabb arpeggio uppåt, två ackordstötar och ett hållet slutackord. ~2,3 s. */
export function victoryFanfare() {
  const c = ensureAudio();
  const out = c.createGain();
  out.gain.value = 0.085;
  out.connect(c.destination);
  const t0 = c.currentTime + 0.03;
  const s = 0.075; // en sextondel
  // Arpeggio uppåt
  ['G4', 'C5', 'E5', 'G5', 'C6'].forEach((n, i) => chipNote(c, out, HZ[n], t0 + i * s, s * (i === 4 ? 3 : 0.95), 1, 'square'));
  chipNote(c, out, HZ.C3, t0, s * 5, 0.9, 'triangle');
  // Stötar: IV och V
  const stab = (at: number, lead: string, harm: string[], bass: string) => {
    chipNote(c, out, HZ[lead], at, s * 1.8, 1, 'square');
    harm.forEach((h) => chipNote(c, out, HZ[h], at, s * 1.8, 0.55, 'pulse25'));
    chipNote(c, out, HZ[bass], at, s * 1.8, 0.9, 'triangle');
  };
  stab(t0 + s * 8, 'C6', ['F5', 'A5'], 'F3');
  stab(t0 + s * 11, 'D6', ['G5', 'B5'], 'G3');
  // Slutackord, hållet med vibrato
  const end = t0 + s * 14;
  chipNote(c, out, HZ.E6, end, 1.05, 1, 'square', true);
  ['C5', 'E5', 'G5'].forEach((h) => chipNote(c, out, HZ[h], end, 1.05, 0.5, 'pulse25'));
  chipNote(c, out, HZ.C3, end, 1.05, 0.9, 'triangle');
}

// ---------- Lysrör som tänds ----------

/** Tändarens klick: ett kort metalliskt tick, en liten ping och ett dovt dunk från drosseln. */
export function tubeClick(strength = 1) {
  const c = ensureAudio();
  const t = c.currentTime + 0.005;
  const out = c.createGain();
  out.gain.value = 0.22 * strength;
  out.connect(c.destination);
  // tick
  const n = c.createBufferSource();
  n.buffer = noiseBuffer(c, 0.02);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const ng = c.createGain();
  ng.gain.setValueAtTime(1, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
  n.connect(hp).connect(ng).connect(out);
  n.start(t);
  n.stop(t + 0.02);
  // ping (metall i armaturen) och dunk (drosseln)
  for (const [f, v, d] of [[3300 + Math.random() * 400, 0.25, 0.05], [110, 0.9, 0.04]] as const) {
    const o = c.createOscillator();
    o.frequency.value = f;
    const og = c.createGain();
    og.gain.setValueAtTime(v, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + d + 0.01);
  }
}

/**
 * Lysrörssurr: brum på 100 Hz (dubbla nätfrekvensen, 50 Hz i Sverige) med övertoner och ett svagt knaster.
 * Startar med ett kort uppsving när röret tänder och lägger sig sedan lågt. Returnerar stopp-funktion.
 */
export function tubeBuzz(): () => void {
  const c = ensureAudio();
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.06, t + 0.04); // tändningen
  out.gain.exponentialRampToValueAtTime(0.022, t + 0.6); // sedan lågt och jämnt
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  out.connect(lp).connect(c.destination);
  const nodes: AudioScheduledSourceNode[] = [];
  for (const [f, v, type] of [[100, 0.6, 'sawtooth'], [200, 0.25, 'square'], [300, 0.12, 'sine']] as const) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const og = c.createGain();
    og.gain.value = v;
    o.connect(og).connect(out);
    o.start(t);
    nodes.push(o);
  }
  // Lätt fladder i brummet
  const lfo = c.createOscillator();
  const depth = c.createGain();
  lfo.frequency.value = 0.8;
  depth.gain.value = 0.004;
  lfo.connect(depth).connect(out.gain);
  lfo.start(t);
  nodes.push(lfo);
  // Knaster: svaga, glesa elektriska sprak
  let alive = true;
  const crackle = () => {
    if (!alive) return;
    const now = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = noiseBuffer(c, 0.015);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4000 + Math.random() * 3000;
    const sg = c.createGain();
    sg.gain.setValueAtTime(0.004 + Math.random() * 0.006, now);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.01);
    s.connect(bp).connect(sg).connect(c.destination);
    s.start(now);
    s.stop(now + 0.015);
    setTimeout(crackle, 300 + Math.random() * 1500);
  };
  setTimeout(crackle, 400);
  return () => {
    alive = false;
    out.gain.cancelScheduledValues(c.currentTime);
    out.gain.setTargetAtTime(0.0001, c.currentTime, 0.1);
    setTimeout(() => nodes.forEach((x) => x.stop()), 600);
  };
}
