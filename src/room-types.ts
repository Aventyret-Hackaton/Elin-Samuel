import type { ScreenState } from './canvases';

/**
 * Det gränssnitt main.ts använder mot rummet. Både kodrummet (room.ts) och fotorummet (room-plate.ts)
 * uppfyller det, så flödet i main.ts är detsamma oavsett vilket rum som visas.
 * Talvärdena animeras med GSAP utifrån.
 */
export interface RoomLike {
  power: number; // skärmen
  lit: number; // rummet
  zoom: number; // 0 = rumsvy, 1 = skärmen fyller fönstret
  winner: number; // 0 = scen 1, 1 = scen 3 (mot fönstret)
  blinds: number; // 0 = persiennen nere, 1 = uppdragen
  signPower: number; // neonskyltens ljusstyrka
  mouseGain: number;
  paused: boolean;
  promptText: string;
  promptSubmitted: boolean;
  refreshScreen(t: number): void;
  restartScreen(now: number): void;
  setScreenState(s: ScreenState, now: number): void;
  /** Scen 3: matrix-regn på skärmen, sedan vinnarens reponamn stort i grönt. */
  revealOnScreen(name: string, now: number): void;
  setSign(name: string | null): void;
  pointOnScreen(cx: number, cy: number, pad?: number): boolean;
  screenNdcBounds(): { minX: number; maxX: number; minY: number; maxY: number };
  update(dt: number, t: number): void;
  /** Anropas när bilens ljuskägla börjar svepa över rummet (längd i sekunder). */
  onCarPass: ((dur: number) => void) | null;
}

/** Fyra hörn i bilden, normaliserade 0–1 (x åt höger, y nedåt), ordning: övre vänster, övre höger, nedre höger, nedre vänster. */
export type Quad = [[number, number], [number, number], [number, number], [number, number]];

export interface PlateView {
  image: string;
  depth: string;
  /** Vilovyn: mittpunkt i bilden (0–1) och hur stor andel av bildens bredd som syns. */
  rest: { center: [number, number]; width: number };
  /** Djupvärdet (0–1, ljust = nära) som står still när musen rör sig. */
  focus?: number;
  /** Ljusstyrka på bilden (1 = som den är). */
  exposure?: number;
}

/** Vyn mot datorn. Med `blinds` + `pane` + `windowView` räcker den här bilden för hela sajten (envy-läge). */
export interface DeskPlate extends PlateView {
  screen: Quad;
  /** Persiennen i fotot (övre bågen, från överkant till nedre list). */
  blinds?: Quad;
  /** Nedre rutans glas: lånas bakom persiennen när den dras upp. */
  pane?: Quad;
  /** Ytan där neonskylten lyser. Standard: samma som `blinds`. */
  sign?: Quad;
  /** Skrivbordslampans glödpunkt (0–1). Tänds med flimmer i tändningen. */
  lamp?: [number, number];
  /** Scen 3 i envy-läget: kameran åker in hit. */
  windowView?: { center: [number, number]; width: number };
}

/** public/room/plate.json */
export interface PlateJson {
  desk: DeskPlate;
  /** Separat fönsterbild (två-vy-läget). Utelämnas i envy-läget. */
  window?: PlateView & { window: Quad };
  /** Valfri persienntextur med alfakanal för två-vy-läget. Saknas den ritas persiennen i shadern. */
  blinds?: string;
}
