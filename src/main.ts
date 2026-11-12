import './style.css';
import gsap from 'gsap';
import { Room } from './room';
import { PlateRoom } from './room-plate';
import type { PlateJson, RoomLike } from './room-types';
import { savePlateFile, startCalibrate, isCalibrateTarget } from './plate-tools';
import { CONFIG, BASE } from './config';
import { ensureAudio, playModem, playHum, blip, whoosh, keyClick } from './audio';
import { REVEAL } from './canvases';


type State = 'gate' | 'boot' | 'idle' | 'zoom' | 'prompt' | 'submit' | 'video' | 'loop' | 'choose' | 'reveal' | 'winner';

interface Team {
  team: { name: string; photo: string | null }[];
}
interface GitHubData {
  org: string;
  totals: Record<string, number>;
  peakHour: { commits: number; label: string } | null;
  languages: { name: string; bytes: number; share: number; repos: number }[];
  stacks: { name: string; repos: number }[];
}
interface Winner {
  name: string; // repots/projektets namn, visas på neonskylten
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

/** Kodrummet eller fotorummet (CONFIG.room, eller ?room=plate|code). Faller tillbaka på kodrummet utan plate.json. */
// ?plate=export visar kodrummets exporterade bilder (två-vy-läget) i stället för plate.json
const platePath = params.get('plate') === 'export' ? 'room/plate-export.json' : CONFIG.plate;

async function createRoom(canvas: HTMLCanvasElement): Promise<RoomLike> {
  const mode = params.get('room') ?? CONFIG.room;
  if (mode === 'plate' && !params.has('export')) {
    const plate = await loadJson<PlateJson>(platePath);
    if (plate?.desk?.screen) {
      const r = new PlateRoom(canvas, plate);
      r.load().catch((e) => console.error('[room] fotorummets bilder kunde inte laddas', e));
      return r;
    }
    console.warn('[room] plate.json saknas, använder kodrummet');
  }
  return new Room(canvas);
}

const room = await createRoom($<HTMLCanvasElement>('gl'));

// Utvecklarlägen för fotorummet: ?export=plate (rendera kodrummet som bilder), ?calibrate=screen|blinds|pane|sign|window
if (params.get('export') === 'plate' && room instanceof Room) {
  $('gate').classList.add('hidden');
  void document.fonts.ready.then(() => room.exportPlates(savePlateFile)).then((p) => console.log('[plate] export klar', p));
}
const calibrate = params.get('calibrate');
if (isCalibrateTarget(calibrate)) void startCalibrate(calibrate, platePath);
let state: State = 'gate';
let now = 0;
let stopHum: (() => void) | null = null;
let stopModem: (() => void) | null = null;
let bootTl: gsap.core.Timeline | null = null;
let team: Team['team'] = [];
let github: GitHubData | null = null;
let winner: Winner | null = null;
let hudTl: gsap.core.Timeline | null = null;

// ---------- Render-loop ----------
let last = performance.now();
function frame(t: number) {
  const dt = Math.min((t - last) / 1000, 0.1);
  last = t;
  now = t / 1000;
  room.update(dt, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Hjälpare ----------
function typeInto(el: HTMLElement, text: string, cps = 38) {
  const o = { n: 0 };
  return gsap.to(o, {
    n: text.length,
    duration: Math.max(0.2, text.length / cps),
    ease: 'none',
    onUpdate: () => {
      el.textContent = text.slice(0, Math.round(o.n));
    },
  });
}
const show = (el: HTMLElement, d = 0.5) => {
  el.classList.remove('hidden');
  gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: d });
};
const hide = (el: HTMLElement, d = 0.5) =>
  gsap.to(el, { opacity: 0, duration: d, onComplete: () => el.classList.add('hidden') });

async function loadJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(BASE + path);
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

function glitch(ms = 550) {
  const app = $('app');
  app.classList.remove('glitch');
  void app.offsetWidth;
  app.classList.add('glitch');
  gsap.fromTo($('flash'), { opacity: 0.85 }, { opacity: 0, duration: ms / 1000 });
  setTimeout(() => app.classList.remove('glitch'), ms);
}

// ---------- Scen 0/1: gate, modem, tänd-sekvens ----------
$('gateCmd').textContent = '';
typeInto($('gateCmd'), '> boot ' + CONFIG.bootName, 22);
$('gateBtn').addEventListener('click', (e) => {
  e.stopPropagation(); // annars bubblar klicket till #gate och hoppar över modemet direkt
  startBoot();
});
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'Enter' || e.key === ' ') {
    if (state === 'gate') startBoot();
    else if (state === 'boot') skipBoot();
  }
});
$('gate').addEventListener('click', () => {
  if (state === 'boot') skipBoot();
});

function startBoot() {
  if (state !== 'gate') return;
  state = 'boot';
  bootStartedAt = performance.now();
  ensureAudio();
  const modem = playModem();
  stopModem = modem.stop;
  $('gateBtn').classList.add('hidden');
  $('gateCmd').textContent = '> connecting';
  const log = $('gateLog');
  const lines: [number, string][] = [
    [0.4, 'atz\nok'],
    [0.8, 'atdt 555-1234'],
    [2.2, 'carrier detected'],
    [3.0, 'connect 56000/v90'],
    [4.2, 'handshake ............ ok'],
    [5.4, 'auth: guest ............ ok'],
    [6.6, 'ready.'],
  ];
  const tl = gsap.timeline();
  lines.forEach(([t, l]) => tl.call(() => { log.textContent += (log.textContent ? '\n' : '') + l; }, [], t));
  tl.call(() => { $('gateCmd').textContent = '> loading world'; }, [], 4.0);
  tl.call(lightUp, [], modem.duration - 1.0);
  bootTl = tl;
  const clk = $('gateClock');
  const t0 = performance.now();
  const iv = setInterval(() => {
    const s = (performance.now() - t0) / 1000;
    clk.textContent = `00:00:${String(Math.floor(s)).padStart(2, '0')}:${String(Math.floor((s % 1) * 24)).padStart(2, '0')}`;
    if (state !== 'boot') clearInterval(iv);
  }, 80);
}

let bootStartedAt = 0;
function skipBoot() {
  if (performance.now() - bootStartedAt < 1500) return; // skydd mot dubbelklick
  stopModem?.();
  bootTl?.timeScale(14);
}

let lit = false;
function lightUp() {
  if (lit) return;
  lit = true;
  room.setScreenState('idle', now);
  const tl = gsap.timeline();
  tl.to(room, { power: 1, duration: 0.1 })
    .to(room, { power: 0.15, duration: 0.09 })
    .to(room, { power: 1, duration: 0.14 })
    .to(room, { power: 0.5, duration: 0.07 })
    .to(room, { power: 1, duration: 0.35 })
    .to(room, { lit: 1, duration: 3.2, ease: 'power2.out' }, '>-0.1');
  gsap.to($('gate'), { opacity: 0, duration: 1.4, delay: 0.1, onComplete: () => $('gate').classList.add('hidden') });
  stopHum = playHum();
  gsap.delayedCall(3.4, () => { state = 'idle'; });
}

// ---------- Scen 1 -> 2: klick på datorrutan zoomar in, prompten tar emot text, enter startar filmen ----------
$('gl').addEventListener('click', (e) => {
  if (state === 'idle' && room.pointOnScreen(e.clientX, e.clientY)) goZoom();
});
window.addEventListener('pointermove', (e) => {
  $('gl').style.cursor = state === 'idle' && room.pointOnScreen(e.clientX, e.clientY) ? 'pointer' : 'default';
});

function goZoom() {
  if (state !== 'idle') return;
  state = 'zoom';
  blip(660, 0.08);
  whoosh(2.4);
  gsap.to(room, { zoom: 1, duration: 2.8, ease: 'power3.inOut', onComplete: () => { state = 'prompt'; } });
}

window.addEventListener('keydown', (e) => {
  if (state !== 'prompt' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    submitPrompt();
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    room.promptText = room.promptText.slice(0, -1);
    keyClick();
    room.refreshScreen(now);
  } else if (e.key.length === 1) {
    e.preventDefault();
    if (room.promptText.length < 70) {
      room.promptText += e.key.toLowerCase(); // inga versaler
      keyClick();
      room.refreshScreen(now);
    }
  }
});

function submitPrompt() {
  if (state !== 'prompt') return;
  state = 'submit';
  room.promptSubmitted = true;
  room.refreshScreen(now);
  blip(990, 0.08);
  stopHum?.();
  gsap.delayedCall(0.9, () => {
    whoosh(1.2);
    startVideo();
  });
}

// ---------- Scen 2: video -> loop + HUD ----------
function startVideo() {
  const layer = $('videoLayer');
  const v1 = $<HTMLVideoElement>('v1');
  const v2 = $<HTMLVideoElement>('v2');
  gsap.set(v2, { opacity: 0 });
  v1.src = BASE + CONFIG.media.video;
  v2.src = BASE + CONFIG.media.loop;
  layer.classList.remove('hidden');
  layer.style.opacity = '0';
  v1.currentTime = 0;
  const p = v1.play();
  if (p) p.catch(() => startLoop());
  v1.onended = startLoop;
  v1.onerror = () => startLoop();
  glitch(380);
  gsap.to(layer, { opacity: 1, duration: 0.45, onComplete: () => { room.paused = true; } });
  state = 'video';
  figIdx = -1;
  slides = github ? buildSlides(github) : [];
  trackFigures();
}

function startLoop() {
  if (state !== 'video') return;
  state = 'loop';
  hideFigure();
  const v1 = $<HTMLVideoElement>('v1');
  const v2 = $<HTMLVideoElement>('v2');
  v2.currentTime = 0;
  void v2.play().catch(() => undefined);
  gsap.to(v2, { opacity: 1, duration: 0.5, onComplete: () => v1.pause() });
  buildHud();
}

function hex(i: number) {
  return '0x' + (((i + 7) * 2654435761) >>> 0).toString(16).padStart(8, '0');
}

const nf = (n: number) => Math.round(n).toLocaleString('sv-SE');

// ---------- Nyckeltal ovanpå filmen ----------
// Arton stora rubriker, jämnt fördelade över filmens längd. Format: "coded in javascript / 6 / repositories".
// Antalet rubriker anpassar sig efter vilken data som finns. En av dem är ett internt skämt utan datatäckning.
interface Slide {
  kicker?: string; // t.ex. "coded in typescript"
  value: number;
  label: string;
}
let slides: Slide[] = [];
const STACK_SKIP = new Set(['node.js', 'typescript', 'docker', 'html/css/js']); // för generiskt eller dubblett av språk
const STACK_PRIORITY = ['claude api', 'openai api', 'rust', 'go', 'python', 'postgres', 'next.js', 'gsap', 'vitest', 'chart.js']; // roligare först vid lika antal
// "built with" som standard, men vissa tekniker har ett eget verb
const VERB: Record<string, string> = {
  'claude api': 'powered by', 'openai api': 'powered by', 'gemini api': 'powered by',
  'github actions': 'automated with', docker: 'containerised with',
  vitest: 'tested with', jest: 'tested with', playwright: 'tested with',
  postgres: 'stored in', mongodb: 'stored in', firebase: 'stored in', supabase: 'stored in',
  gsap: 'animated with', 'framer motion': 'animated with', 'three.js': 'rendered with', 'chart.js': 'charted with', d3: 'charted with',
  rust: 'written in', go: 'written in', python: 'written in', php: 'written in', ruby: 'written in',
};
const plural = (n: number) => (n === 1 ? 'repository' : 'repositories');
// Internt skämt: ingen data finns bakom, och det ska stå precis så här (i gemener enligt sajtens regel).
const JOKE: Slide = { kicker: 'coded in confetti', value: 1, label: 'repository' };

function buildSlides(g: GitHubData): Slide[] {
  const t = g.totals;
  const s: Slide[] = [
    { value: t.repos, label: 'repon' },
    { value: t.commits, label: 'commits' },
    { value: t.pull_requests, label: 'pull requests' },
    { value: t.contributors, label: 'vibekådare' },
    { value: t.additions, label: 'rader kod' },
    { value: t.files, label: 'filer i repona' },
  ];
  if (g.peakHour && g.peakHour.commits > 0) s.push({ value: g.peakHour.commits, label: `commits på en timme (kl ${g.peakHour.label})` });
  s.push({ value: t.npm_packages, label: 'unika npm-paket' });

  // Kodspråk: det vanligaste (antal repon), därefter typescript om det finns, annars näst vanligaste
  const langs = (g.languages ?? [])
    .filter((l) => l.name !== 'annat' && l.repos > 0)
    .sort((a, b) => b.repos - a.repos || b.bytes - a.bytes);
  const first = langs[0];
  const second = langs.find((l) => l !== first && l.name.toLowerCase() === 'typescript') ?? langs[1];
  const langSlide = (l: GitHubData['languages'][number]): Slide => ({ kicker: `coded in ${l.name.toLowerCase()}`, value: l.repos, label: plural(l.repos) });
  if (first) s.push(langSlide(first));
  s.push(JOKE); // direkt efter första riktiga "coded in", ungefär mitt i
  if (second) s.push(langSlide(second));

  // Teknikstackar: flest repon först, sedan de roligare
  const rank = (n: string) => (STACK_PRIORITY.includes(n) ? STACK_PRIORITY.indexOf(n) : 99);
  const stacks = (g.stacks ?? [])
    .filter((x) => !STACK_SKIP.has(x.name))
    .sort((a, b) => b.repos - a.repos || rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
    .slice(0, 6);
  for (const x of stacks) s.push({ kicker: `${VERB[x.name] ?? 'built with'} ${x.name}`, value: x.repos, label: plural(x.repos) });

  if (t.ai_commits > 0) s.push({ kicker: 'co-authored by ai', value: t.ai_commits, label: 'commits' });
  return s.filter((x) => x.value > 0);
}

let figIdx = -1;
let figRaf = 0;

function trackFigures() {
  cancelAnimationFrame(figRaf);
  const v1 = $<HTMLVideoElement>('v1');
  const tick = () => {
    if (state !== 'video') return;
    const d = v1.duration;
    if (slides.length && d > 0 && isFinite(d)) {
      const i = Math.min(slides.length - 1, Math.floor((v1.currentTime / d) * slides.length));
      if (i !== figIdx) showFigure(i, d / slides.length);
    }
    figRaf = requestAnimationFrame(tick);
  };
  figRaf = requestAnimationFrame(tick);
}

function showFigure(i: number, segSec: number) {
  figIdx = i;
  const el = $('figure');
  const sl = slides[i];
  const num = el.querySelector('.fn') as HTMLElement;
  (el.querySelector('.fk') as HTMLElement).textContent = sl.kicker ?? '';
  (el.querySelector('.fl') as HTMLElement).textContent = sl.label;
  num.textContent = '0';
  gsap.killTweensOf(el);
  el.classList.remove('hidden');
  gsap.fromTo(el, { opacity: 0, y: 40, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out' });
  const o = { v: 0 };
  gsap.to(o, { v: sl.value, duration: Math.min(1.6, segSec * 0.45), ease: 'power2.out', onUpdate: () => { num.textContent = nf(o.v); } });
  gsap.to(el, { opacity: 0, duration: 0.4, delay: Math.max(0.8, segSec - 0.8) });
}

function hideFigure() {
  cancelAnimationFrame(figRaf);
  figIdx = -1;
  const el = $('figure');
  gsap.killTweensOf(el);
  gsap.to(el, { opacity: 0, duration: 0.3, onComplete: () => el.classList.add('hidden') });
}

// ---------- Efter filmen: personerna (statistiken har redan visats i filmen) ----------
const GALLERY_SECONDS = 8; // så länge galleriet visas innan frågan "reveal winner?" tar över hela skärmen

function buildHud() {
  const hud = $('hud');
  hud.innerHTML = '';
  hudTl?.kill();

  const finalTitle = document.createElement('div');
  finalTitle.className = 'hud-final';
  hud.appendChild(finalTitle);

  // Foto-ring: korten är stora redan från start (renderas i slutstorlek, skarpa)
  const wrap = document.createElement('div');
  wrap.className = 'ring-wrap';
  const ring = document.createElement('div');
  ring.className = 'ring';
  wrap.appendChild(ring);
  const n = Math.max(team.length, 1);
  const cardW = Math.min(window.innerWidth * 0.09, 170);
  const bigW = Math.min(window.innerHeight * 0.58, 700);
  const s0 = cardW / bigW;
  const R = Math.max(260, (n * bigW * 1.12) / (2 * Math.PI));
  wrap.style.setProperty('--cw', `${bigW}px`);
  wrap.style.perspective = `${1400 / s0}px`;
  wrap.style.top = '47vh';
  team.forEach((m, i) => {
    const c = document.createElement('div');
    c.className = 'card';
    const ph = document.createElement('div');
    ph.className = 'ph' + (m.photo ? '' : ' ghost');
    if (m.photo) ph.style.backgroundImage = `url("${BASE}team/${encodeURIComponent(m.photo)}")`;
    c.appendChild(ph);
    c.insertAdjacentHTML('beforeend', `<span class="id">${hex(i)}</span><span class="jp">警告</span><span class="name">${m.name}</span>`);
    gsap.set(c, { transformOrigin: `50% 50% ${-R}px`, rotationY: (i * 360) / n });
    ring.appendChild(c);
  });
  gsap.set(ring, { transformOrigin: `0px 0px ${-R}px` });
  hud.appendChild(wrap);

  const tl = gsap.timeline({ delay: 0.3 });
  hudTl = tl;
  tl.from('.card', { opacity: 0, scale: 0.7, stagger: 0.04, duration: 0.6 }, 0);
  gsap.to(ring, { rotationY: '+=360', duration: 10, ease: 'none', repeat: -1 }); // 2,5x snabbare än förut (25 s/varv)
  // Rubriken över personerna. Antalet är antalet repon i organisationen (visas i gemener, enligt sajtens regel).
  const repoCount = github?.totals.repos ?? 0;
  const title = `${repoCount ? repoCount + ' ' : ''}meningslösa projekt. ett (1) mer onödigt än de andra. faktiskt.`;
  tl.add(typeInto(finalTitle, `> ${title}`, 30), 0.6);
  tl.call(showContinue, [], GALLERY_SECONDS);
}

// ---------- "reveal winner? [y] [n]" över hela skärmen, som boot-skärmen i scen 1 ----------
// Pilarna (eller y/n) väljer, enter bekräftar. y -> scen 3, n -> tillbaka till scen 1 (rummet).
let choice: 'y' | 'n' = 'n';

function renderChoice() {
  $('continueMain').innerHTML =
    `<span>&gt; reveal winner?</span>` +
    `<span class="opt${choice === 'y' ? ' sel' : ''}" data-c="y">[ y ]</span>` +
    `<span class="opt${choice === 'n' ? ' sel' : ''}" data-c="n">[ n ]</span><i class="cursor"></i>`;
}

function showContinue() {
  if (state !== 'loop') return;
  state = 'choose';
  choice = 'n';
  renderChoice();
  blip(440, 0.06);
  show($('continue'), 0.5);
}

function setChoice(c: 'y' | 'n') {
  if (c === choice) return;
  choice = c;
  blip(c === 'y' ? 760 : 520, 0.04);
  renderChoice();
}

$('continueMain').addEventListener('click', (e) => {
  if (state !== 'choose') return;
  const c = (e.target as HTMLElement).dataset.c;
  if (c === 'y' || c === 'n') setChoice(c);
});

window.addEventListener('keydown', (e) => {
  if (state !== 'choose') return;
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'ArrowUp') setChoice('y');
  else if (k === 'ArrowRight' || k === 'ArrowDown') setChoice('n');
  else if (k.toLowerCase() === 'y') setChoice('y');
  else if (k.toLowerCase() === 'n') setChoice('n');
  else if (k === 'Enter') {
    e.preventDefault();
    if (choice === 'y') goReveal();
    else backToRoom();
  } else return;
  e.preventDefault();
});

/** N: tillbaka till scen 1 (rummet), redo för ett nytt försök. */
function backToRoom() {
  if (state !== 'choose') return;
  state = 'reveal'; // upptaget under övergången
  blip(330, 0.08);
  whoosh(1.6);
  glitch(600);
  gsap.delayedCall(0.3, () => {
    hudTl?.kill();
    gsap.killTweensOf('.ring');
    $<HTMLVideoElement>('v1').pause();
    $<HTMLVideoElement>('v2').pause();
    gsap.set($('v2'), { opacity: 0 });
    $('videoLayer').classList.add('hidden');
    $('continue').classList.add('hidden');
    $('hud').innerHTML = '';
    room.promptText = '';
    room.promptSubmitted = false;
    room.restartScreen(now);
    room.paused = false;
    stopHum = playHum();
    gsap.to(room, { zoom: 0, duration: 2.6, ease: 'power3.inOut', onComplete: () => { state = 'idle'; } });
  });
}

// ---------- Scen 3: vinnarens reponamn rasslar fram som matrix-regn på skärmen, sedan åker kameran ut ----------
const winnerName = () => (winner?.name ?? '[repo-namn]').toLowerCase();

function goReveal() {
  if (state !== 'choose') return;
  state = 'reveal';
  blip(990, 0.08);
  whoosh(1.6);
  glitch(600);
  gsap.delayedCall(0.3, () => {
    hudTl?.kill();
    gsap.killTweensOf('.ring');
    $<HTMLVideoElement>('v1').pause();
    $<HTMLVideoElement>('v2').pause();
    $('videoLayer').classList.add('hidden');
    $('continue').classList.add('hidden');
    $('hud').innerHTML = '';
    // Kameran står kvar inzoomad på skärmen medan namnet avkodas
    gsap.set(room, { zoom: 1, power: 1 });
    room.paused = false;
    room.revealOnScreen(winnerName(), now);
    stopHum = playHum();
    // Rasslet: täta, oregelbundna tangentklick tills sista tecknet låst sig, ett pip när namnet står
    const clicks = { n: 0 };
    gsap.to(clicks, {
      n: 90,
      duration: REVEAL.lockedAt,
      ease: 'none',
      onUpdate: () => {
        if (Math.random() < 0.55) keyClick();
      },
    });
    gsap.delayedCall(REVEAL.lockedAt, () => blip(1320, 0.12));
    // Sedan åker kameran långsamt ut till rummet, så man ser datorn med namnet på skärmen
    gsap.to(room, {
      zoom: 0,
      duration: 4.5,
      delay: REVEAL.calmAt + 0.6,
      ease: 'power2.inOut',
      onComplete: () => {
        state = 'winner';
      },
    });
  });
}

// ---------- Init + utvecklingsgenvägar ----------
void (async () => {
  // Terminalfonten delas upp i teckenuppsättningar: ladda svenska tecken så de syns i prompten på skärmen
  void document.fonts.load('66px VT323', 'åäöÅÄÖé').catch(() => undefined);
  const [t, g, w] = await Promise.all([
    loadJson<Team>(CONFIG.data.team),
    loadJson<GitHubData>(CONFIG.data.github),
    loadJson<Winner>(CONFIG.data.winner),
  ]);
  team = t?.team ?? [];
  github = g;
  winner = w;
  const skip = params.get('skip');
  if (skip) {
    // Testgenvägar utan ljud: ?skip=idle | prompt | hud | reveal | winner
    $('gate').classList.add('hidden');
    room.power = 1;
    room.lit = 1;
    room.setScreenState('idle', 0);
    state = 'idle';
    if (skip === 'idle') {
      state = 'idle';
    } else if (skip === 'prompt') {
      room.zoom = 1;
      state = 'prompt';
    } else if (skip === 'hud') {
      room.zoom = 1;
      room.paused = true;
      state = 'loop';
      $('videoLayer').classList.remove('hidden');
      $('videoLayer').style.opacity = '1';
      buildHud();
    } else if (skip === 'winner') {
      // slutbilden: rummet med vinnarnamnet på skärmen
      room.revealOnScreen(winnerName(), now - 30);
      state = 'winner';
    } else if (skip === 'reveal') {
      // inzoomat: se regnet och avkodningen från början
      room.zoom = 1;
      room.revealOnScreen(winnerName(), now);
      state = 'reveal';
    }
  }
})();

// Kontroll: text får aldrig hamna över skärmen (kör __check() i konsolen)
(window as unknown as Record<string, unknown>).__check = () => {
  const b = room.screenNdcBounds();
  const screenLeftPx = ((b.minX + 1) / 2) * window.innerWidth;
  const panel = document.querySelector('#intro .panel, #winner .panel') as HTMLElement | null;
  const right = panel ? panel.getBoundingClientRect().right : 0;
  return { screenLeftPx: Math.round(screenLeftPx), panelRightPx: Math.round(right), ok: screenLeftPx > right };
};
(window as unknown as Record<string, unknown>).__room = room;
