// Shader för fotorummet: en eller två stillbilder med djupkarta.
// Allt ljusspel görs här ovanpå en upplyst bild: tändning (+ lampa), skärmspill och flimmer, vinnarton,
// bilens ljuskägla, levande CRT-skärm (homografi) och fönster med persienn + neonskylt.
// Bildkoordinater: p = (x, y) normaliserat 0–1, y nedåt (som pixlar). Texturer samplas med y uppåt.
//
// Fönstret finns i två varianter:
//  - fotopersienn (photoBlinds): persiennen i fotot packas ihop uppåt. Bakom den lånas glaset från fotots
//    nedre ruta (pane), och neonskylten lyser i det glaset.
//  - kodpersienn: lameller ritas här ovanpå en tom fönsteryta, skylten fyller fönstret (två-vy-läget).

export const plateVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const plateFragment = /* glsl */ `
precision highp float;
varying vec2 vUv;

struct Plate {
  vec2 c;          // vyns mittpunkt i bilden
  vec2 h;          // halva synliga utsträckningen (x, y) i bildenheter
  float aspect;    // bildens bredd/höjd
  float focus;     // djupet som står still vid musrörelse
  float exposure;
  float hasScreen;
  mat3 screenInv;  // bild -> skärm-uv
  mat3 screenFwd;  // skärm-uv -> bild
  vec2 screenC;
  float hasWindow;
  mat3 signInv;    // bild -> skylt-uv (ytan bakom persiennen)
  vec2 windowC;
  float photoBlinds;
  mat3 blindsInv;  // bild -> persienn-uv
  mat3 blindsFwd;  // persienn-uv -> bild
  mat3 paneFwd;    // persienn-uv -> nedre rutans glas (lånas bakom persiennen)
  float hasLamp;
  vec2 lamp;
};

uniform float uReady;
uniform Plate uA;
uniform Plate uB;
uniform sampler2D tA;
uniform sampler2D tADepth;
uniform sampler2D tB;
uniform sampler2D tBDepth;
uniform sampler2D tScreen;
uniform sampler2D tSign;
uniform sampler2D tBlinds;
uniform float uHasBlinds;

uniform vec2 uMouse;
uniform float uParallax;
uniform float uLit;
uniform float uLamp;
uniform float uPower;
uniform float uFlick;
uniform float uWinner;
uniform float uBlinds;
uniform float uSignPower;
uniform float uScreenGain;
uniform vec3 uScreenCol;
uniform vec2 uCar;
uniform float uBarrel;
uniform float uMix;       // 0 = vy A, 1 = vy B (två-vy-läget)
uniform vec2 uPanA;
uniform vec2 uPanB;
uniform float uBlur;
uniform float uDirect;    // (oanvänd, kvar för kompatibilitet)
uniform float uRect;      // 0 = vanlig vy, 1 = skärmen upprätad till exakt helbild (full zoom)
uniform vec2 uCover;

vec3 tex(sampler2D t, vec2 p) { return texture2D(t, vec2(p.x, 1.0 - p.y)).rgb; }
float dep(sampler2D t, vec2 p) { return texture2D(t, vec2(p.x, 1.0 - p.y)).r; }
vec2 homo(mat3 M, vec2 p) { vec3 q = M * vec3(p, 1.0); return q.xy / q.z; }

vec3 sampleBlur(sampler2D t, vec2 p, float b) {
  if (b < 1e-4) return tex(t, p);
  vec3 s = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    float o = (float(i) / 8.0 - 0.5) * b;
    s += tex(t, p + vec2(o, 0.0));
  }
  return s / 9.0;
}

vec2 parallax(sampler2D d, vec2 p, float focus) {
  vec2 off = uMouse * uParallax;
  float z = dep(d, p);
  vec2 q = p + off * (z - focus);
  z = dep(d, q);
  return p + off * (z - focus);
}

float insideMask(vec2 uv, vec2 aa) {
  vec2 e = smoothstep(vec2(0.0), aa, uv) * smoothstep(vec2(0.0), aa, 1.0 - uv);
  return e.x * e.y;
}

vec3 grade() { return mix(vec3(1.0), vec3(1.22, 0.8, 0.9), uWinner * 0.7); }

// Bilens strålkastare: ett mjukt band som sveper över väggarna (det som djupkartan säger ligger långt bort).
// Föremål nära kameran, som datorn, lämnas mörka. Djupkartan behöver skarpa kanter som följer konturerna,
// annars blir det en mörk ram runt föremålen (se docs/room/PROMPTS.md).
vec3 carLight(vec2 q, float z, vec3 base) {
  float band = exp(-pow((q.x - uCar.x) / 0.09, 2.0));
  float far = smoothstep(0.55, 0.15, z);
  return (base * 3.0 + 0.012) * band * far * uCar.y * vec3(0.84, 0.93, 1.0);
}

vec4 codeBlinds(float v, vec3 behind) {
  if (v > 0.955) return vec4(vec3(0.04, 0.034, 0.03) * (0.4 + 0.6 * uLit), 1.0);
  float f = fract(v * 26.0);
  float slat = 1.0 - smoothstep(0.58, 0.64, f);
  float curve = sin(3.14159 * clamp(f / 0.62, 0.0, 1.0));
  vec3 c = vec3(0.035, 0.03, 0.027) * (0.55 + 0.9 * curve) * (0.4 + 0.6 * uLit);
  c += behind * 0.25 * smoothstep(0.5, 0.62, f);
  return vec4(c, slat * 0.96);
}

vec3 shade(Plate P, sampler2D T, sampler2D D, vec2 ndc, vec2 pan) {
  vec2 p = P.c + pan + vec2(ndc.x * P.h.x, -ndc.y * P.h.y);
  // Sista delen av zoomen: vyn rätas gradvis upp längs skärmens homografi, så att skärmen vid full zoom
  // fyller fönstret exakt (cover). Ingen övertoning mellan två bilder, alltså inga dubbla konturer.
  float rect = uRect * P.hasScreen;
  if (rect > 0.0) {
    vec2 cuv = (vUv - 0.5) * uCover + 0.5;
    p = mix(p, homo(P.screenFwd, vec2(cuv.x, 1.0 - cuv.y)), rect);
  }
  vec2 q = parallax(D, p, P.focus);
  float z = dep(D, q);
  vec3 base = sampleBlur(T, q, uBlur) * P.exposure;

  // Rummets ljus: mörkt före tändningen. Lampan kan tändas före resten.
  float lampM = 0.0;
  if (P.hasLamp > 0.5) {
    vec2 dl = (q - P.lamp) * vec2(P.aspect, 1.0);
    lampM = exp(-dot(dl, dl) * 7.0);
  }
  float litLocal = max(uLit, lampM * uLamp);
  float roomK = mix(0.03, 1.0, litLocal);
  vec3 col = base * roomK * grade();

  // Bilden har redan skärmljuset inbakat: i upplyst läge bara flimmer ovanpå, i mörkt läge bär spillet hela ljuset
  if (P.hasScreen > 0.5) {
    vec2 da = (q - P.screenC) * vec2(P.aspect, 1.0);
    float spill = exp(-dot(da, da) * 3.0) * mix(0.35, 1.0, z);
    col += base * uScreenCol * spill * uPower * (uFlick - 1.0 + 0.12 + 1.1 * (1.0 - uLit));
  }
  col += carLight(q, z, base);
  if (P.hasWindow > 0.5) {
    vec2 dw = (q - P.windowC) * vec2(P.aspect, 1.0);
    col += base * vec3(1.0, 0.24, 0.5) * exp(-dot(dw, dw) * 6.0) * uSignPower * 1.2;
  }

  // Levande CRT-skärm: homografi + lätt fat-distorsion
  if (P.hasScreen > 0.5) {
    vec2 suv = homo(P.screenInv, q);
    vec2 cuv = suv - 0.5;
    vec2 buv = cuv * (1.0 + uBarrel * dot(cuv, cuv)) + 0.5;
    float m = insideMask(buv, fwidth(buv) * 1.5);
    vec3 sc = texture2D(tScreen, vec2(buv.x, 1.0 - buv.y)).rgb * uScreenGain;
    sc += max(0.0, 0.35 - (buv.x + buv.y) * 0.5) * 0.25 * uPower * (1.0 - rect);
    col = mix(col, sc, m);
  }

  // Fönster: persienn som dras upp, neonskylt bakom
  if (P.hasWindow > 0.5) {
    vec2 suv = homo(P.signInv, q);
    float inSign = insideMask(suv, fwidth(suv) * 1.5);
    vec3 sign = texture2D(tSign, vec2(suv.x, 1.0 - suv.y)).rgb;
    float bs = max(1.0 - 0.94 * uBlinds, 0.05);
    if (P.photoBlinds > 0.5) {
      vec2 buv = homo(P.blindsInv, q);
      float inB = insideMask(buv, fwidth(buv) * 1.5);
      vec3 behind = tex(T, homo(P.paneFwd, buv)) * P.exposure * roomK * grade();
      behind += sign * inSign * uSignPower * 1.6;
      vec3 w = behind;
      if (buv.y < bs) {
        vec2 src = homo(P.blindsFwd, vec2(buv.x, buv.y / bs));
        w = tex(T, src) * P.exposure * roomK * grade();
      }
      col = mix(col, w, inB);
    } else {
      vec3 behind = sign * (0.15 + 0.85 * uLit) * (1.0 + uSignPower * 1.2);
      vec3 w = behind;
      if (suv.y < bs) {
        vec4 bl = uHasBlinds > 0.5 ? texture2D(tBlinds, vec2(suv.x, 1.0 - suv.y / bs)) : codeBlinds(suv.y / bs, behind);
        w = mix(behind, bl.rgb, bl.a);
      }
      col = mix(col, w, inSign);
    }
  }
  return col;
}

void main() {
  if (uReady < 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 a = uMix < 0.999 ? shade(uA, tA, tADepth, ndc, uPanA) : vec3(0.0);
  vec3 b = uMix > 0.001 ? shade(uB, tB, tBDepth, ndc, uPanB) : vec3(0.0);
  vec3 col = mix(a, b, uMix);
  if (uDirect > 0.0) {
    vec2 cuv = (vUv - 0.5) * uCover + 0.5;
    col = mix(col, texture2D(tScreen, cuv).rgb * uScreenGain, uDirect);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
