import './style.css';
import gsap from 'gsap';
import { Room } from './room';
import { CONFIG, BASE } from './config';
import { ensureAudio, playModem, playHum, blip, whoosh } from './audio';

type State = 'gate' | 'boot' | 'idle' | 'zoom' | 'video' | 'loop' | 'reveal' | 'winner';

interface Stats {
  org: string;
  totals: Record<string, number>;
  repos: { name: string; score: number }[];
  team: { name: string; photo: string | null }[];
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
let stats: Stats | null = null;
let winner: Winner | null = null;

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
typeInto($('gateCmd'), '> BOOT ' + CONFIG.bootName, 22);
$('gateBtn').addEventListener('click', startBoot);
window.addEventListener('keydown', (e) => {
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
  ensureAudio();
  const modem = playModem();
  stopModem = modem.stop;
  $('gateBtn').classList.add('hidden');
  $('gateCmd').textContent = '> CONNECTING';
  const log = $('gateLog');
  const lines: [number, string][] = [
    [0.4, 'ATZ\nOK'],
    [0.8, 'ATDT 555-1234'],
    [2.2, 'CARRIER DETECTED'],
    [3.0, 'CONNECT 56000/V90'],
    [4.2, 'HANDSHAKE ............ ok'],
    [5.4, 'AUTH: GUEST ............ ok'],
    [6.6, 'READY.'],
  ];
  const tl = gsap.timeline();
  lines.forEach(([t, l]) => tl.call(() => { log.textContent += (log.textContent ? '\n' : '') + l; }, [], t));
  tl.call(() => { $('gateCmd').textContent = '> LOADING WORLD'; }, [], 4.0);
  tl.call(lightUp, [], modem.duration - 1.0);
  bootTl = tl;
  // klockan i foten
  const clk = $('gateClock');
  const t0 = performance.now();
  const iv = setInterval(() => {
    const s = (performance.now() - t0) / 1000;
    clk.textContent = `00:00:${String(Math.floor(s)).padStart(2, '0')}:${String(Math.floor((s % 1) * 24)).padStart(2, '0')}`;
    if (state !== 'boot') clearInterval(iv);
  }, 80);
}

function skipBoot() {
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
  gsap.delayedCall(1.8, showIntro);
}

function showIntro() {
  const intro = $('intro');
  $('kicker').textContent = '';
  $('headline').textContent = '';
  $('desc').textContent = '';
  const cta = $('cta');
  cta.textContent = CONFIG.cta;
  cta.classList.add('hidden');
  show(intro, 0.8);
  const tl = gsap.timeline();
  tl.add(typeInto($('kicker'), CONFIG.kicker, 28))
    .add(typeInto($('headline'), CONFIG.headline, 30), '>0.1')
    .add(typeInto($('desc'), CONFIG.description, 90), '>0.1')
    .call(() => {
      cta.classList.remove('hidden');
      gsap.fromTo(cta, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5 });
      state = 'idle';
    });
}

// ---------- Scen 2: zoom -> video -> loop + HUD ----------
$('cta').addEventListener('click', goZoom);

function goZoom() {
  if (state !== 'idle') return;
  state = 'zoom';
  blip(660, 0.08);
  whoosh(2.4);
  stopHum?.();
  hide($('intro'), 0.5);
  gsap.to(room, { zoom: 1, duration: 2.8, ease: 'power3.inOut' });
  gsap.delayedCall(2.35, startVideo);
}

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
  return '0x' + (((i + 7) * 2654435761) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function buildHud() {
  const hud = $('hud');
  hud.innerHTML = '';
  const s = stats;
  if (!s) {
    showNext();
    return;
  }
  const labels: Record<string, string> = { repos: 'REPOSITORIES', commits: 'COMMITS', pull_requests: 'PULL REQUESTS', contributors: 'DELTAGARE' };

  const top = document.createElement('div');
  top.className = 'hud-top';
  hud.appendChild(top);

  const totals = document.createElement('div');
  totals.className = 'hud-totals';
  const counters: { el: HTMLElement; v: number }[] = [];
  for (const [k, v] of Object.entries(s.totals)) {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `<div class="n">0</div><div class="l">${labels[k] ?? k.toUpperCase()}</div>`;
    totals.appendChild(d);
    counters.push({ el: d.querySelector('.n') as HTMLElement, v });
  }
  hud.appendChild(totals);

  const repos = document.createElement('div');
  repos.className = 'hud-repos';
  const max = Math.max(...s.repos.map((r) => r.score));
  s.repos.forEach((r, i) => {
    const d = document.createElement('div');
    d.className = 'repo' + (i === 0 ? ' win' : '');
    d.innerHTML = `<span>${r.name.toUpperCase()}</span><span>${r.score}</span><div class="bar"><i data-w="${(r.score / max) * 100}"></i></div>`;
    repos.appendChild(d);
  });
  hud.appendChild(repos);

  // Foto-ring (duoton/glitch via CSS)
  const wrap = document.createElement('div');
  wrap.className = 'ring-wrap';
  const ring = document.createElement('div');
  ring.className = 'ring';
  wrap.appendChild(ring);
  const n = s.team.length;
  const cardW = Math.min(window.innerWidth * 0.09, 170);
  const R = Math.max(260, (n * cardW * 1.25) / (2 * Math.PI));
  s.team.forEach((m, i) => {
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
  tl.add(typeInto(top, `> ORG: ${s.org.toUpperCase()} // SCAN COMPLETE`, 34));
  tl.from('.stat', { opacity: 0, x: -30, stagger: 0.25, duration: 0.5 }, '>0.1');
  counters.forEach((c, i) => {
    const o = { v: 0 };
    tl.to(o, { v: c.v, duration: 1.4, ease: 'power2.out', onUpdate: () => { c.el.textContent = Math.round(o.v).toLocaleString('sv-SE'); } }, 1.4 + i * 0.25);
  });
  tl.from('.repo', { opacity: 0, x: 30, stagger: 0.18, duration: 0.4 }, 1.6);
  tl.to('.repo .bar i', { width: (_i: number, el: Element) => (el as HTMLElement).dataset.w + '%', duration: 1.1, stagger: 0.15, ease: 'power3.out' }, 2.0);
  tl.from('.card', { opacity: 0, scale: 0.6, stagger: 0.12, duration: 0.5 }, 2.6);
  tl.to(ring, { rotationY: '+=360', duration: 60, ease: 'none', repeat: -1 }, 2.6);
  tl.call(showNext, [], 6.5);
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
  const w = winner ?? { name: '[VINNARE]', tagline: '', motivation: '', members: [] };
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
  stats = await loadJson<Stats>(CONFIG.data.stats);
  winner = await loadJson<Winner>(CONFIG.data.winner);
  const skip = params.get('skip');
  if (skip) {
    // Testgenvägar utan ljud: ?skip=idle | hud | winner
    $('gate').classList.add('hidden');
    room.power = 1;
    room.lit = 1;
    room.setScreenState('idle', 0);
    state = 'idle';
    if (skip === 'idle') {
      showIntro();
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
