# 2026-11-11: Fotorealistiskt rum (2.5D), Elin

Föregående: `2026-11-11-kampanjsajt-v1.md` (Samuel). Läs den för flödet och tidigare beslut.

## Mål med sessionen
Kodrummet ser inte filmiskt ut. Byt rummets utseende mot fotorealistiska stillbilder men behåll funktionen:
tändning, musblick, klick som zoomar in i skärmen, prompten, N tillbaka, scen 3 mot fönstret med persienn och neonskylt,
bilens ljuskägla, flimmer och damm.

## Beslut
- **2.5D: stillbild + djupkarta**, inte Blender eller uppgraderat kodrum. Snabbast till filmisk känsla. AI-bilderna tas fram av oss.
- **Två vyer** (`desk`, `window`), eftersom kamerasvepet mot fönstret i scen 3 är för stort för en bild. Svepet görs som panorering +
  rörelseoskärpa + övertoning, och glitchen döljer skarven.
- **En upplyst bild per vy, ljusspelet i shadern.** AI-verktyg kan inte göra identiska bilder med olika ljus. Tändning, skärmspill/flimmer,
  vinnarton, bilens ljuskägla och neonglöd räknas fram ur djup och luminans. Inga handmålade masker behövs.
- **Levande skärm och skylt via homografi.** Skärmens och fönstrets fyra hörn i bilden (i `plate.json`) mappar canvas-innehållet exakt.
  Vid full zoom visas skärmens canvas direkt, alltså skarp oavsett bildupplösning. Persiennen ritas i shadern (valfri `blinds.png`).
- **Samma gränssnitt** (`src/room-types.ts`). `main.ts` väljer rum (`CONFIG.room` eller `?room=`). Flödet är orört.
  `CONFIG.room` står kvar på `'code'` tills riktiga bilder finns, och utan `plate.json` faller sajten tillbaka på kodrummet.
- **Skärmens och skyltens ritning** är utbruten till `src/canvases.ts` och delas av båda rummen. Kodrummets rendering är oförändrad.
- **Platshållare = kodrummet renderat** (`?export=plate`, 16:9 4096×2304, 76° FOV mot sajtens 62° för marginal). Bilderna är också
  kompositionsguider för AI-genereringen. 16:9 valdes före 21:9 eftersom 21:9 inte räcker på höjden i 16:9- och 16:10-fönster.
- **Kalibrering** (`?calibrate=desk|window`): klicka på fyra hörn så uppdateras `plate.json`. Sparas via en dev-endpoint i `vite.config.ts`
  (bara vissa filnamn, bara från localhost, bara i dev).
- Inga nya beroenden.

## Verifierat (Chromium i appens webbläsarpanel)
- Fotorummet med platshållare ser i princip identiskt ut med kodrummet (16:9). Det bevisar att geometri och homografi stämmer.
- Start → tändning → klick → zoom (fyller fönstret i 16:9, 16:10, 21:9) → prompt → film → HUD → `continue?` → N → tillbaka till rummet.
- Scen 3: neonskylten i fönstret, persiennen halvvägs och uppe, svepets mittpunkt. 61 fps vid pixeltäthet 2.
- Kalibreringen träffar exporterade hörn inom ±0,001. `tsc` och `vite build` går igenom.

## Uppdatering: en vy (Elins bild)
Elin tog fram en AI-bild (`public/room/room.jpg`, 2000×1116) där datorn och fönstret syns i samma bild. Två-vy-läget blev onödigt för sajten.
- **Envy-läge:** scen 3 åker in mot fönstret i samma bild (logaritmisk åkning, samma princip som zoomen in i skärmen). Ingen övertoning.
- **Fotots egen persienn** packas ihop uppåt i stället för kodlameller. Bakom den lånas nedre rutans regnglas, och neonskylten lyser där.
  Skyltens canvas får fönsterytans proportioner, så texten inte förvrängs.
- **Lampan** tänds med flimmer strax efter skärmen i tändningen.
- **Djupkartan är handgjord** (`room-depth.png`, plan och lådor, skript i Elins scratch, inte i repot). Ersätt med en riktig (PROMPTS.md).
- `CONFIG.room` är nu `'plate'`. Kodrummet finns kvar (`?room=code`) och används om `plate.json` saknas.
- Exporten skriver nu `export-*`-filer och `plate-export.json` (gitignorerade) och kan inte längre skriva över `plate.json`.
- Kalibrering: `?calibrate=screen|blinds|pane|sign|window`.
- Hörnen är uppmätta ur bilden för hand. Skärm och persienn ser rätt ut i webbläsaren, men det finns ingen pixelexakt kontroll.

Verifierat: vila, tändning (skärm → lampa → rum), zoom, persiennen halvvägs och uppe med skylt, åkningens mittpunkt, `tsc` + `vite build`.
Inte verifierat: Y-övergången i realtid (dold panel), Safari/Firefox.

## Öppna frågor
- **Y-övergången är inte sedd i realtid** (webbläsarpanelen var dold, så animationerna stod still). Slutlägen och mittpunkt är kontrollerade.
- **Djupkartan** är grov och handgjord. En riktig (Depth Anything eller liknande) ger bättre parallax.
- **Upplösning:** bilden är 2000 px. 4K vore bättre för retina och zoomen mot fönstret.
- **Bildrättigheter:** kontrollera AI-verktygets villkor (publikt repo).
- STYLE.md står fortfarande som "UTKAST". CLAUDE.md:s regel om godkänd moodboard behöver lösas.
- Safari och Firefox är inte testade med fotorummet.

## Nästa steg
1. Se hela flödet i riktig Chrome, särskilt Y-övergången och persiennen. Finjustera `windowView` och tider.
2. Riktig djupkarta och 4K-version av bilden.
3. Eventuellt: animera regnet på glaset och låta ljusstrålen från fönstret pulsera.
