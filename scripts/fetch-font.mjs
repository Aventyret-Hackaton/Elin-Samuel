// Hämtar Replica LL Regular (woff2) från aventyret.se till public/fonts/ om den saknas.
// Filen committas aldrig (gitignorerad): typsnittet är licensierat, repot är publikt.
// Samma filväg som aventyret.se själva använder: /fonts/replica-ll/ReplicaLLWeb-Regular.woff2
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'fonts');
const dest = join(dir, 'ReplicaLLWeb-Regular.woff2');
const SRC = process.env.REPLICA_FONT_URL ?? 'https://www.aventyret.se/fonts/replica-ll/ReplicaLLWeb-Regular.woff2';

if (existsSync(dest)) process.exit(0);

try {
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error('svaret är inte en woff2-fil');
  mkdirSync(dir, { recursive: true });
  writeFileSync(dest, buf);
  console.log(`[font] hämtade Replica LL Regular (${Math.round(buf.length / 1024)} kB) från ${SRC}`);
} catch (e) {
  console.warn(`[font] kunde inte hämta ${SRC}: ${e.message}`);
  console.warn('[font] sajten faller tillbaka på lokalt installerad Replica LL, annars systemtypsnitt.');
}
