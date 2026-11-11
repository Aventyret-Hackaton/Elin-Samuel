# 2026-11-11: Kampanjsajt v1 (hackathon-vinnare)

## Mål med sessionen
Planera och bygga en första spelbar version av kampanjsajten som lanserar vinnaren i Äventyrets hackathon:
en fullskärmsupplevelse i tre scener, endast desktop. Klart före lunch, inget kvällsarbete.
Läget vid sessionens slut: hela flödet går att köra från början till slut med platshållare för film och vinnare.
Elin tar över arbetet från `main`.

## Flödet som är byggt
1. **Boot-skärm** (`> boot hackathon.exe`): klick eller ENTER startar ett syntetiserat 90-tals modemljud (~8,4 s).
   Ett andra klick hoppar över. Klicket låser också upp ljud för resten av sajten.
2. **Scen 1, rummet:** mörk källare, beige CRT-dator centrerad, neonpersienner i fönstret, bilens ljuskägla, damm.
   **Ingen text i bild** (borttaget: rubrik, beskrivning, CTA, blurruta). Musen styr blickriktningen (±5°).
3. **Klick på datorskärmen** zoomar in tills skärmen fyller fönstret. Man skriver valfri text i prompten på
   skärmen (syns, tangentklick, å/ä/ö) och trycker **ENTER** → filmen startar. Texten används inte till något.
4. **Scen 2, filmen:** fullskärmsvideo med ljud, utan kontroller. Därefter loopar ett separat klipp med HUD ovanpå:
   räknare, tre tunna neondiagram (Chart.js) och ett 3D-galleri av alla personer som växer till jättestora, skarpa kort.
5. **`> continue? [ y ] [ n ]`**: pilar eller y/n väljer (N förvalt), ENTER bekräftar.
   **Y** → scen 3. **N** → tillbaka till scen 1 (rummet), prompten nollställd.
6. **Scen 3:** ingen text. Skärmen släcks, kameran går mot fönstret, **persiennen dras upp** (skramlande ljud) och bakom
   den tänds en **neonskylt med repots namn**. Inget mer.

## Beslut
- **Teknik:** Vite + TypeScript + Three.js + GSAP + `postprocessing` + Chart.js. Statisk sajt, ingen backend.
- **Moodboard:** endast tavla 07 "Filmisk realism och 3D" gäller (stilbrief i `docs/moodboard/STYLE.md`). Ingen Figma.
- **Inga versaler, någonsin.** All text visas i gemener (CSS globalt + canvas-text), även namn. Tolkat som "inga stora
  bokstäver alls". Menades bara VERSALER kan det lättas för namn.
- **Typsnitt:** Replica LL Regular, enda vikten (ingen Bold/Light). VT323 för terminal/prompt/HUD-etiketter, DotGothic16 för
  katakana. Replica laddas som självhostad woff2 med samma mönster som aventyret.se (`font-display: swap`, preload).
  aventyret.se skickar ingen CORS-header, så fonten kan inte länkas utan måste hämtas: `scripts/fetch-font.mjs` gör det
  vid dev/build. Filen är gitignorerad (licens, publikt repo).
- **Det är ett repo/projekt som vinner, inte en person.** Texter och data är omgjorda (`winner.json` har bara `name`).
- **Riktig statistik:** `scripts/fetch-github.mjs` hämtar alla repon i `Aventyret-Hackaton` (commits, PR:er, rader, språk,
  tidslinje per timme) till `public/data/github.json`. Token tas från `GITHUB_TOKEN` eller inloggad `gh`, sparas aldrig.
- **Personbilder:** ligger i `public/team/` (28 st, bearbetade av Samuel). `npm run team` bygger `public/data/team.json` ur
  filnamnen (rör aldrig bilderna). In-kod-behandlingen är lätt och bevarar fotonas färger. Korten renderas i slutstorlek
  och skalas ned i början, så de är skarpa när de är stora. Galleriet snurrar ett varv på 17,5 s.
- **Rummet är stiliserat och byggt i kod** (inte fotorealistiskt) för att hinna. Bakat ljus/Blender eller genererad stillbild
  med parallax är uppgraderingsvägen.
- **Textfritt rum:** fast horisontell FOV och kameraposer per scen. Scen 1 centrerar datorn, scen 3 riktar kameran mot fönstret.
- **Zoomen** går till avståndet där skärmen täcker hela fönstret (verifierat i 16:9, 16:10 och 21:9).
- **Repot är publikt.** Filmstillbilder (`docs/moodboard/refs/`, `MOODBOARD.png`) är gitignorerade och ligger inte i historiken.
  De 28 teamfotona och `github.json` ligger däremot publikt.
- **Git:** linjär historik, `main` är standardgren och ligger på samma commit som `feat/kampanjsajt-v1`.
- **Buggfix:** modemljudet hoppades över direkt efter start (knappens klick bubblade till boot-ytans "hoppa över"). Fixat,
  plus skydd mot tangentrepetition och dubbelklick.

## Öppna frågor
- **Filmen (scen 2) är inte gjord.** `public/media/video.mp4` och `loop.mp4` är ffmpeg-genererade gradienter med en ton.
  Manus, längd, musik (174 BPM?) och loopklipp återstår. Ska renderas av Claude (HTML/Three.js + Playwright + ffmpeg).
- **Vinnarens repo-namn** i `public/data/winner.json` (`name`) är platshållaren `[repo-namn]`.
- **Vilka repon ska räknas i statistiken?** Just nu alla nio, inklusive kampanjrepot `Elin-Samuel`, `hackaton` (mest shell, ger
  shell 50 % i språkdiagrammet) och `repo-config-test` (inga commits). Exkludera med `GITHUB_EXCLUDE=...`.
- **Siffrorna är från idag** och hackathonet pågick då. Kör `npm run github` precis före lansering.
- **Replica-licensen:** gäller den subdomäner (t.ex. `hackathon.aventyret.se`)? Bekräfta före publicering.
- **Hosting och domän**, OG-bild. Bygget behöver internet (font + GitHub) eller att filerna läggs dit manuellt.
- **Rumsvägen:** stanna vid stiliserat eller uppgradera (genererad stillbild + parallax / Blender)?
- **Namnen i `team.json`** är härledda ur filnamn: kontrollera å/ä/ö och efternamn (rättelser behålls vid nya körningar).
- **Ljud och video är inte avlyssnade av en människa** (testat i headless utan ljud). Modem, tangentklick, persienn och
  videoljud behöver lyssnas igenom.
- **Webbläsartest:** bara Chromium (headless) är testat. Safari och Firefox återstår, liksom prestanda på en riktig laptop.

## Nästa steg
1. Lyssna igenom ljudet och testa flödet i riktig Chrome/Safari. Justera tider, volym och ljus.
2. Producera riktig film + loopklipp (egen session) och byt `public/media/*.mp4`.
3. Bestäm vilka repon som räknas, kör `npm run github` före lansering.
4. Sätt vinnarens repo-namn i `winner.json`. Granska namnen i `team.json`.
5. Finjustera rummet mot referenserna (cyan mot ambra, mer filmisk kontrast) eller uppgradera till fotorealism.
6. Bekräfta Replica-licens för subdomän, välj hosting/domän, deploya (statisk), prestandatest (mål ~15 MB initialt, 60 fps).
7. Arbeta på egna grenar och mergar mot `main` så ni inte skriver över varandra.
