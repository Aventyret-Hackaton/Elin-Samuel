// Hämtar statistik för alla repon i GitHub-organisationen och skriver public/data/github.json.
// Token (valfri, höjer rate limit): GITHUB_TOKEN eller inloggad `gh` (hämtas med `gh auth token`).
// Tokenen skrivs aldrig till disk eller output. Misslyckas hämtningen lämnas befintlig github.json orörd.
//   node scripts/fetch-github.mjs            (alla repon)
//   GITHUB_EXCLUDE=Elin-Samuel,hackaton node scripts/fetch-github.mjs
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORG = process.env.GITHUB_ORG ?? 'Aventyret-Hackaton';
const EXCLUDE = new Set((process.env.GITHUB_EXCLUDE ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'data', 'github.json');

let token = process.env.GITHUB_TOKEN ?? '';
if (!token) {
  try {
    token = execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    /* anonym: 60 anrop/timme */
  }
}
const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

async function api(path) {
  const res = await fetch(path.startsWith('http') ? path : `https://api.github.com${path}`, { headers });
  return res;
}

async function paginate(path) {
  const items = [];
  let url = `https://api.github.com${path}${path.includes('?') ? '&' : '?'}per_page=100`;
  while (url) {
    const res = await api(url);
    if (res.status === 409 || res.status === 404) return items; // tomt repo
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    items.push(...(await res.json()));
    const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '');
    url = next ? next[1] : null;
    if (items.length > 5000) break;
  }
  return items;
}

async function contributorStats(repo) {
  for (let i = 0; i < 5; i++) {
    const res = await api(`/repos/${ORG}/${repo}/stats/contributors`);
    if (res.status === 200) return res.json();
    if (res.status !== 202) return [];
    await new Promise((r) => setTimeout(r, 2000));
  }
  return [];
}

try {
  const repos = (await paginate(`/orgs/${ORG}/repos?type=all`)).filter((r) => !EXCLUDE.has(r.name.toLowerCase()));
  const perRepo = [];
  const contributors = new Map();
  const languages = new Map();
  const hourly = new Map();

  for (const r of repos) {
    const [commits, pulls, langs, cstats] = await Promise.all([
      paginate(`/repos/${ORG}/${r.name}/commits`),
      paginate(`/repos/${ORG}/${r.name}/pulls?state=all`),
      api(`/repos/${ORG}/${r.name}/languages`).then((x) => (x.ok ? x.json() : {})),
      contributorStats(r.name),
    ]);
    const people = new Set();
    for (const c of commits) {
      const who = c.author?.login ?? c.commit?.author?.name ?? 'okänd';
      people.add(who);
      contributors.set(who, (contributors.get(who) ?? 0) + 1);
      const d = new Date(c.commit.author.date);
      d.setUTCMinutes(0, 0, 0);
      hourly.set(d.toISOString(), (hourly.get(d.toISOString()) ?? 0) + 1);
    }
    for (const [l, b] of Object.entries(langs)) languages.set(l, (languages.get(l) ?? 0) + b);
    const additions = cstats.reduce((s, c) => s + c.weeks.reduce((a, w) => a + w.a, 0), 0);
    const deletions = cstats.reduce((s, c) => s + c.weeks.reduce((a, w) => a + w.d, 0), 0);
    perRepo.push({
      name: r.name,
      language: r.language ?? null,
      commits: commits.length,
      pull_requests: pulls.length,
      merged_pull_requests: pulls.filter((p) => p.merged_at).length,
      contributors: people.size,
      additions,
      deletions,
      pushed_at: r.pushed_at,
    });
    console.log(`[github] ${r.name}: ${commits.length} commits, ${pulls.length} PR, ${people.size} personer`);
  }

  perRepo.sort((a, b) => b.commits - a.commits);

  // Tidslinje per timme (Europe/Stockholm-etiketter), fylld utan luckor
  const keys = [...hourly.keys()].sort();
  const timeline = [];
  if (keys.length) {
    const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });
    const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit' });
    const multiDay = new Date(keys.at(-1)) - new Date(keys[0]) > 36 * 3600 * 1000;
    let cum = 0;
    for (let t = new Date(keys[0]).getTime(); t <= new Date(keys.at(-1)).getTime(); t += 3600 * 1000) {
      const iso = new Date(t).toISOString();
      const n = hourly.get(iso) ?? 0;
      cum += n;
      timeline.push({ t: iso, label: (multiDay ? dayFmt : fmt).format(new Date(t)), commits: n, cumulative: cum });
    }
  }

  const langTotal = [...languages.values()].reduce((a, b) => a + b, 0) || 1;
  const sortedLangs = [...languages.entries()].sort((a, b) => b[1] - a[1]);
  const top = sortedLangs.slice(0, 6).map(([name, bytes]) => ({ name, bytes, share: bytes / langTotal }));
  const rest = sortedLangs.slice(6).reduce((s, [, b]) => s + b, 0);
  if (rest) top.push({ name: 'annat', bytes: rest, share: rest / langTotal });

  const data = {
    org: ORG,
    generatedAt: new Date().toISOString(),
    totals: {
      repos: perRepo.length,
      commits: perRepo.reduce((s, r) => s + r.commits, 0),
      pull_requests: perRepo.reduce((s, r) => s + r.pull_requests, 0),
      contributors: contributors.size,
      additions: perRepo.reduce((s, r) => s + r.additions, 0),
      deletions: perRepo.reduce((s, r) => s + r.deletions, 0),
    },
    repos: perRepo,
    timeline,
    languages: top,
    topContributors: [...contributors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([login, commits]) => ({ login, commits })),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
  console.log(`[github] skrev ${out.replace(root + '/', '')}: ${data.totals.repos} repon, ${data.totals.commits} commits`);
} catch (e) {
  console.warn(`[github] kunde inte hämta data (${e.message}). ${existsSync(out) ? 'Befintlig github.json behålls.' : 'github.json saknas.'}`);
}
