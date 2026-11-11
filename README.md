# Hackathon-kampanjsajt

Tre scener i en fullskärmsupplevelse: rum (boot + modem) → vinnare koras (video + HUD) → vinnare presenteras.
Vite + TypeScript + Three.js + GSAP. Endast desktop.

## Kör
```
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + produktionsbygge i dist/
```
Flöde: klick/ENTER på boot-skärmen (modemljud, klicka igen för att hoppa över) → rummet, ingen text i bild →
klick på datorskärmen zoomar in → skriv valfri text i prompten och tryck ENTER → filmen → statistik och personer → vinnande projekt.

Testgenvägar (utan ljud): `?skip=idle`, `?skip=prompt`, `?skip=hud`, `?skip=winner`.
Kontroll att text aldrig hamnar över skärmen: kör `__check()` i konsolen i scen 1.

## Byt platshållare mot riktiga assets (ingen kodändring)
| Vad | Fil |
|---|---|
| Kampanjvideon (scen 2) | `public/media/video.mp4` (MP4/H.264, 16:9, med ljud) |
| Loopklippet (video-slutet, 5–10 s) | `public/media/loop.mp4` |
| Teamfoton | `public/team/*`, lista byggs av `npm run team` till `public/data/team.json` |
| GitHub-statistik (alla repon i orgen) | `public/data/github.json`, hämtas med `npm run github` |
| Vinnare, motivering | `public/data/winner.json` |
| Etiketter och sökvägar | `src/config.ts` |

## Data och diagram
`npm run github` (körs även före `npm run build`) hämtar commits, PR:er, rader, språk och tidslinje per timme för alla repon i
`Aventyret-Hackaton` via GitHub-API:t och skriver `public/data/github.json`. Token tas från `GITHUB_TOKEN` eller inloggad `gh`
och sparas aldrig. Utan token gäller 60 anrop/timme. Misslyckas hämtningen behålls befintlig fil.
Exkludera repon: `GITHUB_EXCLUDE=Elin-Samuel,repo-config-test npm run github`. Diagrammen ritas med Chart.js i `src/main.ts` (`buildCharts`).
Kör `npm run github` precis före lansering så siffrorna är färska.

## Typsnitt
Replica LL Regular (enda vikten, aldrig versaler: all text visas i gemener), självhostad woff2 med samma mönster som aventyret.se (`font-display: swap`, preload).
`npm run dev`/`build` kör `scripts/fetch-font.mjs`, som hämtar `ReplicaLLWeb-Regular.woff2` från aventyret.se till `public/fonts/`.
Filen är gitignorerad (licens, publikt repo) och ska hämtas vid bygge/deploy, aldrig committas.
Aventyret.se skickar ingen CORS-header för fonten, så den går inte att länka direkt från en annan subdomän.
Annan källa: sätt `REPLICA_FONT_URL`. Misslyckas hämtningen används lokalt installerad Replica LL eller systemtypsnitt.

## Stil
`docs/moodboard/STYLE.md` (moodboard i `docs/moodboard/MOODBOARD.png`).

## Struktur
- `src/room.ts` – 3D-rummet, ljus, kamera (musstyrd POV), zoom mot skärmen, efterbehandling
- `src/main.ts` – tillståndsmaskin: gate → boot → idle → zoom → video → loop → reveal → winner
- `src/audio.ts` – modem, CRT-surr, blip/whoosh (WebAudio, allt syntetiserat)
- `src/config.ts` – texter och sökvägar
