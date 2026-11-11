import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Endast dev-servern: tar emot filer från ?export=plate och ?calibrate och skriver dem till public/room/.
// Bara de här filnamnen accepteras, och bara från sidor på localhost (skydd mot att andra sajter postar hit).
const ALLOWED = new Set([
  'plate.json',
  'plate-export.json',
  'export-desk.jpg',
  'export-desk-depth.png',
  'export-window.jpg',
  'export-window-depth.png',
]);
const MAX_BYTES = 30 * 1024 * 1024;

function plateSave(): Plugin {
  return {
    name: 'plate-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__plate/save', (req, res) => {
        const name = new URL(req.url ?? '', 'http://localhost').searchParams.get('name') ?? '';
        const origin = req.headers.origin ?? '';
        const local = !origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
        if (req.method !== 'POST' || !ALLOWED.has(name) || !local) {
          res.statusCode = 400;
          res.end('nej');
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) req.destroy();
          else chunks.push(c);
        });
        req.on('end', () => {
          const dir = join(server.config.root, 'public', 'room');
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, name), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({ plugins: [plateSave()] });
