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

export type ScreenState = 'off' | 'idle' | 'winner';

const HFOV = 62; // fast horisontell FOV: kompositionen håller sig i alla fönsterformat
const SCREEN_W = 0.48;
const SCREEN_H = SCREEN_W * 9 / 16;

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class Room {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;

  // Styrvärden (animeras med GSAP utifrån)
  power = 0; // skärmen
  lit = 0; // rummet
  zoom = 0; // 0 = rumsvy, 1 = skärmen fyller fönstret
  winner = 0; // 0 = scen 1, 1 = scen 3 (kameran mot fönstret)
  mouseGain = 1;
  paused = false;

  private mouse = new THREE.Vector2();
  private mouseS = new THREE.Vector2();
  // Scen 1: datorn centrerad. Scen 3: kameran riktad mot fönstret med persienn och neonskylt.
  private restPosIdle = new THREE.Vector3(0.3, 1.25, 0.9);
  private restTargetIdle = new THREE.Vector3(0.75, 1.15, -1.65);
  private restPosWin = new THREE.Vector3(-0.75, 1.5, 0.25);
  private restTargetWin = new THREE.Vector3(-1.0, 1.68, -2.27);
  /** Text som användaren skriver i prompten på skärmen. */
  promptText = '';
  promptSubmitted = false;
  private fitDist = 1;
  private screenGroup = new THREE.Group();
  private screenCenter = new THREE.Vector3(0.9, 1.2, -1.646);
  private screenNormal = new THREE.Vector3(0, 0, 1);

  private screenCanvas = document.createElement('canvas');
  private screenCtx = this.screenCanvas.getContext('2d')!;
  private screenTex: THREE.CanvasTexture;
  private screenMat: THREE.MeshBasicMaterial;
  screenState: ScreenState = 'off';
  private screenAcc = 0;
  private screenStart = 0;

  private ambient = new THREE.AmbientLight(0x1a3a44, 0);
  private screenLight = new THREE.PointLight(0x6bff97, 0, 6, 2);
  private screenSpot = new THREE.SpotLight(0x6bff97, 0, 6, 0.9, 0.7, 2);
  private blindsSpot = new THREE.SpotLight(0xff3d7f, 0, 9, 0.75, 0.6, 1.6);
  private fillTeal = new THREE.PointLight(0x2fd4e0, 0, 8, 2);
  private carLight = new THREE.SpotLight(0xd6ecff, 0, 14, 0.5, 0.8, 1.2);
  private windowMat: THREE.MeshBasicMaterial;
  private windowTex!: THREE.CanvasTexture;
  private signCanvas = document.createElement('canvas');
  private blindsMesh!: THREE.Mesh;
  /** 0 = persiennen nere, 1 = uppdragen. */
  blinds = 0;
  /** Neonskyltens ljusstyrka (0-1). */
  signPower = 0;
  private dust: THREE.Points;
  private ledGreen: THREE.Mesh;
  private ledPink: THREE.Mesh;
  private carNext = 5;
  private carT = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 40);
    this.scene.background = new THREE.Color(0x050403);
    this.scene.fog = new THREE.FogExp2(0x070a0c, 0.16);

    this.screenCanvas.width = 1920; // ritas i 1280x720-koordinater, skalas 1,5x för skärpa vid full zoom
    this.screenCanvas.height = 1080;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false });

    this.windowMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.ledGreen = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0x45f07a, toneMapped: false }));
    this.ledPink = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3d7f, toneMapped: false }));

    this.buildRoom();
    this.dust = this.buildDust();
    this.buildLights();

    // Efekter: bloom, kromatisk aberration, vinjett + korn
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new EffectPass(this.camera, new BloomEffect({ intensity: 0.85, luminanceThreshold: 0.75, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.7 })),
    );
    this.composer.addPass(
      new EffectPass(
        this.camera,
        new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0013, 0.0009), radialModulation: true, modulationOffset: 0.2 }),
      ),
    );
    const noise = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: true });
    noise.blendMode.opacity.value = 0.14;
    this.composer.addPass(new EffectPass(this.camera, new VignetteEffect({ offset: 0.25, darkness: 0.8 }), noise));

    window.addEventListener('mousemove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.drawScreen(0);
  }

  // ---------- Bygge ----------
  private buildRoom() {
    const r = rand(7);

    // Relieftextur (Deckard-väggen): koncentriska rektanglar i olivgrönt
    const relief = canvasTexture(1024, 512, (g, w, h) => {
      g.fillStyle = '#2a2a14';
      g.fillRect(0, 0, w, h);
      const cell = 64;
      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          const n = 2 + Math.floor(r() * 4);
          for (let i = 0; i < n; i++) {
            const inset = 4 + i * 8;
            g.strokeStyle = `rgba(${90 + r() * 40},${90 + r() * 30},40,${0.5 + r() * 0.4})`;
            g.lineWidth = 3;
            g.strokeRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);
          }
        }
      }
    });
    relief.wrapS = relief.wrapT = THREE.RepeatWrapping;
    relief.repeat.set(2, 1);

    const concrete = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#15130f';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const v = 20 + r() * 40;
        g.fillStyle = `rgba(${v},${v},${v * 0.9},${0.2 + r() * 0.3})`;
        g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
      }
    });
    concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
    concrete.repeat.set(4, 4);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x23201a, roughness: 0.95, side: THREE.BackSide });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0c0b09, roughness: 1, side: THREE.BackSide });
    const floorMat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.55, metalness: 0.1, side: THREE.BackSide });
    const backMat = new THREE.MeshStandardMaterial({ map: relief, bumpMap: relief, bumpScale: 3, roughness: 0.9, side: THREE.BackSide });
    const box = new THREE.Mesh(new THREE.BoxGeometry(6, 2.8, 6.4), [wallMat, wallMat, ceilMat, floorMat, wallMat, backMat]);
    box.position.set(0, 1.4, 0.9);
    box.receiveShadow = true;
    this.scene.add(box);

    const dark = new THREE.MeshStandardMaterial({ color: 0x120f0c, roughness: 0.8 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.7 });
    const beige = new THREE.MeshStandardMaterial({ color: 0xd9cbb0, roughness: 0.6 });
    const beigeDark = new THREE.MeshStandardMaterial({ color: 0xb9a98a, roughness: 0.7 });
    const add = (m: THREE.Mesh, x: number, y: number, z: number) => {
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };

    // Skrivbord
    add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.8), wood), 0.9, 0.75, -1.9);
    for (const [x, z] of [[0.05, -1.55], [1.75, -1.55], [0.05, -2.25], [1.75, -2.25]]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), dark), x, 0.36, z);
    }
    // Datorlåda + CRT
    add(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.13, 0.44), beige), 0.9, 0.845, -1.85);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.54, 0.5), beige), 0.9, 1.18, -1.9);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), beigeDark), 0.9, 1.18, -2.2); // bakre del
    // Skärmbezel (mörk ram) + skärm
    add(new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W + 0.05, SCREEN_H + 0.06, 0.01), dark), 0.9, 1.2, -1.6535);
    this.screenGroup.position.copy(this.screenCenter);
    this.screenGroup.rotation.y = 0;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), this.screenMat);
    this.screenGroup.add(screen);
    // Svag glasreflektion
    const glare = new THREE.Mesh(
      new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(128, 72, (g, w, h) => {
          const gr = g.createLinearGradient(0, 0, w, h);
          gr.addColorStop(0, 'rgba(255,255,255,0.35)');
          gr.addColorStop(0.35, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.fillRect(0, 0, w, h);
        }),
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glare.position.z = 0.002;
    this.screenGroup.add(glare);
    this.scene.add(this.screenGroup);
    // Normal = skärmens riktning i världen
    this.screenNormal.set(0, 0, 1).applyEuler(this.screenGroup.rotation);

    // LED:er
    this.ledGreen.position.set(1.17, 0.96, -1.645);
    this.ledPink.position.set(1.14, 0.96, -1.645);
    this.scene.add(this.ledGreen, this.ledPink);
    // Etikett-list
    add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.01), beigeDark), 1.1, 0.9, -1.64);

    // Tangentbord
    const keys = canvasTexture(256, 96, (g, w, h) => {
      g.fillStyle = '#cbbd9f';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#9d9177';
      for (let y = 6; y < h - 10; y += 18) for (let x = 8; x < w - 14; x += 16) g.fillRect(x, y, 13, 14);
    });
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.025, 0.16), [beige, beige, new THREE.MeshStandardMaterial({ map: keys, roughness: 0.7 }), beige, beige, beige]);
    add(kb, 0.75, 0.79, -1.5).rotation.x = 0.08;


    // Hylla med apparater (vänster bak)
    add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.35), wood), -2.0, 0.95, -2.1);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 0.28), beigeDark), -2.4, 1.12, -2.1);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.25), dark), -1.9, 1.08, -2.1);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), dark), -2.3, 0.45, -1.9);

    // Fönster: neonglöd bakom, persienn (slats) framför. Persiennen kan dras upp, skylten visar repots namn.
    const WW = 1.6;
    const WH = 1.1;
    this.signCanvas.width = 1024;
    this.signCanvas.height = 704;
    this.windowTex = new THREE.CanvasTexture(this.signCanvas);
    this.windowTex.colorSpace = THREE.SRGBColorSpace;
    this.windowMat.map = this.windowTex;
    this.windowMat.needsUpdate = true;
    this.drawSign(null);
    const windowMesh = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), this.windowMat);
    windowMesh.position.set(-1.0, 1.65, -2.27);
    this.scene.add(windowMesh);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(WW + 0.1, WH + 0.1, 0.04), dark);
    frame.position.set(-1.0, 1.65, -2.3);
    this.scene.add(frame);
    const slats = canvasTexture(256, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(8,6,6,0.92)';
      for (let y = 2; y < h - 26; y += 20) g.fillRect(0, y, w, 12);
      g.fillStyle = '#100d0b';
      g.fillRect(0, h - 24, w, 24); // nedre list
    });
    this.blindsMesh = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshBasicMaterial({ map: slats, transparent: true, toneMapped: false }));
    this.blindsMesh.position.set(-1.0, 1.65, -2.262);
    this.scene.add(this.blindsMesh);
  }

  /** Ritar fönstrets glöd. Utan namn: neonglöd. Med namn: mörk natt med en neonskylt. */
  private drawSign(name: string | null) {
    const g = this.signCanvas.getContext('2d')!;
    const w = 1024;
    const h = 704;
    if (!name) {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#3d7bff');
      gr.addColorStop(0.5, '#ff3d7f');
      gr.addColorStop(1, '#2fd4e0');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    } else {
      g.fillStyle = '#080510';
      g.fillRect(0, 0, w, h);
      const hz = g.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, w * 0.62);
      hz.addColorStop(0, 'rgba(255,61,127,0.22)');
      hz.addColorStop(1, 'rgba(8,5,16,0)');
      g.fillStyle = hz;
      g.fillRect(0, 0, w, h);
      let size = 300;
      const font = (px: number) => `${px}px "Replica LL", "Helvetica Neue", Arial, sans-serif`;
      g.font = font(size);
      while (g.measureText(name).width > w * 0.84 && size > 60) {
        size -= 8;
        g.font = font(size);
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      const y = h / 2 + size * 0.04;
      // neonrör: brett sken, rosa rör, vit het kärna
      g.shadowColor = '#ff3d7f';
      g.shadowBlur = 70;
      g.lineWidth = 16;
      g.strokeStyle = '#ff3d7f';
      g.strokeText(name, w / 2, y);
      g.shadowBlur = 26;
      g.lineWidth = 9;
      g.strokeStyle = '#ff7aa8';
      g.strokeText(name, w / 2, y);
      g.shadowBlur = 0;
      g.lineWidth = 3.5;
      g.strokeStyle = '#fff1f6';
      g.strokeText(name, w / 2, y);
    }
    this.windowTex.needsUpdate = true;
  }

  /** Sätt (eller ta bort) neonskylten bakom persiennen. */
  setSign(name: string | null) {
    this.drawSign(name);
  }

  private buildDust() {
    const n = 500;
    const pos = new Float32Array(n * 3);
    const r = rand(3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 5;
      pos[i * 3 + 1] = 0.2 + r() * 2.4;
      pos[i * 3 + 2] = -2 + r() * 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.012, color: 0xcfe9ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.scene.add(pts);
    return pts;
  }

  private buildLights() {
    this.scene.add(this.ambient);

    this.screenLight.position.set(0.9, 1.2, -1.3);
    this.scene.add(this.screenLight);

    this.screenSpot.position.copy(this.screenCenter).add(new THREE.Vector3(0, 0, 0.05));
    this.screenSpot.target.position.set(0.9, 0.5, -0.3);
    this.scene.add(this.screenSpot, this.screenSpot.target);

    // Persiennljus: gobo med strimmor, kastar ränder över golv och vägg
    const gobo = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff';
      for (let y = 6; y < h; y += 22) g.fillRect(0, y, w, 11);
    }, false);
    this.blindsSpot.position.set(-1.0, 1.65, -2.15);
    this.blindsSpot.target.position.set(0.7, 0.8, -1.2);
    this.blindsSpot.map = gobo;
    this.blindsSpot.castShadow = true;
    this.blindsSpot.shadow.mapSize.set(512, 512);
    this.scene.add(this.blindsSpot, this.blindsSpot.target);

    this.fillTeal.position.set(-1.5, 1.2, -1.2);
    this.scene.add(this.fillTeal);

    this.carLight.position.set(-2.9, 1.0, 0.9);
    this.carLight.target.position.set(-2, 1.3, -2.3);
    this.scene.add(this.carLight, this.carLight.target);
  }

  // ---------- Skärminnehåll ----------
  private drawScreen(t: number) {
    const g = this.screenCtx;
    g.setTransform(1.5, 0, 0, 1.5, 0, 0);
    const w = 1280;
    const h = 720;
    const winner = this.screenState === 'winner';
    const main = winner ? '#ff7aa8' : '#6bff97';
    g.fillStyle = winner ? '#1a0610' : '#04140a';
    g.fillRect(0, 0, w, h);
    if (this.screenState !== 'off') {
      g.shadowColor = main;
      g.shadowBlur = 14;
      g.fillStyle = main;
      g.textBaseline = 'top';
      if (winner) {
        g.font = '200px "DotGothic16", monospace';
        g.fillText('優勝', 70, 80);
        g.font = '64px VT323, monospace';
        g.fillText('> project selected_', 80, 400);
        g.fillText('> ' + (Math.floor(t * 2) % 2 ? 'access granted' : 'access granted_'), 80, 480);
      } else {
        g.font = '66px VT323, monospace';
        const lines = ['> hackathon os 26.11', '> scanning repos ........ ok', '> contributors ......... ok', '> judging .............. ready'];
        const since = t - this.screenStart;
        const visible = Math.min(lines.length, Math.floor(since * 2.2));
        lines.slice(0, visible).forEach((l, i) => g.fillText(l, 50, 40 + i * 76));
        if (since > 1.9) {
          // Prompten: användarens text syns här (max 36 tecken per rad)
          const cursor = this.promptSubmitted ? '' : Math.floor(t * 2) % 2 ? '_' : ' ';
          const text = '> ' + this.promptText + cursor;
          const chunks: string[] = [];
          for (let k = 0; k < text.length; k += 36) chunks.push(text.slice(k, k + 36));
          chunks.forEach((c, i) => g.fillText(c, 50, 400 + i * 76));
          if (this.promptSubmitted) g.fillText('> executing ...', 50, 400 + chunks.length * 76);
        }
      }
      g.shadowBlur = 0;
    }
    // Scanlines + vinjett på skärmytan
    g.fillStyle = 'rgba(0,0,0,0.32)';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1.6);
    const vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    this.screenTex.needsUpdate = true;
  }

  /** Rita om skärmen direkt (för att tangenttryck ska synas utan fördröjning). */
  refreshScreen(t: number) {
    this.drawScreen(t);
  }

  /** Starta om skärmens inskrivna rader (när man kommer tillbaka till rummet). */
  restartScreen(now: number) {
    this.screenStart = now;
    this.drawScreen(now);
  }

  setScreenState(s: ScreenState, now: number) {
    if (s === this.screenState) return;
    this.screenState = s;
    this.screenStart = now;
    this.drawScreen(now);
  }

  // ---------- Kamera ----------
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    const aspect = w / h;
    const vfov = THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(HFOV) / 2) / aspect)),
      28,
      85,
    );
    this.camera.fov = vfov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    // Avstånd där skärmen precis täcker hela fönstret (cover)
    const t = Math.tan(THREE.MathUtils.degToRad(vfov) / 2);
    this.fitDist = Math.min(SCREEN_H / (2 * t), SCREEN_W / (2 * t * aspect)) * 0.985;
  }

  /** Är musen över datorskärmen (med marginal)? Används för klick som startar zoomen. */
  pointOnScreen(cx: number, cy: number, pad = 1.35) {
    const b = this.screenNdcBounds();
    const nx = (cx / window.innerWidth) * 2 - 1;
    const ny = -((cy / window.innerHeight) * 2 - 1);
    const mx = (b.minX + b.maxX) / 2;
    const my = (b.minY + b.maxY) / 2;
    return Math.abs(nx - mx) <= ((b.maxX - b.minX) / 2) * pad && Math.abs(ny - my) <= ((b.maxY - b.minY) / 2) * pad;
  }

  /** Skärmens hörn i NDC (för kontroll att text aldrig hamnar över skärmen). */
  screenNdcBounds() {
    const hw = SCREEN_W / 2;
    const hh = SCREEN_H / 2;
    const xs: number[] = [];
    const ys: number[] = [];
    this.camera.updateMatrixWorld();
    for (const [x, y] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
      const v = new THREE.Vector3(x, y, 0);
      this.screenGroup.localToWorld(v);
      v.project(this.camera);
      xs.push(v.x);
      ys.push(v.y);
    }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  // ---------- Loop ----------
  update(dt: number, t: number) {
    if (this.paused) return;
    this.mouseS.lerp(this.mouse, 1 - Math.exp(-dt * 3));
    const g = this.mouseGain * (1 - this.zoom);

    const rp = this.restPosIdle.clone().lerp(this.restPosWin, this.winner);
    const rt = this.restTargetIdle.clone().lerp(this.restTargetWin, this.winner);
    const pos = rp.add(new THREE.Vector3(this.mouseS.x * 0.06 * g, this.mouseS.y * 0.03 * g + Math.sin(t * 0.5) * 0.004 * (1 - this.zoom), 0));
    const tgt = rt.add(new THREE.Vector3(this.mouseS.x * 0.25 * g, this.mouseS.y * 0.12 * g, 0));
    const fitPos = this.screenCenter.clone().addScaledVector(this.screenNormal, this.fitDist);
    pos.lerp(fitPos, this.zoom);
    tgt.lerp(this.screenCenter, this.zoom);
    this.camera.position.copy(pos);
    this.camera.lookAt(tgt);

    // Ljus
    const lit = this.lit;
    const pw = this.power;
    const flick = 1 + Math.sin(t * 47) * 0.015 + Math.sin(t * 13.3) * 0.025 + (Math.random() - 0.5) * 0.02;
    const w = this.winner;

    const screenCol = new THREE.Color(0x6bff97).lerp(new THREE.Color(0xff3d7f), w);
    this.screenLight.color.copy(screenCol);
    this.screenSpot.color.copy(screenCol);
    this.screenLight.intensity = 0.4 * pw * flick;
    this.screenSpot.intensity = 0.35 * pw * flick;
    const sm = pw * (1 + (flick - 1) * 2) * 1.5;
    this.screenMat.color.setScalar(Math.max(0, sm));

    this.ambient.color.set(0x1a3a44).lerp(new THREE.Color(0x4a2a18), w);
    this.ambient.intensity = 0.02 + 0.55 * lit;
    this.blindsSpot.color.set(0xff3d7f).lerp(new THREE.Color(0xffb15c), w * 0.6);
    this.blindsSpot.intensity = 10 * lit * (1 + Math.sin(t * 0.6) * 0.08);
    this.fillTeal.intensity = 0.7 * lit;
    this.windowMat.color.setScalar((0.15 + 0.85 * lit) * (1 + this.signPower * 1.2));
    const bs = Math.max(1 - 0.94 * this.blinds, 0.02);
    this.blindsMesh.scale.y = bs;
    this.blindsMesh.position.y = 2.2 - (1.1 * bs) / 2; // förankrad i överkanten, slatsen packas ihop uppåt
    (this.dust.material as THREE.PointsMaterial).opacity = 0.55 * lit;

    // LED-blink
    (this.ledGreen.material as THREE.MeshBasicMaterial).color.setScalar(pw * 1.4).multiply(new THREE.Color(0x45f07a));
    (this.ledPink.material as THREE.MeshBasicMaterial).color.setScalar(pw * (Math.sin(t * 2.2) > 0.2 ? 1.6 : 0.2)).multiply(new THREE.Color(0xff3d7f));

    // Bilens ljuskägla över bakväggen var ~12–18 s
    if (this.carT < 0 && t > this.carNext && lit > 0.8) this.carT = 0;
    if (this.carT >= 0) {
      this.carT += dt / 5;
      const k = this.carT;
      this.carLight.target.position.set(-2.8 + k * 6, 1.3, -2.3);
      this.carLight.intensity = 40 * Math.sin(Math.PI * Math.min(k, 1)) ** 2;
      if (k >= 1) {
        this.carT = -1;
        this.carLight.intensity = 0;
        this.carNext = t + 12 + Math.random() * 6;
      }
    }

    // Damm
    const p = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, p.getY(i) + dt * 0.012 * (1 + (i % 5)));
      p.setX(i, p.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.01);
      if (p.getY(i) > 2.7) p.setY(i, 0.2);
    }
    p.needsUpdate = true;

    // Skärm-textur ~12 fps
    this.screenAcc += dt;
    if (this.screenAcc > 1 / 12) {
      this.screenAcc = 0;
      if (pw > 0.01) this.drawScreen(t);
    }

    this.composer.render(dt);
  }
}
