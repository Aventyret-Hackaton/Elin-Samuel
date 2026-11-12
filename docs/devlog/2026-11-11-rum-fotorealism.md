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

## Uppdatering: vinnaren på datorskärmen
Elin ville visa vinnarens reponamn på datorskärmen i stället för neonskylten i fönstret.
- Nytt skärmläge `reveal` (`src/canvases.ts`): matrix-regn (katakana/hex) i ~1,4 s, sedan avkodas namnet tecken för tecken
  vänster till höger (låst vid 3,4 s) och står stort i grönt med `> vinnande projekt` ovanför. Regnet tonas ned till svag bakgrund.
  Tidslinjen ligger i `REVEAL` och används både av ritningen och av ljud/kamera i `main.ts`.
- Avkodningen använder smala tecken: katakana är dubbelt så breda i VT323 och fick namnet att hoppa i bredd.
- Scen 3 (`goReveal` i `main.ts`): kameran står kvar inzoomad, tangentklick rasslar under avkodningen, ett pip när namnet låst sig,
  sedan åker kameran ut till rummet på 4,5 s. Fönstret, persiennen och skylten används inte längre (koden finns kvar).
- Testgenvägar: `?skip=reveal` (inzoomat från början), `?skip=winner` (slutbilden). `?skip=blinds` är borttagen.
- Verifierat i realtid: hela Y-vägen från HUD → regn → namn → utåkning.

## Uppdatering 2026-11-12: mjukare zoom in i skärmen
Tidigare tonades den snedvinklade skärmen i fotot över till en rak helskärmsbild mellan 90 och 100 % zoom.
Geometrierna skilde sig åt, så texten syntes dubbel och hoppade till. Nu rätas vyn i stället upp gradvis längs
skärmens homografi (60–100 % zoom, `uRect` i `plate-shader.ts`), så att skärmen vid full zoom fyller fönstret exakt.
Det finns alltså aldrig två bilder samtidigt. Glasreflexen tonas bort i takt med upprätningen. Verifierat i stillbilder vid 55, 70, 80, 90, 95 och 100 %.

## Uppdatering 2026-11-12: ljudet av bilen
Bilens ljuskägla har fått ett ljud (`carPass` i `src/audio.ts`). Det är en bil på blöt gata (bilden har regn på rutan):
däckväs i ett brusband, ett dovt motorljud av två sågtänder och lågt vägrummel. En dopplereffekt sänker tonhöjden
när bilen passerat. Ljudet panoreras från vänster till höger som ljuset och lågpassfiltreras som genom en källarvägg,
ljusast mitt i passagen. Varje passage varierar ±15 % i tonhöjd och styrka, så det inte blir tjatigt.
- Synk: båda rummen anropar `onCarPass(5)` (nytt i `RoomLike`) samtidigt som svepet startar. `main.ts` spelar ljudet.
- Ljudet spelas bara om AudioContext redan är upplåst av boot-gaten, så `?skip=`-lägen förblir tysta.
- Verifierat: anropet sker i samma bildruta som svepet startar, och inga konsolfel. **Inte avlyssnat** av en människa.

Rättning samma dag: när ljuskäglan passerade blev det en mörk ram runt datorn. Ljuset maskas med djupkartan
(bara väggar långt bort får ljus, datorn ska vara mörk), men den handgjorda djupkartan hade datorn som en suddig
rektangel. Den suddiga kanten gjorde att väggen runt datorn räknades som nära. Djupkartan är omgjord: datorn har sin
uppmätta kontur (frontram, bakre kåpa, fot) med skarpa kanter, och föremålen målas efter suddningen av väggarna,
så att ingen gloria uppstår. Lampan och hyllan målas inte längre (tunna föremål, rektanglar gav fel mask).
Ett försök att ta bort djupmasken helt lyste upp datorn också, vilket Elin inte ville ha.
Verifierat: förstärkt ljus över datorn ger ingen ram, och musen helt ut åt sidorna ger inga kantfel i parallaxen.

## Uppdatering 2026-11-12: vinstfanfar
- **Vinstfanfar** (`victoryFanfare` i `src/audio.ts`) spelas när vinnarnamnet låst sig (`REVEAL.lockedAt`) och ersätter pipet.
  Elin ville ha något som liknar "banan klarad" i 8-bitars Super Mario. Själva melodin är upphovsrättsskyddad och kopieras inte.
  Fanfaren är en egen komposition (I–IV–V–I i C-dur) med NES-känsla: fyrkantsvåg för melodin, 25 %-pulsvåg för stämmorna,
  triangelvåg i basen, snabb arpeggio uppåt, två ackordstötar och ett hållet slutackord med vibrato (~2,3 s).
- **Regnljud** prövades (först filtrerat brus, sedan tusentals små dropp-impulser), men lät som en datorfläkt
  och blev inte bra. Elin valde bort det, och det är helt borttaget.
- Verifierat: fanfaren spelar utan fel i konsolen och bygget går igenom. **Inte avlyssnad** av en människa.

## Uppdatering 2026-11-12: lysröret i taket tänds i scen 3
När vinnaren står på skärmen och kameran åker ut tänds ett lysrör i taket. Det syns inte i bilden (taket är bara en mörk kant),
så det sitter precis ovanför bildkanten, som på film:
- `uTube` i `plate-shader.ts`: kallt vitt ljus som fyller rummet, starkast högt upp, med lätt upplyfta skuggor (platt lysrörsljus)
  och ett sken som läcker in vid överkanten. Kodrummet har motsvarande punktljus i taket.
- `tubeOn()` i `main.ts`: ett par korta blink, en stunds tvekan, sedan fullt ljus med ett sista ryck. Startar 0,5 s efter att utzoomningen är klar.
  `?skip=winner` visar slutbilden med tänt lysrör.
- Ljud (`tubeClick`, `tubeBuzz` i `src/audio.ts`): tändarens klick vid varje blink (metalliskt tick, ping, dunk från drosseln),
  sedan ett lågt surr på 100 Hz (dubbla nätfrekvensen på 50 Hz) med övertoner, fladder och glesa elektriska sprak.
  Surret börjar med ett kort uppsving när röret tänder. Ljuden ligger i samma GSAP-tidslinje som blinkandet.
- Verifierat: ljuset i stillbilder vid 0, 35 och 100 %, ljuden spelar utan fel. **Inte sett eller hört i realtid**.

## Öppna frågor
- Ljudet i scen 3 (tangentklick + pip) är inte avlyssnat av en människa.
- **Djupkartan** är grov och handgjord. En riktig (Depth Anything eller liknande) ger bättre parallax.
- **Upplösning:** bilden är 2000 px. 4K vore bättre för retina och zoomen mot fönstret.
- **Bildrättigheter:** kontrollera AI-verktygets villkor (publikt repo).
- STYLE.md står fortfarande som "UTKAST". CLAUDE.md:s regel om godkänd moodboard behöver lösas.
- Safari och Firefox är inte testade med fotorummet.

## Nästa steg
1. Se hela flödet i riktig Chrome, särskilt Y-övergången och persiennen. Finjustera `windowView` och tider.
2. Riktig djupkarta och 4K-version av bilden.
3. Eventuellt: animera regnet på glaset och låta ljusstrålen från fönstret pulsera.
