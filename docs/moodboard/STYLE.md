# STYLE.md: Hackathon-kampanjsajt

Källa: `MOODBOARD.png` (tavla 07 "Filmisk realism och 3D"). Övriga tavlor i den äldre Funtech-moodboarden
(beige/grön lekfull riktning, Rubik Mono, viktning 70/20/10) **gäller inte** och är struket.
`refs/` innehåller enskilda referensbilder ur tavlan. Både `refs/` och `MOODBOARD.png` är gitignorerade (filmstillbilder, rättigheter) och finns bara lokalt.
Status: **UTKAST, väntar på godkännande.** Inget byggs förrän detta är godkänt.

## Riktning
Filmisk realism: mörk, kontrastrik, ljus som kommer från skärmar och neon i dimma. Blade Runner (1982 och 2049),
Ghost in the Shell (1995) och Prometheus-hologram. Melankoli före lek. Skärm och neon är de enda ljuskällorna,
resten är skugga, rök, damm och korn. Hårdvaran är riktig 80-tals retroteknik (beige CRT med grön fosfor).

Vad bilderna säger:
| Ref | Tar vi med |
|---|---|
| Prometheus-hologram (cyan, partiklar, scanlinjer) | Datagrafer i scen 2: genomskinlig cyan hologramkänsla, linjebrus, små HUD-paneler |
| Röd scan-overlay med bred versal text | Typografin på nyckeltal och etiketter: bred, kraftig versal, stjärnrader, "SCAN LEVEL"-struktur |
| Boot-terminal (grön, scanlines, `> BOOT X.EXE█`, ENTER to boot) | Boot-gate som startar ljud + modem. Tidskod, F-tangenter i kanten |
| Ghost in the Shell (smutsig film, damm, kallt skärmljus mot varm brun botten) | Färggradering och korn i rummet. Damm i ljuset |
| Beige CRT med grön text | Datorn i rummet: beige plast, rundad grön skärm, sidopanel med ventil/knapp |
| Deckards lägenhet (olivgrön, texturerad vägg, varmt, glas i handen) | Rummets materialkänsla: reliefvägg/mörkt trä, varm lampa som kontrast, retroapparater i bakgrunden |
| Blade Runner 2049 (silhuett, dimma, neon, rosa/blå/grön skyltar, bilstrålkastare i dis) | Idle-ljuset: ljuskägla från förbipasserande bil, persienner, neon genom fönster |
| Rachael (rök, glödande cigarett, hårt varmt bakljus) | Bakljus/rim light, rök i ljusstrålar. Cigarett används inte, men röken och glöden |
| Porträtt med violett/cyan duoton, RGB-split, katakana-regn, streckkod, hex-id | Behandling av teamfotona i scen 2 |
| VT323 och DotGothic16 | Terminaltext och katakana-accenter |

## Färg (härledd ur bilderna, ungefärliga värden att finjustera mot sajten)
| Roll | Namn | Hex | Användning |
|---|---|---|---|
| Bas | Natt | `#0A0807` | Bakgrund, varm svart, aldrig ren #000 |
| Skugga | Djupteal | `#0B2A33` | Skuggor i skärmljus, dimma |
| Skärmljus | Hologramcyan | `#2FD4E0` | Datagrafer, kallt fyllnadsljus |
| Fosfor | Skärmgrön | `#6BFF97` | CRT-text, boot, terminal |
| Varm botten | Ambra/brun | `#8A5A2B` / `#3A2418` | Rumsljus, smutsig film, hud |
| Vägg | Olivgrön | `#5B5A2A` | Reliefvägg, retromaterial |
| Neon | Rosa | `#FF3D7F` | Neon, vinnarmoment, highlights |
| Neon | Elektrisk blå | `#3D7BFF` | Dimmig neon, skyltar |
| Varning | Signalrött | `#E0201A` | Skann-/larmmoment, sparsamt |
| Material | Datorbeige | `#D9CBB0` | CRT-plast |
| Text | Krämvit | `#F3E9D2` | Brödtext på mörkt |

Regel: minst 70 % av bildytan är mörk. Max två neonfärger i samma bild. Vinnarscenen skiftar mot rosa/varm ambra.

## Typografi
- **Replica LL Regular** (enda vikten; installerat i `~/Library/Fonts/`) = rubrik, brödtext och UI-text.
  Ingen Bold och ingen Light. Hierarki skapas med storlek, versaler och färg.
- **VT323** (Google Fonts) = terminal, boot, statusrader, tidskod (ref boot-terminal).
- **DotGothic16** (Google Fonts) = japanska katakana-accenter (システム起動, 警告).
- Licens: Replica LL är kommersiell och kräver webfont-licens (woff2) för publicering. Bekräfta innan deploy.

## Ljus och bild
- Skärmen är nyckelljuset och flimrar svagt. Ljuset kastas ut i rummet och färgar bord, vägg och tak.
- Bakljus genom persienner, hårda strimmor, rök/dimma som synliggör ljusstrålar.
- Bloom, vinjett, filmkorn, damm, lätt chromatic aberration i kanterna. Svag anamorf flare på starka punkter.
- Idle: ljuskägla från bil över väggen, neon som blinkar långsamt, dammkorn i strålar.
- Hög kontrast, djupa svärtor, kallt (cyan) mot varmt (ambra) som huvudmotsats.

## UI och element
- Boot-gate: `> BOOT [NAMN].EXE█`, ENTER to boot-ruta, F-tangenter och tidskod i nederkanten.
- CRT-skärm: rundad, scanlines, glöd runt text.
- Datagrafer: hologramlinjer (cyan), små HUD-paneler, stjärnrader, stora versala nyckeltal i Replica LL Regular.
- Textpanel i rummet: gaussian blur-panel, ingen text över skärmytan.

## Personfoton (scen 2)
Duoton violett/cyan, scanlines, RGB-split, vertikalt katakana-regn, hex-id, streckkod, glitchlinje.
Görs i kod, originalen rörs inte.

## Rörelse och ljud
Långsamma kameraåkningar, flimmer och glitch som övergångar, text som skrivs ut tecken för tecken.
Ljud: modemhandskakning vid boot, CRT-surr, svag omgivning, analog synth. (Tempo 174 BPM bara om videon får musik.)

## Undvik
Lekfull Funtech-estetik, ren neonlila synthwave, generisk "hackerblå", ren svart #000.
Filmstillbilderna i `refs/` och `MOODBOARD.png` är endast referens och får inte ligga på den publicerade sajten (rättigheter).

## Öppna beslut
1. Kampanjens namn för boot-skärmen ("FUNTECH" är ett gammalt platshållarnamn).
2. Rumsväg: stiliserat i kod / genererad stillbild + parallax / Blender.
3. Sökväg till teamfotona.
