// Renderar kampanjfilmen (55 s) av fem scenklipp + musik + profilbilder.
//
//   node film/render.mjs              renderar film/out/film.mp4
//   node film/render.mjs --install    kopierar dessutom resultatet till public/media/video.mp4
//   node film/render.mjs --music      tvingar ny musik
//
// Indata:
//   film/clips/scene-1.mp4 ... scene-5.mp4   12 s (11 s scen + 1 s övergångsöverlapp), 1920x1080, 24 fps vardera (saknas de skapas platshållare)
//   public/data/team.json + public/team/*   profilbilderna (blixtrar förbi i övergångarna)
//
// Tidslinje: scen 1 (0-11 s) stridsflyg, 2 (11-22) ubåt/fantasi, 3 (22-33) rymden, 4 (33-44) medeltid, 5 (44-55) 30-tals tecknad.
// Mellan scenerna: 1 s trippig övergång (virvel, kalejdoskop, flytande, tunnel) med färgrotation, kromatisk skiftning
// och en blixtsnabb stroboskop av profilbilder. Inga nyckeltal i filmen: de läggs ovanpå av sajten (src/main.ts).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const F = dirname(fileURLToPath(import.meta.url));
const root = join(F, '..');
const out = join(F, 'out');
const tmp = join(out, 'tmp');
const clips = join(F, 'clips');
mkdirSync(tmp, { recursive: true });
const args = process.argv.slice(2);

const sh = (cmd, a) => {
  const r = spawnSync(cmd, a, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`[film] ${cmd} misslyckades`);
    process.exit(1);
  }
};
const ff = (a) => sh('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a]);

const FPS = 24;
const SCENE = 11; // sekunder per scen
const TOTAL = SCENE * 5; // 55 s
const T = 1.0; // övergångens längd
const CUTS = [1, 2, 3, 4].map((i) => SCENE * i); // scenbyten (mitten av övergången)

// ---------- 1. Scenklipp ----------
sh('node', [join(F, 'placeholders.mjs')]);

// ---------- 2. Musik ----------
const musicDry = join(out, 'music-dry.wav');
const music = join(out, 'music.wav');
if (!existsSync(music) || args.includes('--music')) {
  sh('node', [join(F, 'music.mjs')]);
  ff(['-i', musicDry, '-af', 'aecho=0.8:0.85:60|130|260:0.32|0.22|0.14,acompressor=threshold=-20dB:ratio=3:attack=15:release=250,alimiter=limit=0.93', '-ar', '44100', music]);
}

// ---------- 3. Profilbilder ----------
const team = JSON.parse(readFileSync(join(root, 'public', 'data', 'team.json'), 'utf8')).team.filter((m) => m.photo);
if (team.length === 0) {
  console.error('[film] inga profilbilder i public/data/team.json (kör npm run team)');
  process.exit(1);
}
const padded = team.map((m, i) => {
  const dst = join(tmp, `p${i}.png`);
  ff(['-i', join(root, 'public', 'team', m.photo), '-vf', 'scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,pad=1920:1080:420:0:black', '-frames:v', '1', dst]);
  return dst;
});
ff(['-f', 'lavfi', '-i', 'color=c=black:s=1920x1080', '-frames:v', '1', join(tmp, 'black.png')]);

// Stroboskop-spår: 8 profilbilder à 3 bildrutor i varje övergång, svart däremellan
const STROBE_FRAMES = 3;
const PER_CUT = 8;
let list = '';
let t = 0;
let photoIdx = 0;
const gap = (to) => {
  if (to - t > 0.001) list += `file '${join(tmp, 'black.png')}'\nduration ${(to - t).toFixed(4)}\n`;
  t = Math.max(t, to);
};
for (const c of CUTS) {
  gap(c - T / 2);
  for (let k = 0; k < PER_CUT; k++) {
    list += `file '${padded[photoIdx % padded.length]}'\nduration ${(STROBE_FRAMES / FPS).toFixed(4)}\n`;
    photoIdx++;
    t += STROBE_FRAMES / FPS;
  }
}
gap(TOTAL);
list += `file '${join(tmp, 'black.png')}'\n`; // concat kräver att sista filen upprepas
writeFileSync(join(tmp, 'strobe.txt'), list);
const strobe = join(out, 'strobe.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', join(tmp, 'strobe.txt'), '-vf', `fps=${FPS},format=yuv420p`, '-t', String(TOTAL), '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', strobe]);

// ---------- 4. Trippiga övergångar (xfade med egna uttryck) ----------
import { order, expr } from './transitions.mjs';

const fcParts = [];
for (let i = 0; i < 5; i++) fcParts.push(`[${i}:v]fps=${FPS},format=gbrp,setsar=1[v${i}]`);
let prev = 'v0';
CUTS.forEach((c, i) => {
  const next = `x${i + 1}`;
  fcParts.push(`[${prev}][v${i + 1}]xfade=transition=custom:duration=${T}:offset=${c - T / 2}:expr='${expr(order[i])}'[${next}]`);
  prev = next;
});

// Färg- och kamerafx under övergångarna: färgrotation, mättnad, kromatisk skiftning. Därefter korn, vinjett, gradering.
const win = (a) => CUTS.map((c) => `between(t,${c - T / 2},${c + T / 2})`).join('+');
const phase = CUTS.map((c) => `between(t,${c - T / 2},${c + T / 2})*(t-${c - T / 2})`).join('+');
const strobeHue = CUTS.map((c) => `between(t,${c - T / 2},${c + T / 2})*(t-${c - T / 2})`).join('+');
fcParts.push(
  `[${prev}]format=yuv444p,hue=h='360*3*(${phase})':s='1+1.2*(${win()})',chromashift=cbh=-14:crh=14:cbv=6:crv=-6:enable='${win()}',` +
    `noise=c0s=5:c0f=t,vignette=PI/5,colorbalance=rs=.06:bs=-.05:rh=.04:bh=-.03,format=yuv420p[g]`,
);
fcParts.push(`[5:v]format=yuv420p,hue=h='360*4*(${strobeHue})':s=1.5,format=gbrp[st]`);
fcParts.push(`[g]format=gbrp[g2]`);
fcParts.push(`[g2][st]blend=all_mode=screen[s]`);
fcParts.push(`[s]format=yuv420p[o]`);
fcParts.push(`[6:a]afade=t=out:st=${TOTAL - 0.5}:d=0.5[a]`);
const script = join(tmp, 'filter.txt');
writeFileSync(script, fcParts.join(';\n'));

const film = join(out, 'film.mp4');
console.log('[film] renderar (xfade-uttrycken är långsamma, räkna med några minuter) ...');
ff([
  ...[1, 2, 3, 4, 5].flatMap((n) => ['-i', join(clips, `scene-${n}.mp4`)]),
  '-i', strobe,
  '-i', music,
  '-/filter_complex', script,
  '-map', '[o]', '-map', '[a]',
  '-t', String(TOTAL),
  '-c:v', 'libx264', '-profile:v', 'high', '-crf', '30', '-maxrate', '3M', '-bufsize', '6M', '-preset', 'slow', // liten fil: ~10 MB för 55 s (repot är publikt, filmen versioneras i git) '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '112k',
  '-movflags', '+faststart',
  film,
]);

const mb = (statSync(film).size / 1048576).toFixed(1);
console.log(`[film] klart: film/out/film.mp4 (${mb} MB, ${TOTAL} s)`);
if (args.includes('--install')) {
  copyFileSync(film, join(root, 'public', 'media', 'video.mp4'));
  console.log('[film] kopierad till public/media/video.mp4');
}
