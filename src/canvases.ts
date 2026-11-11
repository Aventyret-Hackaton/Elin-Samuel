// Canvas-innehåll som delas av kodrummet (room.ts) och fotorummet (room-plate.ts):
// CRT-skärmens text/prompt och fönstrets neonglöd/skylt. Ren 2D-ritning, inget Three.js här.

export type ScreenState = 'off' | 'idle' | 'winner';

export interface ScreenContent {
  state: ScreenState;
  /** Tid då nuvarande tillstånd startade (raderna skrivs ut från den). */
  start: number;
  promptText: string;
  promptSubmitted: boolean;
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
    if (winner) {
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
