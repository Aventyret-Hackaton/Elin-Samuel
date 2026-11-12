import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  VignetteEffect,
  NoiseEffect,
  ChromaticAberrationEffect,
  BlendFunction,
} from 'postprocessing';
import { drawScreenCanvas, drawSignCanvas, type ScreenState } from './canvases';
import type { PlateJson, Quad, RoomLike } from './room-types';
import { plateFragment, plateVertex } from './plate-shader';
import { BASE } from './config';

/** Homografi som avbildar enhetskvadraten (0,0),(1,0),(1,1),(0,1) på fyrhörningen q (Heckbert). */
function squareToQuad(q: Quad) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let a, b, d, e, g, h;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = x1 - x0; b = x3 - x0; d = y1 - y0; e = y3 - y0; g = 0; h = 0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3;
    d = y1 - y0 + g * y1; e = y3 - y0 + h * y3;
  }
  return new THREE.Matrix3().set(a, b, x0, d, e, y0, g, h, 1);
}

/** Inre rektangel och mittpunkt för en fyrhörning (för zoom-målet). */
function innerRect(q: Quad) {
  const [tl, tr, br, bl] = q;
  const left = Math.max(tl[0], bl[0]);
  const right = Math.min(tr[0], br[0]);
  const top = Math.max(tl[1], tr[1]);
  const bottom = Math.min(bl[1], br[1]);
  return { cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top };
}

const centroid = (q: Quad) => new THREE.Vector2((q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4);

function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Uniform-struct för en bild (se `struct Plate` i plate-shader.ts). */
function plateUniform() {
  return {
    c: new THREE.Vector2(0.5, 0.5),
    h: new THREE.Vector2(0.4, 0.4),
    aspect: 16 / 9,
    focus: 0.5,
    exposure: 1,
    hasScreen: 0,
    screenInv: new THREE.Matrix3(),
    screenFwd: new THREE.Matrix3(),
    screenC: new THREE.Vector2(),
    hasWindow: 0,
    signInv: new THREE.Matrix3(),
    windowC: new THREE.Vector2(),
    photoBlinds: 0,
    blindsInv: new THREE.Matrix3(),
    blindsFwd: new THREE.Matrix3(),
    paneFwd: new THREE.Matrix3(),
    hasLamp: 0,
    lamp: new THREE.Vector2(),
  };
}
type PlateU = ReturnType<typeof plateUniform>;

/** Fyrhörningens proportioner i pixlar (bredd/höjd). */
function quadAspect(q: Quad, imgAspect: number) {
  const len = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * imgAspect, a[1] - b[1]);
  return (len(q[0], q[1]) + len(q[3], q[2])) / (len(q[0], q[3]) + len(q[1], q[2]));
}

/**
 * Fotorummet: AI-genererade (eller exporterade) stillbilder med djupkarta, se docs/room/PROMPTS.md.
 * Envy-läge: en bild (datorn och fönstret i samma bild), scen 3 åker in mot fönstret och fotots persienn dras upp.
 * Två-vy-läge: separat fönsterbild, svep + övertoning mellan bilderna.
 * Samma gränssnitt som kodrummet, så main.ts behöver inte veta vilket rum som visas.
 */
export class PlateRoom implements RoomLike {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private dustCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 40);
  private composer: EffectComposer;
  private mat: THREE.ShaderMaterial;
  private u: Record<string, THREE.IUniform>;
  private A: PlateU;
  private B: PlateU;
  private single: boolean;

  power = 0;
  lit = 0;
  zoom = 0;
  winner = 0;
  blinds = 0;
  signPower = 0;
  /** Lysröret i taket (scen 3): 0 = släckt, 1 = tänt. Flimret animeras i main.ts. */
  tube = 0;
  mouseGain = 1;
  paused = false;
  promptText = '';
  promptSubmitted = false;
  /** Vinnarens reponamn för skärmläget 'reveal'. */
  winnerName = '';
  /** Anropas när bilens ljuskägla börjar svepa (sekunder). main.ts spelar ljudet. */
  onCarPass: ((dur: number) => void) | null = null;
  screenState: ScreenState = 'off';

  private mouse = new THREE.Vector2();
  private mouseS = new THREE.Vector2();
  private aspect = 16 / 9;
  /** Nuvarande datorvy (för pointOnScreen). */
  private viewC = new THREE.Vector2(0.5, 0.5);
  private viewH = new THREE.Vector2(0.4, 0.4);

  private screenCanvas = document.createElement('canvas');
  private screenCtx = this.screenCanvas.getContext('2d')!;
  private screenTex: THREE.CanvasTexture;
  private signCanvas = document.createElement('canvas');
  private signTex: THREE.CanvasTexture;
  private signName: string | null = null;
  private screenAcc = 0;
  private screenStart = 0;
  private dust: THREE.Points;
  private carNext = 5;
  private carT = -1;
  private litStart = -1;

  constructor(
    canvas: HTMLCanvasElement,
    private plate: PlateJson,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.single = !plate.window;

    this.screenCanvas.width = 1920;
    this.screenCanvas.height = 1080;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.signCanvas.width = 1024;
    this.signCanvas.height = 704;
    this.signTex = new THREE.CanvasTexture(this.signCanvas);
    this.signTex.colorSpace = THREE.SRGBColorSpace;
    drawSignCanvas(this.signCanvas.getContext('2d')!, null);

    // Vy A = datorn (+ fönstret i envy-läget), vy B = separat fönsterbild
    const d = plate.desk;
    this.A = plateUniform();
    this.A.focus = d.focus ?? 0.5;
    this.A.exposure = d.exposure ?? 1;
    this.A.hasScreen = 1;
    this.A.screenFwd = squareToQuad(d.screen);
    this.A.screenInv = squareToQuad(d.screen).invert();
    this.A.screenC = centroid(d.screen);
    if (d.blinds && d.pane) {
      this.A.hasWindow = 1;
      this.A.photoBlinds = 1;
      this.A.blindsFwd = squareToQuad(d.blinds);
      this.A.blindsInv = squareToQuad(d.blinds).invert();
      this.A.paneFwd = squareToQuad(d.pane);
      this.A.signInv = squareToQuad(d.sign ?? d.blinds).invert();
      this.A.windowC = centroid(d.blinds).add(centroid(d.pane)).multiplyScalar(0.5);
    }
    if (d.lamp) {
      this.A.hasLamp = 1;
      this.A.lamp = new THREE.Vector2(...d.lamp);
    }
    this.B = plateUniform();
    const w = plate.window;
    if (w) {
      this.B.focus = w.focus ?? 0.5;
      this.B.exposure = w.exposure ?? 1;
      this.B.hasWindow = 1;
      this.B.signInv = squareToQuad(w.window).invert();
      this.B.windowC = centroid(w.window);
    }

    const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    black.needsUpdate = true;
    this.u = {
      uReady: { value: 0 },
      uA: { value: this.A },
      uB: { value: this.B },
      tA: { value: black },
      tADepth: { value: black },
      tB: { value: black },
      tBDepth: { value: black },
      tScreen: { value: this.screenTex },
      tSign: { value: this.signTex },
      tBlinds: { value: black },
      uHasBlinds: { value: 0 },
      uMouse: { value: new THREE.Vector2() },
      uParallax: { value: 0.03 },
      uLit: { value: 0 },
      uLamp: { value: 0 },
      uPower: { value: 0 },
      uFlick: { value: 1 },
      uWinner: { value: 0 },
      uBlinds: { value: 0 },
      uSignPower: { value: 0 },
      uTube: { value: 0 },
      uScreenGain: { value: 0 },
      uScreenCol: { value: new THREE.Color(0x6bff97) },
      uCar: { value: new THREE.Vector2(-1, 0) },
      uBarrel: { value: 0.06 },
      uMix: { value: 0 },
      uPanA: { value: new THREE.Vector2() },
      uPanB: { value: new THREE.Vector2() },
      uBlur: { value: 0 },
      uDirect: { value: 0 },
      uRect: { value: 0 },
      uCover: { value: new THREE.Vector2(1, 1) },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: plateVertex,
      fragmentShader: plateFragment,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    quad.renderOrder = -1;
    this.scene.add(quad);
    this.dust = this.buildDust();

    // Samma efterbehandling som kodrummet: bloom, kromatisk aberration, vinjett + korn
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.dustCam));
    this.composer.addPass(
      new EffectPass(this.dustCam, new BloomEffect({ intensity: 0.85, luminanceThreshold: 0.75, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.7 })),
    );
    this.composer.addPass(
      new EffectPass(this.dustCam, new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0013, 0.0009), radialModulation: true, modulationOffset: 0.2 })),
    );
    const noise = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: true });
    noise.blendMode.opacity.value = 0.14;
    this.composer.addPass(new EffectPass(this.dustCam, new VignetteEffect({ offset: 0.25, darkness: 0.8 }), noise));

    window.addEventListener('mousemove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.drawScreen(0);
  }

  /** Laddar bilderna. Tills dess renderas svart (boot-skärmen ligger ändå över). */
  async load() {
    const loader = new THREE.TextureLoader();
    const img = async (path: string, srgb: boolean) => {
      const t = await loader.loadAsync(BASE + path);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      return t;
    };
    const p = this.plate;
    const [a, aD] = await Promise.all([img(p.desk.image, true), img(p.desk.depth, false)]);
    this.u.tA.value = a;
    this.u.tADepth.value = aD;
    this.A.aspect = a.image.width / a.image.height;
    if (p.window) {
      const [b, bD] = await Promise.all([img(p.window.image, true), img(p.window.depth, false)]);
      this.u.tB.value = b;
      this.u.tBDepth.value = bD;
      this.B.aspect = b.image.width / b.image.height;
    }
    // Skyltens canvas får samma proportioner som ytan den lyser på, så texten inte förvrängs
    const signQuad = p.window ? p.window.window : (p.desk.sign ?? p.desk.blinds);
    if (signQuad) {
      const qa = quadAspect(signQuad, p.window ? this.B.aspect : this.A.aspect);
      this.signCanvas.height = Math.round(1024 / THREE.MathUtils.clamp(qa, 0.4, 4));
      this.signTex.dispose(); // ny storlek: GPU-texturen måste allokeras om
      this.setSign(this.signName);
    }
    if (p.blinds) {
      try {
        this.u.tBlinds.value = await img(p.blinds, true);
        this.u.uHasBlinds.value = 1;
      } catch {
        console.warn('[room] persienntexturen kunde inte laddas, ritar persiennen i shadern');
      }
    }
    this.u.uReady.value = 1;
  }

  private buildDust() {
    const n = 260; // glesare än kodrummet: fotot har redan damm och dis
    const pos = new Float32Array(n * 3);
    const r = rand(3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 5;
      pos[i * 3 + 1] = 0.2 + r() * 2.4;
      pos[i * 3 + 2] = -2 + r() * 2.3; // inte närmare kameran än ~0,6 m (stora fyrkanter annars)
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.007, color: 0xcfe9ff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(pts);
    return pts;
  }

  // ---------- Skärm och skylt ----------
  private drawScreen(t: number) {
    drawScreenCanvas(
      this.screenCtx,
      { state: this.screenState, start: this.screenStart, promptText: this.promptText, promptSubmitted: this.promptSubmitted, winnerName: this.winnerName },
      t,
    );
    this.screenTex.needsUpdate = true;
  }

  refreshScreen(t: number) {
    this.drawScreen(t);
  }

  restartScreen(now: number) {
    this.screenStart = now;
    this.drawScreen(now);
  }

  /** Sätt vinnarens namn och starta skärmläget 'reveal' (matrix-regn, sedan namnet). */
  revealOnScreen(name: string, now: number) {
    this.winnerName = name;
    this.screenState = 'reveal';
    this.screenStart = now;
    this.drawScreen(now);
  }

  setScreenState(s: ScreenState, now: number) {
    if (s === this.screenState) return;
    this.screenState = s;
    this.screenStart = now;
    this.drawScreen(now);
  }

  setSign(name: string | null) {
    this.signName = name;
    drawSignCanvas(this.signCanvas.getContext('2d')!, name);
    this.signTex.needsUpdate = true;
  }

  // ---------- Vyer ----------
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.aspect = w / h;
    this.dustCam.aspect = this.aspect;
    this.dustCam.updateProjectionMatrix();
    // Skärmen direkt i helbild: täck fönstret (cover), 16:9-canvas
    const ca = 16 / 9;
    const s = this.aspect > ca ? [1, ca / this.aspect] : [this.aspect / ca, 1];
    (this.u.uCover.value as THREE.Vector2).set(s[0] * 0.985, s[1] * 0.985);
  }

  /** Halva synliga utsträckningen i bilden för en given andel av bildens bredd. Fast horisontell FOV, som kodrummet. */
  private halfExtent(width: number, imgAspect: number) {
    let hx = width / 2;
    let hy = (hx * imgAspect) / this.aspect;
    if (hy > 0.49) {
      // högt fönster: bilden räcker inte på höjden, beskär sidorna i stället
      hx *= 0.49 / hy;
      hy = 0.49;
    }
    return new THREE.Vector2(hx, hy);
  }

  /** Åkning mellan två vyer: skalan interpoleras logaritmiskt och mittpunkten följer med som vid en inåtåkning. */
  private dolly(c0: THREE.Vector2, h0: THREE.Vector2, c1: THREE.Vector2, h1: THREE.Vector2, k: number) {
    const hx = Math.exp(THREE.MathUtils.lerp(Math.log(h0.x), Math.log(h1.x), k));
    const f = Math.abs(h0.x - h1.x) < 1e-6 ? 1 - k : (hx - h1.x) / (h0.x - h1.x);
    const c = c1.clone().add(c0.clone().sub(c1).multiplyScalar(f));
    return { c, h: new THREE.Vector2(hx, (hx * h0.y) / h0.x) };
  }

  /** Datorvyn för aktuell zoom (vila -> skärmen täcker fönstret) och, i envy-läget, åkningen mot fönstret i scen 3. */
  private viewA(t: number, g: number) {
    const d = this.plate.desk;
    const asp = this.A.aspect;
    const h0 = this.halfExtent(d.rest.width, asp);
    const c0 = new THREE.Vector2(...d.rest.center);
    const r = innerRect(d.screen);
    const hx1 = Math.min(r.w / 2, ((r.h / 2) * this.aspect) / asp) * 0.985;
    const h1 = new THREE.Vector2(hx1, (hx1 * asp) / this.aspect);
    let v = this.dolly(c0, h0, new THREE.Vector2(r.cx, r.cy), h1, this.zoom);
    if (this.single && d.windowView && this.winner > 0) {
      const hw = this.halfExtent(d.windowView.width, asp);
      v = this.dolly(v.c, v.h, new THREE.Vector2(...d.windowView.center), hw, this.winner);
    }
    // musblick och andning
    v.c.x += this.mouseS.x * v.h.x * 0.05 * g;
    v.c.y -= this.mouseS.y * v.h.y * 0.05 * g - Math.sin(t * 0.5) * 0.0015 * (1 - this.zoom);
    // Håll vyn inom bilden (annars smetas kanten ut)
    v.c.x = THREE.MathUtils.clamp(v.c.x, Math.min(v.h.x, 0.5), Math.max(1 - v.h.x, 0.5));
    v.c.y = THREE.MathUtils.clamp(v.c.y, Math.min(v.h.y, 0.5), Math.max(1 - v.h.y, 0.5));
    return v;
  }

  private viewB(g: number) {
    const rest = this.plate.window!.rest;
    const h = this.halfExtent(rest.width, this.B.aspect);
    const c = new THREE.Vector2(...rest.center);
    c.x += this.mouseS.x * h.x * 0.05 * g;
    c.y -= this.mouseS.y * h.y * 0.05 * g;
    return { c, h };
  }

  pointOnScreen(cx: number, cy: number, pad = 1.35) {
    const b = this.screenNdcBounds();
    const nx = (cx / window.innerWidth) * 2 - 1;
    const ny = -((cy / window.innerHeight) * 2 - 1);
    const mx = (b.minX + b.maxX) / 2;
    const my = (b.minY + b.maxY) / 2;
    return Math.abs(nx - mx) <= ((b.maxX - b.minX) / 2) * pad && Math.abs(ny - my) <= ((b.maxY - b.minY) / 2) * pad;
  }

  screenNdcBounds() {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [x, y] of this.plate.desk.screen) {
      xs.push((x - this.viewC.x) / this.viewH.x);
      ys.push(-(y - this.viewC.y) / this.viewH.y);
    }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  /** Lampan tänds med ett kort flimmer strax efter att rummet börjat tändas. */
  private lampValue(t: number) {
    if (this.lit >= 0.99) return 1;
    if (this.lit < 0.02) {
      this.litStart = -1;
      return 0;
    }
    if (this.litStart < 0) this.litStart = t;
    const x = t - this.litStart - 0.5;
    if (x < 0) return 0;
    if (x < 0.07) return 0.9;
    if (x < 0.16) return 0.05;
    if (x < 0.24) return 1;
    if (x < 0.3) return 0.25;
    return 1;
  }

  // ---------- Loop ----------
  update(dt: number, t: number) {
    if (this.paused) return;
    this.mouseS.lerp(this.mouse, 1 - Math.exp(-dt * 3));
    const w = this.winner;
    const g = this.mouseGain * Math.max(1 - this.zoom, w);
    const u = this.u;

    const va = this.viewA(t, g);
    this.viewC.copy(va.c);
    this.viewH.copy(va.h);
    this.A.c.copy(va.c);
    this.A.h.copy(va.h);
    (u.uMouse.value as THREE.Vector2).set(this.mouseS.x * g, -this.mouseS.y * g);

    if (this.single) {
      u.uMix.value = 0;
      u.uBlur.value = Math.sin(Math.PI * w) * 0.004;
    } else {
      const vb = this.viewB(this.mouseGain);
      this.B.c.copy(vb.c);
      this.B.h.copy(vb.h);
      // Svep dator -> fönster: vyerna panoreras åt var sitt håll och tonas över
      (u.uPanA.value as THREE.Vector2).set(-THREE.MathUtils.smoothstep(w, 0, 0.65) * va.h.x, 0);
      (u.uPanB.value as THREE.Vector2).set((1 - THREE.MathUtils.smoothstep(w, 0.35, 1)) * vb.h.x, 0);
      u.uMix.value = THREE.MathUtils.smoothstep(w, 0.35, 0.65);
      u.uBlur.value = Math.sin(Math.PI * w) * 0.025;
    }

    const flick = 1 + Math.sin(t * 47) * 0.015 + Math.sin(t * 13.3) * 0.025 + (Math.random() - 0.5) * 0.02;
    const pw = this.power;
    u.uLit.value = this.lit;
    u.uLamp.value = this.lampValue(t);
    u.uPower.value = pw;
    u.uFlick.value = flick;
    u.uWinner.value = w;
    u.uBlinds.value = this.blinds;
    u.uSignPower.value = this.signPower;
    u.uTube.value = this.tube;
    u.uScreenGain.value = Math.max(0, pw * (1 + (flick - 1) * 2) * 1.5);
    (u.uScreenCol.value as THREE.Color).set(0x6bff97).lerp(new THREE.Color(0xff3d7f), w);
    u.uBarrel.value = 0.06 * (1 - this.zoom);
    // Upprätningen börjar när skärmen fyller större delen av vyn och är klar vid full zoom
    u.uRect.value = THREE.MathUtils.smoothstep(this.zoom, 0.6, 1.0) * (1 - (u.uMix.value as number)) * (1 - THREE.MathUtils.smoothstep(w, 0, 0.15));
    u.uDirect.value = 0;

    // Bilens ljuskägla över väggarna var ~12–18 s
    const car = u.uCar.value as THREE.Vector2;
    if (this.carT < 0 && t > this.carNext && this.lit > 0.8) {
      this.carT = 0;
      this.onCarPass?.(5); // ljudet av bilen, samma längd som ljussvepet
    }
    if (this.carT >= 0) {
      this.carT += dt / 5;
      const k = this.carT;
      car.set(THREE.MathUtils.lerp(-0.1, 1.1, k), Math.sin(Math.PI * Math.min(k, 1)) ** 2);
      if (k >= 1) {
        this.carT = -1;
        car.set(-1, 0);
        this.carNext = t + 12 + Math.random() * 6;
      }
    }

    // Damm: rör sig som i kodrummet, kameran följer musen lite
    (this.dust.material as THREE.PointsMaterial).opacity = 0.22 * this.lit * (1 - this.zoom);
    const p = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, p.getY(i) + dt * 0.012 * (1 + (i % 5)));
      p.setX(i, p.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.01);
      if (p.getY(i) > 2.7) p.setY(i, 0.2);
    }
    p.needsUpdate = true;
    this.dustCam.position.set(this.mouseS.x * 0.06 * g, 1.25 + this.mouseS.y * 0.03 * g, 0.9);
    this.dustCam.lookAt(this.mouseS.x * 0.25 * g, 1.2, -1.6);

    // Skärm-textur ~12 fps
    this.screenAcc += dt;
    if (this.screenAcc > (this.screenState === 'reveal' ? 1 / 30 : 1 / 12)) {
      this.screenAcc = 0;
      if (pw > 0.01) this.drawScreen(t);
    }

    this.composer.render(dt);
  }
}
