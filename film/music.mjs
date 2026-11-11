// Syntetiserar ett bombastiskt filmmusikstycke (55 s, d-moll, 120 bpm) utan externa bibliotek.
// Trummor (taiko/kick), brassackord, stråk-ostinato, kör, risers och cymbalsmällar vid varje scenbyte (11/22/33/44 s).
// Skriver film/out/music-dry.wav. render.mjs lägger på efterbehandling (eko, kompressor, limiter) med ffmpeg.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });

const SR = 44100;
const SEC = 11; // sekunder per scen (5 scener)
const DUR = SEC * 5 + 0.5;
const N = Math.floor(SR * DUR);
const L = new Float32Array(N);
const R = new Float32Array(N);
let seed = 11;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const BEAT = 0.5;

/** Lägger in en mono-signal från sample-index i båda kanalerna med panorering (-1..1). */
function mix(startSec, sig, gain = 1, pan = 0) {
  const s0 = Math.floor(startSec * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < sig.length && s0 + i < N; i++) {
    L[s0 + i] += sig[i] * gl;
    R[s0 + i] += sig[i] * gr;
  }
}

const buf = (sec) => new Float32Array(Math.floor(sec * SR));

function kick(vel = 1) {
  const s = buf(0.7);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const f = 38 + 130 * Math.exp(-t * 22);
    ph += (2 * Math.PI * f) / SR;
    s[i] = (Math.sin(ph) * Math.exp(-t * 6.5) + rnd() * 0.35 * Math.exp(-t * 90)) * vel;
  }
  return s;
}

/** Taiko/boom: djup, lång, med brus-slag. */
function boom(vel = 1, len = 2.4) {
  const s = buf(len);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (30 + 70 * Math.exp(-t * 9))) / SR;
    lp += (rnd() - lp) * 0.04;
    s[i] = (Math.sin(ph) * Math.exp(-t * 1.6) + lp * 1.2 * Math.exp(-t * 7) + rnd() * 0.25 * Math.exp(-t * 60)) * vel;
  }
  return s;
}

function crash(vel = 1, len = 2.2) {
  const s = buf(len);
  let prev = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const n = rnd();
    const hp = n - prev * 0.92; // enkel högpass
    prev = n;
    s[i] = hp * Math.exp(-t * 2.2) * vel * 0.55;
  }
  return s;
}

/** Riser: brus + sinus som sveper uppåt och sväller. */
function riser(len = 1.0, vel = 1) {
  const s = buf(len);
  let ph = 0;
  let prev = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const k = t / len;
    ph += (2 * Math.PI * (180 + 2600 * k * k)) / SR;
    const n = rnd();
    const hp = n - prev * (0.6 + 0.35 * k);
    prev = n;
    s[i] = (Math.sin(ph) * 0.35 + hp * 0.5) * k * k * vel;
  }
  return s;
}

/** Brass: detunerade sågtand genom svepande lågpass. */
function brass(midi, len, vel = 1) {
  const s = buf(len);
  const notes = [midi, midi + 7, midi + 12, midi + 19];
  const phases = notes.map(() => [0, 0, 0]);
  let lp = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    let v = 0;
    notes.forEach((m, k) => {
      const f = mtof(m);
      for (let d = 0; d < 3; d++) {
        phases[k][d] = (phases[k][d] + (f * (1 + (d - 1) * 0.004)) / SR) % 1;
        v += (phases[k][d] * 2 - 1) * (k === 0 ? 1 : 0.6);
      }
    });
    const cutoff = 0.04 + 0.28 * Math.min(1, t / 0.5) * (0.6 + 0.4 * Math.sin(t * 1.3));
    lp += (v - lp) * cutoff;
    const env = Math.min(1, t / 0.06) * (0.55 + 0.45 * Math.exp(-t * 2.2)) * Math.min(1, (len - t) / 0.25);
    s[i] = lp * env * vel * 0.16;
  }
  return s;
}

/** Stråk-ostinato: korta sågtandsnoter, åttondelar. */
function pluck(midi, vel = 1) {
  const s = buf(0.28);
  let ph = 0;
  let ph2 = 0;
  let lp = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph = (ph + mtof(midi) / SR) % 1;
    ph2 = (ph2 + (mtof(midi) * 1.006) / SR) % 1;
    lp += ((ph + ph2) * 2 - 2 - lp) * 0.3;
    s[i] = lp * Math.exp(-t * 11) * Math.min(1, t / 0.004) * vel * 0.22;
  }
  return s;
}

/** Kör: stora långsamma ackord med vibrato. */
function choir(midis, len, vel = 1) {
  const s = buf(len);
  midis.forEach((m, k) => {
    let ph = 0;
    for (let i = 0; i < s.length; i++) {
      const t = i / SR;
      const f = mtof(m) * (1 + 0.004 * Math.sin(2 * Math.PI * (5.2 + k * 0.3) * t + k));
      ph += (2 * Math.PI * f) / SR;
      const env = Math.min(1, t / 1.2) * Math.min(1, (len - t) / 0.8);
      s[i] += (Math.sin(ph) * 0.6 + Math.sin(ph * 2) * 0.25 + Math.sin(ph * 3) * 0.12) * env * vel * 0.07;
    }
  });
  return s;
}

// ---- Arrangemang: 5 sektioner à 5 s ----
const roots = [38, 34, 36, 33, 38]; // D, Bb, C, A, D
const chords = [
  [62, 65, 69],
  [58, 62, 65],
  [60, 64, 67],
  [57, 61, 64],
  [62, 65, 69, 74],
];

for (let sec = 0; sec < 5; sec++) {
  const t0 = sec * SEC;
  const root = roots[sec];
  const energy = [0.7, 0.85, 0.95, 1.05, 1.2][sec];

  // Brass: starkt ackord i varje sektion
  mix(t0 - 0.05, brass(root, SEC + 0.2, energy), 1, -0.15);
  mix(t0 - 0.05, brass(root + 12, SEC + 0.2, energy * 0.7), 1, 0.2);

  // Trummor
  for (let b = 0; b < SEC * 2; b++) {
    const t = t0 + b * BEAT;
    const accent = b % 2 === 0 ? 1 : 0.7;
    mix(t, kick(accent * energy), 1.1, 0);
    if (sec >= 1) mix(t + BEAT / 2, kick(0.5 * energy), 0.8, 0);
    if (sec >= 3 && b >= SEC * 2 - 4) {
      mix(t + BEAT / 4, kick(0.4 * energy), 0.7, -0.2);
      mix(t + (3 * BEAT) / 4, kick(0.4 * energy), 0.7, 0.2);
    }
  }
  if (sec >= 2) for (let b = 0; b < SEC * 2; b += 4) mix(t0 + b * BEAT, boom(0.7 * energy, 1.6), 0.9, 0.1);

  // Stråk-ostinato från sektion 1
  if (sec >= 1) {
    const pat = [0, 12, 7, 12, 0, 12, 10, 12];
    for (let k = 0; k < SEC * 4; k++) mix(t0 + k * (BEAT / 2), pluck(root + 24 + pat[k % 8] - 12, 0.55 + energy * 0.35), 1, k % 2 ? 0.4 : -0.4);
  }

  // Kör från sektion 2
  if (sec >= 2) mix(t0, choir(chords[sec], SEC + 0.2, energy), 1, 0);

  // Scenbyte: riser före, cymbal + boom på själva bytet
  if (sec > 0) {
    mix(t0 - 1.0, riser(1.0, 0.9), 0.8, 0);
    mix(t0, crash(1), 1, 0.1);
    mix(t0, boom(1.0, 2.0), 1.1, 0);
  }
}
// Öppning: kort riser in i första slaget
mix(0, boom(1.0, 2.2), 1, 0);
mix(0, crash(0.7), 1, -0.1);
// Final: stor slutsmäll på 24 s som ringer ut
const END = SEC * 5;
mix(END - 1, boom(1.2, 1.5), 1.2, 0);
mix(END - 1, crash(1.2, 1.5), 1, 0);
mix(END - 2, riser(1.0, 1.0), 0.9, 0);

// Normalisera och skriv 16-bit WAV
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = 0.89 / (peak || 1);
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * g * 32767))), i * 4);
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * g * 32767))), i * 4 + 2);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0);
hdr.writeUInt32LE(36 + data.length, 4);
hdr.write('WAVEfmt ', 8);
hdr.writeUInt32LE(16, 16);
hdr.writeUInt16LE(1, 20);
hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(SR, 24);
hdr.writeUInt32LE(SR * 4, 28);
hdr.writeUInt16LE(4, 32);
hdr.writeUInt16LE(16, 34);
hdr.write('data', 36);
hdr.writeUInt32LE(data.length, 40);
writeFileSync(join(out, 'music-dry.wav'), Buffer.concat([hdr, data]));
console.log(`[music] skrev film/out/music-dry.wav (${DUR} s, topp före normalisering ${peak.toFixed(2)})`);
