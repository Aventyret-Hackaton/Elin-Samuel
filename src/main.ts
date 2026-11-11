import './style.css';
import gsap from 'gsap';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Filler,
  Legend,
} from 'chart.js';
import { Room } from './room';
import { CONFIG, BASE } from './config';
import { ensureAudio, playModem, playHum, blip, whoosh, keyClick } from './audio';

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, DoughnutController, ArcElement, CategoryScale, LinearScale, Filler, Legend);

type State = 'gate' | 'boot' | 'idle' | 'zoom' | 'prompt' | 'submit' | 'video' | 'loop' | 'reveal' | 'winner';

interface Team {
  team: { name: string; photo: string | null }[];
}
interface GitHubData {
  org: string;
  totals: Record<string, number>;
  repos: { name: string; commits: number }[];
  timeline: { label: string; commits: number; cumulative: number }[];
  languages: { name: string; share: number }[];
}
interface Winner {
  name: string;
  tagline: string;
  motivation: string;
  members: string[];
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

const room = new Room($<HTMLCanvasElement>('gl'));
let state: State = 'gate';
let now = 0;
let stopHum: (() => void) | null = null;
let stopModem: (() => void) | null = null;
let bootTl: gsap.core.Timeline | null = null;
let team: Team['team'] = [];
let github: GitHubData | null = null;
let winner: Winner | null = null;
let charts: Chart[] = [];
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
}

function startLoop() {
  if (state !== 'video') return;
  state = 'loop';
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

function styleCharts() {
  const px = Math.max(13, Math.round(window.innerWidth * 0.0105));
  Chart.defaults.font.family = 'VT323, monospace';
  Chart.defaults.font.size = px;
  Chart.defaults.color = '#8fe3ec';
  Chart.defaults.animation = { duration: 1700, easing: 'easeOutQuart' };
  Chart.defaults.events = []; // HUD:n är inte interaktiv
}

const GRID = 'rgba(47, 212, 224, 0.1)';
const PALETTE = ['#2fd4e0', '#ff3d7f', '#6bff97', '#ffb15c', '#3d7bff', '#b58cff', '#8a8f98'];

function chartBox(parent: HTMLElement, title: string, cls = '') {
  const box = document.createElement('div');
  box.className = 'chart-box ' + cls;
  box.innerHTML = `<div class="chart-title">${title}</div><div class="cv"><canvas></canvas></div>`;
  parent.appendChild(box);
  return box.querySelector('canvas') as HTMLCanvasElement;
}

function buildCharts(host: HTMLElement, g: GitHubData) {
  styleCharts();
  const tl = g.timeline;
  const maxHour = Math.max(1, ...tl.map((t) => t.commits));
  charts.push(
    new Chart(chartBox(host, 'commits över tid', 'wide'), {
      data: {
        labels: tl.map((t) => t.label),
        datasets: [
          { type: 'bar', data: tl.map((t) => t.commits), backgroundColor: 'rgba(255, 61, 127, 0.7)', borderWidth: 0, barPercentage: 0.12, categoryPercentage: 1, yAxisID: 'y1' },
          {
            type: 'line',
            data: tl.map((t) => t.cumulative),
            borderColor: '#2fd4e0',
            backgroundColor: 'rgba(47, 212, 224, 0.16)',
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 1,
            yAxisID: 'y',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: GRID, lineWidth: 0.5 }, border: { color: GRID } },
          y: { beginAtZero: true, grid: { color: GRID, lineWidth: 0.5 }, border: { display: false } },
          y1: { display: false, beginAtZero: true, max: maxHour * 3.2 },
        },
      },
    }),
  );

  const top = g.repos.filter((r) => r.commits > 0).slice(0, 8);
  charts.push(
    new Chart(chartBox(host, 'commits per repo'), {
      type: 'bar',
      data: {
        labels: top.map((r) => `${r.name.toLowerCase()} · ${r.commits}`),
        datasets: [{ data: top.map((r) => r.commits), backgroundColor: top.map((_, i) => (i === 0 ? '#ff3d7f' : '#2fd4e0')), borderWidth: 0, barThickness: 3 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: GRID, lineWidth: 0.5 }, border: { display: false } },
          y: { grid: { display: false }, border: { color: GRID }, ticks: { autoSkip: false } },
        },
      },
    }),
  );

  charts.push(
    new Chart(chartBox(host, 'språk'), {
      type: 'doughnut',
      data: {
        labels: g.languages.map((l) => `${l.name.toLowerCase()} ${Math.round(l.share * 100)}%`),
        datasets: [{ data: g.languages.map((l) => l.share), backgroundColor: PALETTE, borderColor: '#0a0807', borderWidth: 3 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '88%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, padding: 8 } } },
      },
    }),
  );
}

function buildHud() {
  const hud = $('hud');
  charts.forEach((c) => c.destroy());
  charts = [];
  hud.innerHTML = '';
  hudTl?.kill();

  const labels: [string, string][] = [
    ['repos', 'repon'],
    ['commits', 'commits'],
    ['pull_requests', 'pull requests'],
    ['contributors', 'bidragsgivare'],
    ['additions', 'rader tillagda'],
  ];
  const g = github;

  const top = document.createElement('div');
  top.className = 'hud-top';
  hud.appendChild(top);

  const counters: { el: HTMLElement; v: number }[] = [];
  const totals = document.createElement('div');
  totals.className = 'hud-totals';
  if (g) {
    for (const [k, label] of labels) {
      const d = document.createElement('div');
      d.className = 'stat';
      d.innerHTML = `<div class="n">0</div><div class="l">${label}</div>`;
      totals.appendChild(d);
      counters.push({ el: d.querySelector('.n') as HTMLElement, v: g.totals[k] ?? 0 });
    }
  }
  hud.appendChild(totals);

  const chartsHost = document.createElement('div');
  chartsHost.className = 'charts';
  hud.appendChild(chartsHost);
  if (g) buildCharts(chartsHost, g);

  const finalTitle = document.createElement('div');
  finalTitle.className = 'hud-final';
  hud.appendChild(finalTitle);

  // Foto-ring: små längst ner, jättestora på slutet
  const wrap = document.createElement('div');
  wrap.className = 'ring-wrap';
  const ring = document.createElement('div');
  ring.className = 'ring';
  wrap.appendChild(ring);
  const n = Math.max(team.length, 1);
  // Korten renderas i slutstorlek (skarpa) och skalas ned i början, så de är crisp när de är jättestora
  const cardW = Math.min(window.innerWidth * 0.09, 170);
  const bigW = Math.min(window.innerHeight * 0.58, 700);
  const s0 = cardW / bigW;
  const R = Math.max(260, (n * bigW * 1.12) / (2 * Math.PI));
  wrap.style.setProperty('--cw', `${bigW}px`);
  wrap.style.perspective = `${1400 / s0}px`;
  gsap.set(wrap, { scale: s0 });
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

  const tl = gsap.timeline({ delay: 0.6 });
  hudTl = tl;
  tl.add(typeInto(top, `> org: ${(g?.org ?? 'hackathon').toLowerCase()} // scan complete`, 34));
  tl.from('.stat', { opacity: 0, x: -30, stagger: 0.22, duration: 0.5 }, '>0.1');
  counters.forEach((c, i) => {
    const o = { v: 0 };
    tl.to(o, { v: c.v, duration: 1.4, ease: 'power2.out', onUpdate: () => { c.el.textContent = nf(o.v); } }, 1.2 + i * 0.22);
  });
  tl.from('.chart-box', { opacity: 0, y: 24, stagger: 0.25, duration: 0.6 }, 1.2);
  tl.from('.card', { opacity: 0, scale: 0.6, stagger: 0.05, duration: 0.5 }, 2.4);
  const spin = gsap.to(ring, { rotationY: '+=360', duration: 17.5, ease: 'none', repeat: -1 });

  // Slutet: statistik tonas ut, personerna blir riktigt stora
  const finalAt = 9.5;
  tl.to('.charts, .hud-totals, .hud-top', { opacity: 0, y: -24, duration: 0.9, ease: 'power2.in' }, finalAt);
  tl.to(wrap, { top: '47vh', scale: 1, duration: 2.6, ease: 'power3.inOut' }, finalAt + 0.2);
  tl.to(spin, { timeScale: 0.7, duration: 2 }, finalAt + 0.2);
  tl.add(typeInto(finalTitle, `> ${team.length} personer. ett vinnande projekt.`, 28), finalAt + 1.4);
  tl.call(showNext, [], finalAt + 3.2);
}

function showNext() {
  const b = $('next');
  b.textContent = CONFIG.continueLabel + ' ▶';
  b.classList.remove('hidden');
  gsap.fromTo(b, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5 });
}
$('next').addEventListener('click', goReveal);

// ---------- Scen 3: vinnare ----------
function goReveal() {
  if (state !== 'loop') return;
  state = 'reveal';
  blip(990, 0.08);
  whoosh(1.6);
  glitch(600);
  gsap.delayedCall(0.3, () => {
    hudTl?.kill();
    gsap.killTweensOf('.ring');
    charts.forEach((c) => c.destroy());
    charts = [];
    $<HTMLVideoElement>('v1').pause();
    $<HTMLVideoElement>('v2').pause();
    $('videoLayer').classList.add('hidden');
    $('hud').innerHTML = '';
    $('next').classList.add('hidden');
    room.paused = false;
    room.setScreenState('winner', now);
    gsap.to(room, { winner: 1, duration: 1.4 });
    gsap.to(room, { zoom: 0, duration: 2.6, ease: 'power3.inOut' });
    stopHum = playHum();
  });
  gsap.delayedCall(1.9, showWinner);
}

function showWinner() {
  const w = winner ?? { name: '[vinnande projekt]', tagline: '', motivation: '', members: [] };
  const el = $('winner');
  $('wKicker').textContent = '';
  $('wName').textContent = '';
  $('wTag').textContent = '';
  $('wText').textContent = '';
  $('wTeam').innerHTML = '';
  show(el, 0.6);
  const tl = gsap.timeline();
  tl.add(typeInto($('wKicker'), `> ${CONFIG.winnerLabel}`, 24))
    .add(typeInto($('wName'), w.name, 20), '>0.1')
    .add(typeInto($('wTag'), w.tagline, 40), '>0.1')
    .add(typeInto($('wText'), w.motivation, 110), '>0.1')
    .call(() => {
      $('wTeam').innerHTML = w.members.map((m) => `<li>${m}</li>`).join('');
      gsap.from('#wTeam li', { opacity: 0, y: 6, stagger: 0.12, duration: 0.4 });
      state = 'winner';
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
    // Testgenvägar utan ljud: ?skip=idle | prompt | hud | winner
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
      room.winner = 1;
      room.setScreenState('winner', 0);
      showWinner();
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
