# Hackathon-kampanjsajt

Tre scener i en fullskärmsupplevelse: rum (boot + modem) → vinnare koras (video + HUD) → vinnare presenteras.
Vite + TypeScript + Three.js + GSAP. Endast desktop.

## Kör
```
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + produktionsbygge i dist/
```
Boot-skärmen kräver ett klick/ENTER (webbläsare blockerar ljud före användargest). Klicka igen under modemljudet för att hoppa över.

Testgenvägar (utan ljud): `?skip=idle`, `?skip=hud`, `?skip=winner`.
Kontroll att text aldrig hamnar över skärmen: kör `__check()` i konsolen i scen 1.

## Byt platshållare mot riktiga assets (ingen kodändring)
| Vad | Fil |
|---|---|
| Kampanjvideon (scen 2) | `public/media/video.mp4` (MP4/H.264, 16:9, med ljud) |
| Loopklippet (video-slutet, 5–10 s) | `public/media/loop.mp4` |
| Teamfoton | `public/team/*.jpg` + `photo`-fältet i `public/data/stats.json` |
| GitHub-siffror | `public/data/stats.json` |
| Vinnare, motivering | `public/data/winner.json` |
| Texter (rubrik, CTA m.m.) | `src/config.ts` |

## Typsnitt
Replica LL Regular (enda vikten). Filen `public/fonts/ReplicaLL-Regular.otf` är gitignorerad (kommersiell licens).
Lägg den där lokalt, eller installera typsnittet på datorn. Webbpublicering kräver webfont-licens.

## Stil
`docs/moodboard/STYLE.md` (moodboard i `docs/moodboard/MOODBOARD.png`).

## Struktur
- `src/room.ts` – 3D-rummet, ljus, kamera (musstyrd POV), zoom mot skärmen, efterbehandling
- `src/main.ts` – tillståndsmaskin: gate → boot → idle → zoom → video → loop → reveal → winner
- `src/audio.ts` – modem, CRT-surr, blip/whoosh (WebAudio, allt syntetiserat)
- `src/config.ts` – texter och sökvägar
