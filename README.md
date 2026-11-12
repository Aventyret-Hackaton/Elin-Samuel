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
klick på datorskärmen zoomar in → skriv valfri text i prompten och tryck ENTER → filmen (med nyckeltal från GitHub-organisationen stort ovanpå) → personerna →
`reveal winner? [y] [n]` över hela skärmen (pilar/y/n väljer, ENTER bekräftar): y → matrix-regn på datorskärmen, vinnarens reponamn avkodas och står stort i grönt, sedan åker kameran ut till rummet. n → tillbaka till rummet.

Testgenvägar (utan ljud): `?skip=idle`, `?skip=prompt`, `?skip=hud`, `?skip=reveal` (matrix-regnet på skärmen), `?skip=winner` (slutbilden).
Kontroll att text aldrig hamnar över skärmen: kör `__check()` i konsolen i scen 1.

## Byt platshållare mot riktiga assets (ingen kodändring)
| Vad | Fil |
|---|---|
| Kampanjvideon (scen 2) | `public/media/video.mp4` (MP4/H.264, 16:9, med ljud) |
| Loopklippet (video-slutet, 5–10 s) | `public/media/loop.mp4` |
| Teamfoton | `public/team/*`, lista byggs av `npm run team` till `public/data/team.json` |
| GitHub-statistik (alla repon i orgen) | `public/data/github.json`, hämtas med `npm run github` |
| Vinnande repo (namnet på datorskärmen i scen 3) | `public/data/winner.json` (`name`) |
| Fotorummet (bild + djup, scen 1 och 3) | `public/room/room.jpg`, `room-depth.png`, `plate.json`, se `docs/room/PROMPTS.md` |
| Etiketter och sökvägar | `src/config.ts` |

## Film
`npm run film` renderar filmen (55 s) av fem scenklipp i `film/clips/scene-1..5.mp4` (12 s vardera = 11 s scen + 1 s övergångsöverlapp, 1920×1080, 24 fps) + syntetiserad musik
+ trippiga övergångar + profilbilder som blixtrar förbi. Saknas klippen skapas platshållare. `node film/render.mjs --install`
kopierar resultatet till `public/media/video.mp4`. Nyckeltalen läggs ovanpå filmen av sajten, inte i filen.
Genererade filer (`film/out/`, `film/clips/`) är gitignorerade. Filmen kodas liten (crf 30, max 3 Mbit/s, ~10 MB för 55 s) eftersom repot är publikt och filmen versioneras i git: ändra den sällan, varje ny version ligger kvar i historiken.

## Fotorummet (2.5D)
Standard är fotorummet (`room: 'plate'` i `src/config.ts`). Kodrummet finns kvar: `?room=code`.
- **Fotorummet** (`src/room-plate.ts` + `src/plate-shader.ts`): `public/room/room.jpg` + djupkarta, beskrivet i `public/room/plate.json`.
  En bild visar både datorn och fönstret (envy-läge). Musen ger parallax, den levande CRT-skärmen mappas in på glaset,
  Persiennen/neonskylten i fönstret (`windowView`, `blinds`, `pane`) finns kvar i koden men används inte i flödet längre.
  Tändning (med skrivbordslampan), flimmer, vinnarton och bilens ljuskägla görs i shadern.
- **Kodrummet** (`src/room.ts`): 3D byggt i kod. Används också om `plate.json` saknas.

Byt bild: se `docs/room/PROMPTS.md`. Utvecklarlägen (bara `npm run dev`, sparar till `public/room/` via `vite.config.ts`):
- `?calibrate=screen` / `blinds` / `pane`: klicka på fyra hörn i bilden, `plate.json` uppdateras.
- `?export=plate` renderar kodrummet som bilder (`export-*`, gitignorerade). Visa dem med `?room=plate&plate=export` (två-vy-läget).

## Data
`npm run github` (körs även före `npm run build`) hämtar commits, PR:er, rader, språk och tidslinje per timme för alla repon i
`Aventyret-Hackaton` via GitHub-API:t och skriver `public/data/github.json`. Token tas från `GITHUB_TOKEN` eller inloggad `gh`
och sparas aldrig. Utan token gäller 60 anrop/timme. Misslyckas hämtningen behålls befintlig fil.
Exkludera repon: `GITHUB_EXCLUDE=vinnarmaskinen,repo-config-test npm run github`. Arton rubriker visas stort ovanpå filmen, jämnt fördelade över dess längd: repon, commits, pull requests, vibekådare (bidragsgivare), rader kod, rekordtimmen, de två vanligaste kodspråken ("coded in javascript, 6 repositories") och de två vanligaste teknikstackarna ("built with vite, 3 repositories"). Teknikstackar hittas i package.json, requirements.txt, Dockerfile m.m. Dessutom filer, unika npm-paket och commits co-authored av AI. En rubrik, "coded in confetti, 1 repository", är ett internt skämt utan data bakom (konstanten `JOKE` i `src/main.ts`).
Kör `npm run github` precis före lansering så siffrorna är färska.

## Publicering
GitHub Pages via Actions (`.github/workflows/pages.yml`). Varje push till `main` bygger och publicerar till
https://aventyret-hackaton.github.io/vinnarmaskinen/. Kör bygget manuellt (Actions → Pages → Run workflow) precis före lansering,
så hämtas färsk statistik. Bygget hämtar fonten och statistiken (`prebuild`) med repots egen token. Den har bara läsbehörighet, och alla repon i organisationen är publika.
Sökvägarna följer `base_path` från Pages: undermappen `/vinnarmaskinen/` på github.io, och roten med egen domän.
Egen domän (t.ex. `hackathon.aventyret.se`): lägg en CNAME-post mot `aventyret-hackaton.github.io` och ange domänen under Settings → Pages. Ändra också `og:image` och `og:url` i `index.html` (se Mobil och delning).

## Mobil och delning
- **Mobilvy** (`src/mobile.ts`, `src/mobile.css`): telefoner och surfplattor (touch utan hovring, eller smalare än 760 px) får slutbilden
  med vinnarnamnet på skärmen, vinnaren i text, en uppmaning att öppna på dator och en länk till vinnarens repo. `src/entry.ts` väljer läge
  och laddar 3D-upplevelsen bara på dator. Testa med `?device=mobile` eller `?device=desktop`.
- **Delningsbild** (`public/share/og.jpg`, 1200×630): rummet i första scenen med boot-raderna på skärmen. Avslöjar inte vinnaren.
  Taggarna står i `index.html`. `og:image` och `og:url` är fullständiga adresser till github.io och måste ändras vid egen domän.
- Bilderna (`public/share/`) är skärmdumpar ur sajten (`?skip=idle` i 1200×630, `?skip=winner` i 1600×900 beskuren till stående) och kan bytas utan kodändring.

## Typsnitt
Replica LL Regular (enda vikten, aldrig versaler: all text visas i gemener), självhostad woff2 med samma mönster som aventyret.se (`font-display: swap`, preload).
`npm run dev`/`build` kör `scripts/fetch-font.mjs`, som hämtar `ReplicaLLWeb-Regular.woff2` från aventyret.se till `public/fonts/`.
Filen är gitignorerad (licens, publikt repo) och ska hämtas vid bygge/deploy, aldrig committas.
Aventyret.se skickar ingen CORS-header för fonten, så den går inte att länka direkt från en annan subdomän.
Annan källa: sätt `REPLICA_FONT_URL`. Misslyckas hämtningen används lokalt installerad Replica LL eller systemtypsnitt.

## Stil
`docs/moodboard/STYLE.md` (moodboard i `docs/moodboard/MOODBOARD.png`).

## Struktur
- `src/room.ts` – kodrummet: 3D, ljus, kamera (musstyrd POV), zoom mot skärmen, efterbehandling, `?export=plate`
- `src/room-plate.ts`, `src/plate-shader.ts` – fotorummet (2.5D), samma gränssnitt (`src/room-types.ts`)
- `src/canvases.ts` – CRT-skärmens 2D-innehåll (prompt, matrix-regn + vinnarnamn i läget `reveal`) och neonskylten, delas av båda rummen
- `src/plate-tools.ts` – export/kalibrering för fotorummet
- `src/main.ts` – tillståndsmaskin: gate → boot → idle → zoom → video → loop → reveal → winner
- `src/audio.ts` – modem, CRT-surr, blip/whoosh (WebAudio, allt syntetiserat)
- `src/config.ts` – texter och sökvägar
