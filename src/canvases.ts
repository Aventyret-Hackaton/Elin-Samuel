// Canvas-innehåll som delas av kodrummet (room.ts) och fotorummet (room-plate.ts):
// CRT-skärmens text/prompt och fönstrets neonglöd/skylt. Ren 2D-ritning, inget Three.js här.

export type ScreenState = 'off' | 'idle' | 'winner' | 'reveal';

export interface ScreenContent {
  state: ScreenState;
  /** Tid då nuvarande tillstånd startade (raderna skrivs ut från den). */
  start: number;
  promptText: string;
  promptSubmitted: boolean;
  /** Vinnarens reponamn (visas i läget 'reveal'). */
  winnerName?: string;
}

/** Tidslinjen i läget 'reveal' (sekunder från start). */
export const REVEAL = {
  /** Namnet börjar avkodas ur regnet. */
  decodeAt: 1.4,
  /** Sista tecknet har låst sig. */
  lockedAt: 3.4,
  /** Regnet har tonat ned till svag bakgrund. */
  calmAt: 4.4,
} as const;

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン0123456789abcdef<>/_=+*';
const glyph = (n: number, set = GLYPHS) => set[((n % set.length) + set.length) % set.length];
/** Smala tecken för namnets avkodning, så bredden inte hoppar (katakana är dubbelt så breda i VT323). */
const NAME_GLYPHS = 'abcdefghijklmnopqrstuvwxyz0123456789<>/_=+*#$%&';
/** Deterministiskt brus 0–1 ur heltal (samma bild varje gång för samma tid). */
const hash = (a: number, b = 0) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Matrix-regn: kolumner av fallande tecken, ljusast i huvudet. */
function drawRain(g: CanvasRenderingContext2D, t: number, w: number, h: number, alpha: number) {
  const size = 26;
  const cols = Math.ceil(w / size);
  const rows = Math.ceil(h / size) + 1;
  g.font = `${size}px "DotGothic16", VT323, monospace`;
  g.textBaseline = 'top';
  for (let c = 0; c < cols; c++) {
    const speed = 9 + hash(c, 1) * 14; // rader per sekund
    const len = 8 + Math.floor(hash(c, 2) * 18);
    const head = (t * speed + hash(c, 3) * rows * 2) % (rows + len);
    for (let k = 0; k < len; k++) {
      const r = Math.floor(head) - k;
      if (r < 0 || r >= rows) continue;
      const fade = 1 - k / len;
      const ch = glyph(Math.floor(hash(c * 97 + r, Math.floor(t * 12 + k)) * 1000));
      g.fillStyle = k === 0 ? `rgba(220,255,230,${alpha})` : `rgba(107,255,151,${alpha * fade * 0.85})`;
      g.fillText(ch, c * size, r * size);
    }
  }
}

/** Vinnarnamnet: varje tecken rasslar slumpmässigt tills det låser sig, vänster till höger. */
function drawDecodedName(g: CanvasRenderingContext2D, name: string, since: number, w: number, h: number) {
  const { decodeAt, lockedAt } = REVEAL;
  if (since < decodeAt) return;
  let size = 230;
  const font = (px: number) => `${px}px VT323, monospace`;
  g.font = font(size);
  while (g.measureText(name).width > w * 0.86 && size > 48) {
    size -= 6;
    g.font = font(size);
  }
  const span = lockedAt - decodeAt;
  const shown = name
    .split('')
    .map((ch, i) => {
      const lockAt = decodeAt + (span * (i + 1)) / Math.max(name.length, 1);
      if (ch === ' ' || since >= lockAt) return ch;
      return glyph(Math.floor(hash(i, Math.floor(since * 24)) * 1000), NAME_GLYPHS);
    })
    .join('');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#6bff97';
  g.shadowBlur = since >= lockedAt ? 26 : 14;
  g.fillStyle = '#6bff97';
  g.fillText(shown, w / 2, h / 2 + 10);
  // Liten etikett ovanför när namnet låst sig
  if (since >= lockedAt) {
    g.shadowBlur = 10;
    g.font = '40px VT323, monospace';
    g.globalAlpha = Math.min(1, (since - lockedAt) * 2);
    g.fillText('> vinnande projekt', w / 2, h / 2 - size * 0.55 - 10);
    g.globalAlpha = 1;
  }
  g.textAlign = 'left';
}

/** Ritar CRT-skärmen. Canvasen är 1920x1080, ritas i 1280x720-koordinater (skala 1,5 för skärpa vid full zoom). */
export function drawScreenCanvas(g: CanvasRenderingContext2D, s: ScreenContent, t: number) {
  g.setTransform(1.5, 0, 0, 1.5, 0, 0);
  const w = 1280;
  const h = 720;
  const winner = s.state === 'winner';
  const main = winner ? '#ff7aa8' : '#6bff97';
  g.fillStyle = winner ? '#1a0610' : '#04140a';
  g.fillRect(0, 0, w, h);
  if (s.state !== 'off') {
    g.shadowColor = main;
    g.shadowBlur = 14;
    g.fillStyle = main;
    g.textBaseline = 'top';
    if (s.state === 'reveal') {
      const since = t - s.start;
      const { decodeAt, calmAt } = REVEAL;
      // Regnet: fullt först, tonas ned till svag bakgrund när namnet tar över
      const rainA = since < decodeAt ? 1 : Math.max(0.12, 1 - ((since - decodeAt) / (calmAt - decodeAt)) * 0.88);
      g.shadowBlur = 6;
      drawRain(g, since, w, h, rainA);
      // Mörk platta bakom namnet så det läses tydligt
      if (since > decodeAt) {
        const k = Math.min(1, (since - decodeAt) / 0.6);
        const pg = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.55);
        pg.addColorStop(0, `rgba(4,20,10,${0.92 * k})`);
        pg.addColorStop(1, 'rgba(4,20,10,0)');
        g.shadowBlur = 0;
        g.fillStyle = pg;
        g.fillRect(0, 0, w, h);
      }
      drawDecodedName(g, s.winnerName ?? '[repo-namn]', since, w, h);
    } else if (winner) {
      g.font = '200px "DotGothic16", monospace';
      g.fillText('優勝', 70, 80);
      g.font = '64px VT323, monospace';
      g.fillText('> project selected_', 80, 400);
      g.fillText('> ' + (Math.floor(t * 2) % 2 ? 'access granted' : 'access granted_'), 80, 480);
    } else {
      g.font = '66px VT323, monospace';
      const lines = ['> hackathon os 26.11', '> scanning repos ........ ok', '> contributors ......... ok', '> judging .............. ready'];
      const since = t - s.start;
      const visible = Math.min(lines.length, Math.floor(since * 2.2));
      lines.slice(0, visible).forEach((l, i) => g.fillText(l, 50, 40 + i * 76));
      if (since > 1.9) {
        // Prompten: användarens text syns här (max 36 tecken per rad)
        const cursor = s.promptSubmitted ? '' : Math.floor(t * 2) % 2 ? '_' : ' ';
        const text = '> ' + s.promptText + cursor;
        const chunks: string[] = [];
        for (let k = 0; k < text.length; k += 36) chunks.push(text.slice(k, k + 36));
        chunks.forEach((c, i) => g.fillText(c, 50, 400 + i * 76));
        if (s.promptSubmitted) g.fillText('> executing ...', 50, 400 + chunks.length * 76);
      }
    }
    g.shadowBlur = 0;
  }
  // Scanlines + vinjett på skärmytan
  g.fillStyle = 'rgba(0,0,0,0.32)';
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1.6);
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.65)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
}

/**
 * Ritar fönstrets glöd. `null`: neonglöd. Tom sträng: mörk natt utan skylt
 * (används vid export av fotoplattor). Namn: mörk natt med en neonskylt.
 */
export function drawSignCanvas(g: CanvasRenderingContext2D, name: string | null) {
  // Storleken följer canvasen (kodrummet: 1024x704; fotorummet anpassar höjden efter fönstrets proportioner)
  const w = g.canvas.width;
  const h = g.canvas.height;
  if (name === null) {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#3d7bff');
    gr.addColorStop(0.5, '#ff3d7f');
    gr.addColorStop(1, '#2fd4e0');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    return;
  }
  g.fillStyle = '#080510';
  g.fillRect(0, 0, w, h);
  if (!name) return;
  const hz = g.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, w * 0.62);
  hz.addColorStop(0, 'rgba(255,61,127,0.22)');
  hz.addColorStop(1, 'rgba(8,5,16,0)');
  g.fillStyle = hz;
  g.fillRect(0, 0, w, h);
  let size = 300;
  const font = (px: number) => `${px}px "Replica LL", "Helvetica Neue", Arial, sans-serif`;
  g.font = font(size);
  while (g.measureText(name).width > w * 0.84 && size > 60) {
    size -= 8;
    g.font = font(size);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const y = h / 2 + size * 0.04;
  // neonrör: brett sken, rosa rör, vit het kärna
  g.shadowColor = '#ff3d7f';
  g.shadowBlur = 70;
  g.lineWidth = 16;
  g.strokeStyle = '#ff3d7f';
  g.strokeText(name, w / 2, y);
  g.shadowBlur = 26;
  g.lineWidth = 9;
  g.strokeStyle = '#ff7aa8';
  g.strokeText(name, w / 2, y);
  g.shadowBlur = 0;
  g.lineWidth = 3.5;
  g.strokeStyle = '#fff1f6';
  g.strokeText(name, w / 2, y);
}
