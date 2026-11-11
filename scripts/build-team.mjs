// Bygger `team` i public/data/stats.json från bildfilerna i public/team/.
// Rör aldrig bilderna (bara filnamn läses). Namn härleds ur filnamnet:
//   samuel-brynolf.jpg -> "Samuel Brynolf". Redan inskrivna namn för samma fil behålls,
//   så manuella rättelser (å/ä/ö, titlar) överlever en ny körning.
// Finns inga bilder lämnas stats.json orörd.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const teamDir = join(root, 'public', 'team');
const statsPath = join(root, 'public', 'data', 'stats.json');
const IMG = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

if (!existsSync(teamDir)) {
  console.log('[team] public/team/ saknas, ingen ändring.');
  process.exit(0);
}

const files = readdirSync(teamDir)
  .filter((f) => IMG.has(extname(f).toLowerCase()) && !f.startsWith('.'))
  .sort((a, b) => a.localeCompare(b, 'sv'));

if (files.length === 0) {
  console.log('[team] inga bilder i public/team/, stats.json lämnas orörd.');
  process.exit(0);
}

const stats = JSON.parse(readFileSync(statsPath, 'utf8'));
const known = new Map((stats.team ?? []).filter((m) => m.photo).map((m) => [m.photo, m.name]));

// Namn ur filnamn: allt från "_cyber" och framåt är filtersuffix. Delar med siffror (mars2022, 02, 1-1)
// är versionsmärken och tas bort. "maria_boix_grau_aventyret-1_cyber_magenta-teal.jpg" -> "Maria Boix Grau".
const nameFromFile = (f) => {
  const base = basename(f, extname(f)).split(/_cyber(?:_|$)/i)[0];
  const words = base
    .split('_')
    .filter((t) => t && !/\d/.test(t))
    .join(' ')
    .replace(/-+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toLocaleUpperCase('sv') + w.slice(1));
  return words.join(' ') || basename(f, extname(f));
};

stats.team = files.map((f) => ({ name: known.get(f) ?? nameFromFile(f), photo: f }));
writeFileSync(statsPath, JSON.stringify(stats, null, 2) + '\n');
console.log(`[team] ${files.length} personer skrivna till public/data/stats.json:`);
for (const m of stats.team) console.log(`  - ${m.name} (${m.photo})`);
