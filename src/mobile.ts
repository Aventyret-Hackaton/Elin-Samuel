// Mobilvyn: slutbilden (rummet med vinnarnamnet på skärmen), vinnaren och en uppmaning att öppna på dator.
// Bilden ligger i public/share/mobil.jpg och kan bytas utan kodändring.
import './style.css';
import { CONFIG, BASE } from './config';

const ORG = 'Aventyret-Hackaton';

async function winnerName(): Promise<string | null> {
  try {
    const r = await fetch(BASE + CONFIG.data.winner);
    if (!r.ok) return null;
    const w = (await r.json()) as { name?: string };
    return w.name?.trim() || null;
  } catch {
    return null;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Desktopupplevelsens DOM behövs inte (och videoelementen ska inte börja ladda)
document.getElementById('app')?.remove();
document.body.classList.add('is-mobile');

const name = await winnerName();

const main = el('main', 'm');
main.id = 'mobile';

const photo = el('div', 'm-photo');
const img = el('img', '');
img.src = BASE + 'share/mobil.jpg';
img.alt = name ? `rummet med datorn. på skärmen står vinnaren: ${name}.` : 'rummet med datorn.';
img.decoding = 'async';
photo.append(img);

const text = el('div', 'm-text');
text.append(el('p', 'kicker', '> vinnande projekt'), el('h1', 'm-name', name ?? 'äventyret hackathon 2026'));
text.append(el('p', 'm-lead', `${CONFIG.projectCount} meningslösa projekt. ett (1) mer onödigt än de andra. faktiskt.`));
text.append(el('p', 'm-note', 'vinnarmaskinen är byggd för dator. öppna länken där för hela upplevelsen, med ljud.'));
const link = el('a', 'btn', name ? 'se repot på github' : 'se alla projekt på github');
link.href = name ? `https://github.com/${ORG}/${encodeURIComponent(name)}` : `https://github.com/${ORG}`;
link.rel = 'noopener';
text.append(link);

main.append(photo, text);
document.body.append(main);
