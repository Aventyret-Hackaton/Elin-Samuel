# 2026-11-11: Kampanjsajt v1 (hackathon-vinnare)

## Mål med sessionen
Planera och bygga första spelbara versionen av kampanjsajten som lanserar vinnaren i Äventyrets hackathon:
tre fullskärmsscener (rum med dator → vinnare koras i video → vinnare presenteras), endast desktop.

## Beslut
- **Teknik:** Vite + TypeScript + Three.js + GSAP + `postprocessing`. Statisk sajt, ingen backend.
- **Moodboard:** endast tavla 07 "Filmisk realism och 3D" gäller (`docs/moodboard/MOODBOARD.png`). Den äldre
  gröna Funtech-riktningen är struken. Stilbrief i `docs/moodboard/STYLE.md`. Ingen Figma.
- **Typsnitt:** Replica LL Regular, enda vikten (ingen Bold/Light). VT323 för terminaltext, DotGothic16 för katakana.
  Fontfilen är gitignorerad p.g.a. kommersiell licens.
- **Musen = blickriktning** i rummet (±5°, dämpas till noll under zoom).
- **Boot-gate med modemljud:** webbläsare blockerar ljud före användargest, så ett klick/ENTER på boot-skärmen
  startar syntetiserat 90-tals modem (~8,4 s) och låser samtidigt upp ljudet i scen 2. Andra klicket hoppar över.
- **Rummet är stiliserat och byggt i kod** (inte fotorealistiskt) för att hinna före lunch. Bakat ljus/Blender eller
  genererad stillbild med parallax kvarstår som uppgraderingsväg.
- **Textplacering:** fast horisontell FOV så att text-panelen (vänster) aldrig hamnar över skärmen (höger).
  Verifierat: panel slutar 784 px, skärm börjar 1117 px på 1600×900.
- **Zoom:** kameran dollyr till avståndet där skärmen täcker hela fönstret (verifierat i 16:9, 16:10 och 21:9).
- **Video:** renderas av Claude själva (platshållare nu: ffmpeg-genererade gradienter). Loop som separat klipp
  för att undvika seek-hicka.
- **Platshållare och drop-in:** video, loop, statistik, teamfoton, vinnare och texter byts via filer/`src/config.ts`.
- **Teamfoton:** ligger i `public/team/`, bearbetade av Samuel. `npm run team` (körs även före dev/build) bygger `team` i `stats.json` ur filnamnen (`scripts/build-team.mjs`, rör aldrig bilderna). Den lätta in-kod-behandlingen (svag overlay, scanlines, RGB-kant) behåller fotonas egna färger.
- **Rättigheter:** repot är publikt. Filmstillbilder (`docs/moodboard/refs/`, `MOODBOARD.png`) är gitignorerade och ligger inte i historiken.
- **Grenpolicy:** arbetet ligger på gren `feat/kampanjsajt-v1`, inte direkt på main. Pushad till origin (publikt repo, Aventyret-Hackaton).

## Öppna frågor
- Kampanjens riktiga namn/rubrik (nu "HACKATHON.EXE" / "ÄVENTYRET HACKATHON 2026" som platshållare).
- Teamfotona: 28 st ligger i `public/team/`. Kontrollera att alla ska med och att namnen i `stats.json` stämmer (å/ä/ö, efternamn).
- Webfont-licens för Replica LL (woff2) innan publicering.
- Riktig videon (manus, längd, musik/174 BPM?) och loopklipp.
- GitHub-orgens riktiga data: skript + token med läsrätt (`scripts/fetch-github.mjs` finns inte än).
- Vinnarens namn, motivering och eventuell bild.
- Rumsväg: stanna vid stiliserat eller uppgradera (genererad stillbild + parallax / Blender)?
- Hosting och domän, OG-bild.
- Ljud och video är inte lyssnade igenom av en människa (testat i headless utan ljud).

## Nästa steg
1. Besluta rumsväg och, om uppgradering, producera rummet/stillbilden efter STYLE.md.
2. Producera riktiga videon + loopklipp (egen session, ffmpeg/Playwright-pipeline).
3. Skriva `scripts/fetch-github.mjs` och koppla in orgens statistik.
4. Lägga in teamfoton, vinnardata och slutgiltiga texter.
5. Finjustera ljus/färg mot referenserna (cyan mot ambra, mer filmisk kontrast), lyssna igenom ljudet.
6. Webfont-licens, prestandatest (laddningsbudget ~15 MB, 60 fps), Safari/Firefox-test, deploy.
