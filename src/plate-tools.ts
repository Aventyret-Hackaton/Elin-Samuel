// Utvecklarverktyg för fotorummet:
//  - savePlateFile: sparar en fil till public/room/ via dev-servern (vite.config.ts), annars nedladdning.
//  - startCalibrate: ?calibrate=desk|window. Klicka på de fyra hörnen (skärmen resp. fönstret) i bilden.
import type { PlateJson, Quad } from './room-types';
import { BASE } from './config';

export async function savePlateFile(name: string, data: Blob | string) {
  const blob = typeof data === 'string' ? new Blob([data], { type: 'application/json' }) : data;
  if (import.meta.env.DEV) {
    const r = await fetch(`/__plate/save?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
    if (r.ok) {
      console.log(`[plate] sparade public/room/${name}`);
      return;
    }
    console.warn(`[plate] dev-servern sparade inte ${name} (${r.status}), laddar ner i stället`);
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const LABELS = ['övre vänstra', 'övre högra', 'nedre högra', 'nedre vänstra'];

/** Vad som kan kalibreras: bild (desk/window) och fält i plate.json. */
const TARGETS = {
  screen: { view: 'desk', field: 'screen', what: 'skärmglasets' },
  desk: { view: 'desk', field: 'screen', what: 'skärmglasets' },
  blinds: { view: 'desk', field: 'blinds', what: 'persiennens (överkant till nedre list)' },
  pane: { view: 'desk', field: 'pane', what: 'nedre fönsterrutans glas' },
  sign: { view: 'desk', field: 'sign', what: 'neonskyltens yta' },
  window: { view: 'window', field: 'window', what: 'fönstrets' },
} as const;
export type CalibrateTarget = keyof typeof TARGETS;
export const isCalibrateTarget = (s: string | null): s is CalibrateTarget => !!s && s in TARGETS;

export async function startCalibrate(target: CalibrateTarget, plateJsonPath: string) {
  const T = TARGETS[target];
  let plate: PlateJson | null = null;
  try {
    plate = (await (await fetch(BASE + plateJsonPath)).json()) as PlateJson;
  } catch {
    /* ingen plate.json än */
  }
  const imgPath = (T.view === 'desk' ? plate?.desk.image : plate?.window?.image) ?? `room/${T.view}.jpg`;
  const which = target;
  const what = T.what;

  // Stoppa resten av sajten (boot-skärmen m.m.) från att reagera på tangenter
  window.addEventListener(
    'keydown',
    (e) => {
      e.stopImmediatePropagation();
      if (e.key === 'Backspace' && pts.length) {
        pts.pop();
        draw();
        say();
      }
    },
    true,
  );

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#050403;cursor:crosshair;font-family:VT323,monospace;color:#6bff97;';
  const img = document.createElement('img');
  img.src = BASE + imgPath + '?v=' + Date.now();
  img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none;';
  img.draggable = false;
  const info = document.createElement('div');
  info.style.cssText = 'position:absolute;left:16px;top:12px;font-size:24px;text-transform:none;background:rgba(0,0,0,.6);padding:6px 10px;white-space:pre;';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;');
  box.append(img, svg, info);
  document.body.appendChild(box);

  const pts: [number, number][] = [];
  const say = () => {
    info.textContent =
      pts.length < 4
        ? `kalibrering ${which}: klicka på ${what} ${LABELS[pts.length]} hörn (${pts.length + 1}/4)\nbackspace ångrar`
        : `klart. ${import.meta.env.DEV ? 'plate.json är uppdaterad.' : 'klistra in i plate.json:'}\n` + JSON.stringify(pts.map((p) => p.map((v) => +v.toFixed(4))));
  };
  // Bildens faktiska yta inom object-fit: contain
  const rect = () => {
    const r = img.getBoundingClientRect();
    const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h };
  };
  const draw = () => {
    const r = rect();
    const xy = pts.map(([x, y]) => `${r.x + x * r.w},${r.y + y * r.h}`);
    svg.innerHTML =
      `<polygon points="${xy.join(' ')}" fill="rgba(107,255,151,.15)" stroke="#6bff97" stroke-width="1.5"/>` +
      xy.map((p) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="5" fill="#ff3d7f"/>`).join('');
  };
  box.addEventListener('click', async (e) => {
    if (pts.length >= 4) return;
    const r = rect();
    pts.push([(e.clientX - r.x) / r.w, (e.clientY - r.y) / r.h]);
    draw();
    say();
    if (pts.length === 4) {
      const quad = pts as Quad;
      console.log(`[plate] ${T.view}.${T.field} =`, JSON.stringify(quad));
      if (plate && import.meta.env.DEV) {
        const view = (T.view === 'desk' ? plate.desk : plate.window) as Record<string, unknown> | undefined;
        if (view) {
          view[T.field] = quad.map((pt) => pt.map((v) => +v.toFixed(4)));
          await savePlateFile(plateJsonPath.split('/').pop()!, JSON.stringify(plate, null, 2) + '\n');
        }
      }
    }
  });
  window.addEventListener('resize', draw);
  say();
}
