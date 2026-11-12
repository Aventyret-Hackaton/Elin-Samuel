// Hämtar statistik för alla repon i GitHub-organisationen och skriver public/data/github.json.
// Token (valfri, höjer rate limit): GITHUB_TOKEN eller inloggad `gh` (hämtas med `gh auth token`).
// Tokenen skrivs aldrig till disk eller output. Misslyckas hämtningen lämnas befintlig github.json orörd.
//   node scripts/fetch-github.mjs            (alla repon)
//   GITHUB_EXCLUDE=vinnarmaskinen,hackaton node scripts/fetch-github.mjs
//
// Utdata: totals (repon, commits, PR, bidragsgivare, rader), peakHour, topRepo, repos[], timeline[],
// languages[] (med antal repon per språk) och stacks[] (teknikstackar som hittas i filer som package.json,
// requirements.txt, Dockerfile osv, med antal repon per teknik).
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

async function api(path, extra = {}) {
  return fetch(path.startsWith('http') ? path : `https://api.github.com${path}`, { headers: { ...headers, ...extra } });
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

// ---------- Teknikstackar ----------
// Paketnamn (npm) -> visningsnamn. Bara tekniker som säger något om stacken.
const NPM = {
  react: 'react', 'react-dom': 'react', next: 'next.js', vue: 'vue', nuxt: 'nuxt', svelte: 'svelte', '@sveltejs/kit': 'sveltekit',
  astro: 'astro', '@remix-run/react': 'remix', vite: 'vite', webpack: 'webpack', parcel: 'parcel', esbuild: 'esbuild',
  three: 'three.js', gsap: 'gsap', 'chart.js': 'chart.js', d3: 'd3', 'p5': 'p5.js', phaser: 'phaser', 'pixi.js': 'pixi.js',
  'matter-js': 'matter.js', howler: 'howler', tone: 'tone.js', express: 'express', fastify: 'fastify', koa: 'koa', hono: 'hono',
  '@nestjs/core': 'nestjs', 'socket.io': 'socket.io', ws: 'websockets', tailwindcss: 'tailwind css', sass: 'sass', 'styled-components': 'styled components',
  typescript: 'typescript', electron: 'electron', 'react-native': 'react native', expo: 'expo', firebase: 'firebase',
  '@supabase/supabase-js': 'supabase', prisma: 'prisma', '@prisma/client': 'prisma', mongoose: 'mongodb', mongodb: 'mongodb', pg: 'postgres',
  openai: 'openai api', '@anthropic-ai/sdk': 'claude api', '@google/generative-ai': 'gemini api', langchain: 'langchain',
  zustand: 'zustand', redux: 'redux', '@reduxjs/toolkit': 'redux', jest: 'jest', vitest: 'vitest', playwright: 'playwright',
  'framer-motion': 'framer motion', 'react-three-fiber': 'react three fiber', '@react-three/fiber': 'react three fiber',
};
const PY = {
  flask: 'flask', django: 'django', fastapi: 'fastapi', numpy: 'numpy', pandas: 'pandas', torch: 'pytorch', tensorflow: 'tensorflow',
  openai: 'openai api', anthropic: 'claude api', streamlit: 'streamlit', pygame: 'pygame', requests: 'requests', opencv: 'opencv',
};

async function detectStack(repo) {
  const techs = new Set();
  const pkgNames = new Set();
  const tr = await api(`/repos/${ORG}/${repo}/git/trees/HEAD?recursive=1`);
  if (!tr.ok) return { techs: [], files: 0, sourceFiles: 0, pkgNames: [] };
  const { tree = [] } = await tr.json();
  const paths = tree.filter((x) => x.type === 'blob').map((x) => x.path).filter((p) => !/(^|\/)node_modules\//.test(p));
  const files = paths.filter((p) => !/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.DS_Store)$/.test(p)).length;
  const sourceFiles = paths.filter((p) => /\.(tsx?|jsx?|mjs|cjs|html|css|scss|py|rs|go|php|rb|swift|java|kt|sh|vue|svelte)$/i.test(p)).length;
  const has = (re) => paths.some((p) => re.test(p));
  if (has(/(^|\/)(Dockerfile|docker-compose\.ya?ml)$/i)) techs.add('docker');
  if (has(/^\.github\/workflows\//)) techs.add('github actions');
  if (has(/(^|\/)go\.mod$/)) techs.add('go');
  if (has(/(^|\/)Cargo\.toml$/)) techs.add('rust');
  if (has(/(^|\/)composer\.json$/)) techs.add('php');
  if (has(/(^|\/)Gemfile$/)) techs.add('ruby');
  if (has(/(^|\/)(index|main)\.html$/) && !has(/(^|\/)package\.json$/)) techs.add('html/css/js');

  const raw = async (path) => {
    const r = await api(`/repos/${ORG}/${repo}/contents/${encodeURI(path)}`, { Accept: 'application/vnd.github.raw+json' });
    return r.ok ? r.text() : '';
  };
  const pkgs = paths.filter((p) => /(^|\/)package\.json$/.test(p)).sort((a, b) => a.split('/').length - b.split('/').length).slice(0, 3);
  for (const p of pkgs) {
    try {
      const j = JSON.parse(await raw(p));
      const deps = { ...j.dependencies, ...j.devDependencies };
      techs.add('node.js');
      for (const name of Object.keys(deps)) pkgNames.add(name);
      for (const [name, label] of Object.entries(NPM)) if (name in deps) techs.add(label);
    } catch {
      /* ogiltig package.json */
    }
  }
  const pyFiles = paths.filter((p) => /(^|\/)(requirements[^/]*\.txt|pyproject\.toml)$/.test(p)).slice(0, 2);
  for (const p of pyFiles) {
    const txt = (await raw(p)).toLowerCase();
    techs.add('python');
    for (const [name, label] of Object.entries(PY)) if (new RegExp(`(^|[^a-z0-9_-])${name}([^a-z0-9_-]|$)`, 'm').test(txt)) techs.add(label);
  }
  return { techs: [...techs].sort(), files, sourceFiles, pkgNames: [...pkgNames] };
}

try {
  const repos = (await paginate(`/orgs/${ORG}/repos?type=all`)).filter((r) => !EXCLUDE.has(r.name.toLowerCase()));
  const perRepo = [];
  const contributors = new Map();
  const languages = new Map();
  const langRepos = new Map();
  const stackRepos = new Map();
  const hourly = new Map();
  const npmPackages = new Set();
  let files = 0;
  let sourceFiles = 0;
  let aiCommits = 0;
  const AI = /co-authored-by:[^\n]*(claude|copilot|chatgpt|openai|gemini|cursor|codex)/i;

  for (const r of repos) {
    const [commits, pulls, langs, cstats, det] = await Promise.all([
      paginate(`/repos/${ORG}/${r.name}/commits`),
      paginate(`/repos/${ORG}/${r.name}/pulls?state=all`),
      api(`/repos/${ORG}/${r.name}/languages`).then((x) => (x.ok ? x.json() : {})),
      contributorStats(r.name),
      detectStack(r.name).catch(() => ({ techs: [], files: 0, sourceFiles: 0, pkgNames: [] })),
    ]);
    const stack = det.techs;
    files += det.files;
    sourceFiles += det.sourceFiles;
    for (const n of det.pkgNames) npmPackages.add(n);
    const people = new Set();
    for (const c of commits) {
      if (AI.test(c.commit?.message ?? '')) aiCommits++;
      const who = c.author?.login ?? c.commit?.author?.name ?? 'okänd';
      people.add(who);
      contributors.set(who, (contributors.get(who) ?? 0) + 1);
      const d = new Date(c.commit.author.date);
      d.setUTCMinutes(0, 0, 0);
      hourly.set(d.toISOString(), (hourly.get(d.toISOString()) ?? 0) + 1);
    }
    for (const [l, b] of Object.entries(langs)) {
      languages.set(l, (languages.get(l) ?? 0) + b);
      langRepos.set(l, (langRepos.get(l) ?? 0) + 1);
    }
    for (const s of stack) stackRepos.set(s, (stackRepos.get(s) ?? 0) + 1);
    const additions = cstats.reduce((s, c) => s + c.weeks.reduce((a, w) => a + w.a, 0), 0);
    const deletions = cstats.reduce((s, c) => s + c.weeks.reduce((a, w) => a + w.d, 0), 0);
    perRepo.push({
      name: r.name,
      language: r.language ?? null,
      languages: Object.keys(langs),
      stack,
      commits: commits.length,
      pull_requests: pulls.length,
      merged_pull_requests: pulls.filter((p) => p.merged_at).length,
      contributors: people.size,
      additions,
      deletions,
      pushed_at: r.pushed_at,
    });
    console.log(`[github] ${r.name}: ${commits.length} commits, ${pulls.length} PR, ${people.size} personer, stack: ${stack.join(', ') || '-'}`);
  }

  perRepo.sort((a, b) => b.commits - a.commits);

  // Tidslinje per timme (Europe/Stockholm-etiketter), fylld utan luckor
  const keys = [...hourly.keys()].sort();
  const timeline = [];
  let peak = null;
  if (keys.length) {
    const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });
    const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit' });
    const multiDay = new Date(keys.at(-1)) - new Date(keys[0]) > 36 * 3600 * 1000;
    let cum = 0;
    for (let t = new Date(keys[0]).getTime(); t <= new Date(keys.at(-1)).getTime(); t += 3600 * 1000) {
      const iso = new Date(t).toISOString();
      const n = hourly.get(iso) ?? 0;
      cum += n;
      const label = (multiDay ? dayFmt : fmt).format(new Date(t));
      timeline.push({ t: iso, label, commits: n, cumulative: cum });
      if (!peak || n > peak.commits) peak = { commits: n, label };
    }
  }

  const langTotal = [...languages.values()].reduce((a, b) => a + b, 0) || 1;
  const sortedLangs = [...languages.entries()].sort((a, b) => b[1] - a[1]);
  const top = sortedLangs.slice(0, 7).map(([name, bytes]) => ({ name, bytes, share: bytes / langTotal, repos: langRepos.get(name) ?? 0 }));
  const rest = sortedLangs.slice(7).reduce((s, [, b]) => s + b, 0);
  if (rest) top.push({ name: 'annat', bytes: rest, share: rest / langTotal, repos: 0 });

  const stacks = [...stackRepos.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, repos]) => ({ name, repos }));

  const data = {
    org: ORG,
    generatedAt: new Date().toISOString(),
    totals: {
      repos: perRepo.length,
      commits: perRepo.reduce((s, r) => s + r.commits, 0),
      pull_requests: perRepo.reduce((s, r) => s + r.pull_requests, 0),
      merged_pull_requests: perRepo.reduce((s, r) => s + r.merged_pull_requests, 0),
      contributors: contributors.size,
      additions: perRepo.reduce((s, r) => s + r.additions, 0),
      deletions: perRepo.reduce((s, r) => s + r.deletions, 0),
      languages: languages.size,
      files,
      source_files: sourceFiles,
      npm_packages: npmPackages.size,
      ai_commits: aiCommits,
    },
    peakHour: peak,
    topRepo: perRepo[0] ? { name: perRepo[0].name, commits: perRepo[0].commits } : null,
    repos: perRepo,
    timeline,
    languages: top,
    stacks,
    topContributors: [...contributors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([login, commits]) => ({ login, commits })),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
  console.log(`[github] skrev ${out.replace(root + '/', '')}: ${data.totals.repos} repon, ${data.totals.commits} commits, ${stacks.length} tekniker`);
} catch (e) {
  console.warn(`[github] kunde inte hämta data (${e.message}). ${existsSync(out) ? 'Befintlig github.json behålls.' : 'github.json saknas.'}`);
}
