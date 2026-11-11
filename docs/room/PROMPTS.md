# Fotorummet: bilden och hur den byts

Fotorummet (`src/room-plate.ts`) visar **en stillbild** (`public/room/room.jpg`) där både datorn och fönstret syns.
Djupkartan ger parallax när musen rör sig, och allt ljusspel görs i kod ovanpå bilden:
tändning (skärmen först, sedan lampan, sedan rummet), skärmflimmer, rosa vinnarton och bilens ljuskägla.
Därför behövs **en upplyst bild**, inte flera ljusvarianter.

| Fil i `public/room/` | Vad |
|---|---|
| `room.jpg` | Rummet, 16:9 |
| `room-depth.png` | Djupkarta, gråskala, ljust = nära |
| `plate.json` | Hörn för skärm, persienn och nedre ruta, lampans glödpunkt, vilovyn och fönstervyn |

## Hur bildens delar används
- **Skärmen** (`screen`): den levande prompten mappas in på glaset. Vid full zoom tar sajtens egen skarpa skärm över.
- **Persiennen** (`blinds`, från överkant till nedre list): i scen 3 packas fotots persienn ihop uppåt.
- **Nedre rutan** (`pane`): glaset (regnet) lånas och visas bakom persiennen när den dras upp. Neonskylten lyser i det glaset.
- **Lampan** (`lamp`): glödpunkten tänds med ett kort flimmer i tändningen.
- **Vilovyn** (`rest`) och **fönstervyn** (`windowView`): mittpunkt (0–1) och andel av bildens bredd som syns.
  Scen 3 åker från datorvyn in till fönstervyn.

## Krav på en ny bild
- 16:9, gärna 4096 × 2304 px (nuvarande är 2000 × 1116: okej på vanliga skärmar, något mjuk på retina och vid zoomen mot fönstret).
- CRT-skärmen **släckt och tom** (mörk glasyta utan text), tydliga hörn.
- Fönster med persienn som täcker övre rutan och fri nedre ruta. Ingen text, inga människor, inga logotyper.
- Något bredare utsnitt än det som ska synas: ungefär 94 % av bredden syns i vila.

## Djupkarta
Nuvarande `room-depth.png` är **handgjord och grov** (plan och lådor). Den räcker för lätt parallax och bilens ljuskägla.
En riktig djupkarta blir bättre: kör bilden genom en djupmodell, till exempel Depth Anything V2 (webbdemo på Hugging Face),
och spara som `room-depth.png`. Ljust = nära. Kontrollera tjänstens villkor innan bilden laddas upp.

## Byt bild
1. Lägg den nya bilden som `public/room/room.jpg` (och ev. djupkarta som `room-depth.png`).
2. `npm run dev` och kalibrera, klicka på fyra hörn i ordningen övre vänster, övre höger, nedre höger, nedre vänster:
   - `http://localhost:5173/?calibrate=screen`: skärmglaset
   - `?calibrate=blinds`: persiennen (överkant till nedre list)
   - `?calibrate=pane`: nedre rutans glas
   `plate.json` uppdateras direkt. Lampans punkt och vyerna ändras för hand i `plate.json`.
3. Testa med `?skip=idle`, `?skip=prompt`, `?skip=blinds` och `?skip=winner`, och kör hela flödet från start.

## Rättigheter
Kontrollera att AI-verktygets villkor tillåter publik och kommersiell användning. Repot är publikt, och bilden hamnar både i git och på sajten.
