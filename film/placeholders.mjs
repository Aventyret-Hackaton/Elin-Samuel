// Tillfälliga scenklipp (12 s, 1920x1080, 24 fps) så att hela filmen kan renderas innan de riktiga klippen finns.
// De riktiga AI-klippen läggs som film/clips/scene-1.mp4 ... scene-5.mp4 (12 s vardera) och ersätter dessa.
// Skapar bara klipp som saknas.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const clips = join(dirname(fileURLToPath(import.meta.url)), 'clips');
mkdirSync(clips, { recursive: true });

// Färgat gradientunderlag + rörligt testmönster (så att övergångarna har något att vrida på)
const scenes = {
  1: { g: 'c0=0xff7a1a:c1=0x3a1250:c2=0xffd08a:c3=0x0a0e2a', speed: 0.09, hue: 20 }, // stridsflyg, solnedgång
  2: { g: 'c0=0x0b3a4a:c1=0x2fd4e0:c2=0x0a1020:c3=0x7a2cff', speed: 0.07, hue: 180 }, // ubåt, fantasilandskap
  3: { g: 'c0=0x050510:c1=0x3a1a7a:c2=0x0a0a20:c3=0xff3d7f', speed: 0.05, hue: 280 }, // rymden
  4: { g: 'c0=0x6b4a2a:c1=0xc9b48a:c2=0x2a1d12:c3=0x8a6a3a', speed: 0.06, hue: 35 }, // medeltiden
  5: { g: 'c0=0xffffff:c1=0x000000:c2=0x808080:c3=0x202020', speed: 0.12, hue: 0, gray: true }, // 30-tals svartvit tecknad
};

for (const [n, s] of Object.entries(scenes)) {
  const file = join(clips, `scene-${n}.mp4`);
  if (existsSync(file)) continue;
  const fc =
    `[0:v]format=gbrp,hue=h=${s.hue}:s=0.55[a];[1:v]format=gbrp[b];[a][b]blend=all_mode=overlay,` +
    `noise=c0s=4:c0f=t,vignette=PI/4${s.gray ? ',format=gray,eq=contrast=1.25' : ''},format=yuv420p[o]`;
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=24:d=12',
      '-f', 'lavfi', '-i', `gradients=s=1920x1080:r=24:d=12:${s.g}:nb_colors=4:speed=${s.speed}`,
      '-filter_complex', fc, '-map', '[o]', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', file],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) process.exit(1);
  console.log(`[film] platshållare scene-${n}.mp4`);
}
