import * as THREE from "three";
import type { Rgb, SkyState } from "@/lib/explore/sky";

/**
 * The Explore page's scene (owner, 2026-11-17): a sky that follows the
 * visitor's clock; a large sun and moon that turn on a wheel, up out of the
 * sea and down into it again; clouds in layers behind and in front of them;
 * a sea; and a grassy cliff on the right where flowers sometimes grow, with
 * wind through all of it. Kept out of React so three.js loads only when the
 * page mounts it; the page drives it through the methods below and hears
 * about a tapped flower through `onFlower`.
 *
 * The land and the clouds are painted after the owner's two reference
 * pictures. From the first, the colours: cream where the light falls,
 * lavender in the shade, yellow-greens for the grass. From the second, the
 * cliff: turf that rolls over its edge onto rock cut in flat planes, with a
 * warm colour worked into each light and a cool one into each shade, and
 * plants of several kinds and sizes on top. The shapes stay simple. Every
 * colour is written as it should appear on screen (the shaders work in sRGB
 * and skip three's colour conversion), so the scene matches the CSS fallback
 * behind it exactly.
 *
 * It is drawn in four passes, back to front, so the sun and moon can sit
 * between cloud layers: the sky and the far clouds; the sun and moon; the
 * near clouds, the sea and the land; then the wind and the rain.
 */

export interface ExploreScene {
  /** The sky's colours and where the sun and moon are. */
  setSky(sky: SkyState): void;
  /** How many flowers grow today, and which this visitor has already picked. */
  setFlowers(count: number, picked: readonly number[]): void;
  /** A flower was picked: it bursts into petals and goes. */
  popFlower(index: number): void;
  dispose(): void;
}

export interface ExploreSceneOptions {
  /** No drifting, swaying or falling: a still picture that follows the clock. */
  reducedMotion: boolean;
  /** A flower was tapped; the point is in page pixels. */
  onFlower: (index: number, at: { x: number; y: number }) => void;
}

const CAM_Y = 2.2;
const CAM_Z = 14;
/** The cliff stands close to the visitor, so its foot is under the bottom edge and only its top shows. */
const CLIFF_Z = 7;
const SEA_FAR = 230;
export const MAX_FLOWERS = 5;

/** The passes, back to front. */
const BACK = 0;
const BODIES = 1;
const FRONT = 2;
const OVER = 3;

/** How long the sun and moon take to turn up from the sea when the page opens. */
const RISE_SECONDS = 3.6;
/** Where on the wheel that turn starts: just under the horizon they rise from. */
const RISE_FROM = 202;

const v3 = (c: Rgb) => new THREE.Vector3(c[0], c[1], c[2]);
const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** A small repeatable random: the scene looks the same on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The wind's gusts: waves that travel left to right. The grass shader holds the same sum. */
function gustAt(x: number, z: number, t: number): number {
  const a = 0.5 + 0.5 * Math.sin(x * 1.5 + z * 0.7 - t * 2.3);
  const b = 0.5 + 0.5 * Math.sin(x * 0.5 - t * 1.15 + 1.7);
  return a * 0.55 + b * 0.45;
}

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

const SCREEN_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec2 vNdc;
uniform vec3 uTop, uMid, uHorizon, uGlow;
uniform vec2 uSunPos;
uniform float uHorizonY, uAspect, uTime, uStars, uSunStrength;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  float h = clamp((vNdc.y - uHorizonY) / (1.0 - uHorizonY), 0.0, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.46, h));
  col = mix(col, uTop, smoothstep(0.3, 1.0, h));

  // Stars: one, sometimes, per cell of a grid, twinkling.
  if (uStars > 0.01) {
    vec2 g = vNdc * vec2(uAspect, 1.0) * 30.0;
    vec2 id = floor(g);
    float r = hash(id);
    if (r > 0.9) {
      vec2 off = (vec2(hash(id + 1.3), hash(id + 7.1)) - 0.5) * 0.7;
      float d = length(fract(g) - 0.5 - off);
      float size = 0.035 + 0.06 * hash(id + 3.7);
      float twinkle = 0.65 + 0.35 * sin(uTime * (0.8 + r * 2.4) + r * 40.0);
      col += vec3(1.0, 0.97, 0.9) * smoothstep(size, 0.0, d) * twinkle * uStars * smoothstep(0.02, 0.35, h);
    }
  }

  // The sun's wide glow lies on the sky itself, behind every cloud.
  float rs = length((vNdc - uSunPos) * vec2(uAspect, 1.0));
  col = mix(col, uGlow, clamp(exp(-rs * 2.2) * 0.55, 0.0, 1.0) * uSunStrength);
  gl_FragColor = vec4(col, 1.0);
}`;

/** The sun and the moon: drawn after the far clouds and before the near ones. */
const BODIES_FRAG = /* glsl */ `
precision highp float;
varying vec2 vNdc;
uniform vec3 uSun, uGlow;
uniform vec2 uSunPos, uMoonPos;
uniform float uAspect, uSunR, uMoonR, uSunStrength, uMoonPhase, uMoonShow, uNight;

void over(inout vec4 base, vec3 c, float a) {
  base.rgb = mix(base.rgb, c, a);
  base.a = base.a + a * (1.0 - base.a);
}

void main() {
  vec4 col = vec4(uGlow, 0.0);

  // The sun: a broad flat disc with a soft ring of light around it.
  float rs = length((vNdc - uSunPos) * vec2(uAspect, 1.0)) / uSunR;
  float aaS = fwidth(rs) * 1.2;
  over(col, uGlow, exp(-max(rs - 1.0, 0.0) * 1.7) * 0.6 * uSunStrength);
  over(col, mix(uSun, uGlow, 0.35), (1.0 - smoothstep(1.16 - aaS, 1.16 + aaS, rs)) * 0.35 * uSunStrength);
  over(col, mix(uSun, vec3(1.0), 0.3 * (1.0 - min(rs * rs, 1.0))), (1.0 - smoothstep(1.0 - aaS, 1.0 + aaS, rs)) * uSunStrength);

  // The moon, in tonight's phase.
  vec2 m = (vNdc - uMoonPos) * vec2(uAspect, 1.0) / uMoonR;
  float rm = length(m);
  float aaM = fwidth(rm) * 1.2;
  over(col, vec3(0.8, 0.85, 1.0), exp(-max(rm - 1.0, 0.0) * 1.5) * 0.3 * uMoonShow * uNight);
  if (rm < 1.0 + aaM) {
    vec3 n = vec3(m, sqrt(max(0.0, 1.0 - rm * rm)));
    float a = uMoonPhase * 6.2831853;
    float lit = smoothstep(-0.03, 0.08, dot(n, vec3(sin(a), 0.0, -cos(a))));
    float seas = smoothstep(0.3, 0.22, length(m - vec2(-0.3, 0.28))) * 0.08
               + smoothstep(0.2, 0.14, length(m - vec2(0.3, -0.1))) * 0.07
               + smoothstep(0.15, 0.1, length(m - vec2(-0.05, -0.45))) * 0.06
               + smoothstep(0.11, 0.07, length(m - vec2(0.42, 0.42))) * 0.05;
    float disc = (1.0 - smoothstep(1.0 - aaM, 1.0 + aaM, rm)) * uMoonShow;
    // The dark side is a faint shape against the sky; the lit side is cream.
    over(col, vec3(0.62, 0.68, 0.9), disc * 0.22 * (1.0 - lit));
    over(col, vec3(1.0, 0.98, 0.9) - seas, disc * lit);
  }
  gl_FragColor = col;
}`;

const SEA_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SEA_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld;
uniform vec3 uDeep, uShallow, uHorizon, uGlow, uCam;
uniform vec2 uRes, uGlitterPos;
uniform float uTime, uAspect, uGlitter, uHorizonY;
${NOISE}
void main() {
  float dist = length(vWorld.xz - uCam.xz);
  float far = smoothstep(4.0, 150.0, dist);
  vec3 col = mix(uDeep, uShallow, smoothstep(0.0, 0.8, pow(far, 0.6)));
  col = mix(col, uHorizon, smoothstep(0.55, 1.0, far) * 0.9);

  // Slow swell lines, finer with distance, in patches.
  float swell = sin(vWorld.z * 1.1 + sin(vWorld.x * 0.22 + uTime * 0.35) * 1.6 + uTime * 0.55);
  float patches = smoothstep(0.3, 0.75, noise(vec2(vWorld.x * 0.12 + uTime * 0.04, vWorld.z * 0.5)));
  col += (uShallow - uDeep) * smoothstep(0.86, 1.0, swell) * patches * 0.2 * (1.0 - far);

  // The sun's (or moon's) path on the water.
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  float dx = (ndc.x - uGlitterPos.x) * uAspect;
  float below = clamp((uHorizonY - ndc.y) * 2.2, 0.0, 1.0);
  float column = exp(-dx * dx * mix(60.0, 9.0, below));
  float spark = smoothstep(0.5, 0.9, noise(vec2(vWorld.x * 1.3, vWorld.z * 3.2 - uTime * 1.2)));
  col = mix(col, uGlow, column * (0.2 + 0.65 * spark) * uGlitter * (1.0 - below * 0.6));
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * A cloud: round shapes that melt into one another (a metaball field), cut
 * flat along the bottom, drawn on a card that faces the visitor. Flat colour,
 * with a cream band along whichever side faces the sun or moon.
 */
const CLOUD_VERT = /* glsl */ `
varying vec2 vP;
uniform vec4 uBox; // the card in cloud units: half-width, bottom, top
void main() {
  vP = vec2(position.x * 2.0 * uBox.x, mix(uBox.y, uBox.z, position.y + 0.5));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const CLOUD_FRAG = /* glsl */ `
precision highp float;
varying vec2 vP;
uniform vec3 uBalls[8];
uniform vec3 uLit, uShade, uHaze;
uniform vec2 uLightPos, uRes;
uniform float uAspect, uFade, uSeed;
${NOISE}
float field(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < 8; i++) {
    vec3 b = uBalls[i];
    vec2 d = (p - b.xy) * vec2(1.0, 1.12);
    // Falling off fast, so each round keeps its shape and only the joins melt.
    f += pow(b.z * b.z / (dot(d, d) + 0.0001), 1.7);
  }
  // Flat along the bottom, like a cloud sitting on a shelf of air.
  return f * smoothstep(0.0, 0.2, p.y);
}

void main() {
  // Painted by hand: the outline wavers a little.
  vec2 p = vP + (vec2(noise(vP * 4.2 + uSeed), noise(vP * 4.2 + uSeed + 9.7)) - 0.5) * 0.07;
  // Capped, so the middle of each round (where the field runs away) stays solid.
  float f = min(field(p), 3.0);
  float aa = fwidth(f) * 1.1;
  float alpha = smoothstep(1.0 - aa, 1.0 + aa, f);
  if (alpha < 0.004) discard;

  // Light comes from where the sun or moon is on screen, and a little from above.
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec2 toLight = (uLightPos - ndc) * vec2(uAspect, 1.0);
  vec2 L = normalize(toLight + vec2(0.0, 0.35));
  // Step towards the light: where that soon leaves the cloud, this edge faces it.
  float edge = 1.0 - smoothstep(0.9, 1.3, field(p + L * 0.2));
  float body = 1.0 - smoothstep(0.8, 2.6, field(p + L * 0.46));
  float under = 1.0 - smoothstep(0.08, 0.5, p.y);
  float lit = clamp(edge + body * 0.55, 0.0, 1.0) * (1.0 - under * 0.8);
  // The light goes on thick, in short level dabs with broken edges; the shade is thinner paint.
  float dab = noise(vec2(p.x * 2.4 + uSeed, p.y * 6.5));
  lit = smoothstep(0.34, 0.5, lit + (dab - 0.5) * 0.34);
  vec3 col = mix(uShade * (1.0 + (dab - 0.5) * 0.07), uLit, lit);
  col = mix(col, uShade * 0.92, under * 0.3);
  gl_FragColor = vec4(mix(col, uHaze, uFade), alpha);
}`;

/** Painted leaves: three flat tones with a brushy edge between them, and two more colours dabbed in. */
const PAINT_TONE = /* glsl */ `
uniform vec3 uHi, uMid, uLo, uWarm, uCool, uLight;
uniform vec2 uGrain;
uniform vec3 uStroke; // brushwork: the strokes' angle, how fine they are, how strongly they show
${NOISE}
// Paint laid on in strokes, as in the reference pictures: long along their direction, thin across it.
float strokes(vec3 paint, float turn, float fine) {
  vec2 p = paint.xy + vec2(paint.z * 0.6, paint.z * 0.25);
  float c = cos(turn), s = sin(turn);
  vec2 q = vec2(c * p.x + s * p.y, c * p.y - s * p.x) * fine;
  return noise(vec2(q.x * 0.9, q.y * 5.5)) * 0.65 + noise(vec2(q.x * 2.3 + 3.1, q.y * 11.0)) * 0.35;
}
vec3 tone(vec3 n, vec3 paint) {
  float st = strokes(paint, uStroke.x, uStroke.y);
  float brush = (noise(paint.xy * uGrain.x + paint.z * 1.7) - 0.5) * uGrain.y + (st - 0.5) * uStroke.z;
  float s = dot(n, uLight) * 0.5 + 0.5 + brush + n.y * 0.1;
  // Firm edges between the tones, as a loaded brush leaves them.
  vec3 col = mix(uLo, uMid, smoothstep(0.39, 0.43, s));
  col = mix(col, uHi, smoothstep(0.67, 0.71, s));
  // Each stroke a touch lighter or darker than the one beside it.
  col *= 1.0 + (st - 0.5) * uStroke.z * 0.5;
  // A warm colour dabbed into the light and a cool one into the shade.
  float lit = smoothstep(0.4, 0.7, s);
  col = mix(col, uWarm, smoothstep(0.6, 0.66, strokes(paint + 5.3, uStroke.x - 0.8, uStroke.y * 0.7)) * (0.2 + 0.4 * lit));
  col = mix(col, uCool, smoothstep(0.62, 0.68, strokes(paint + 13.7, uStroke.x + 0.6, uStroke.y * 0.6)) * (0.5 - 0.35 * lit));
  return col;
}`;

const PAINT_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vPaint;
uniform vec3 uLandOrigin;
uniform float uLandInv;
void main() {
  #ifdef USE_INSTANCING
    mat4 m = modelMatrix * instanceMatrix;
  #else
    mat4 m = modelMatrix;
  #endif
  vec4 w = m * vec4(position, 1.0);
  vPaint = (w.xyz - uLandOrigin) * uLandInv;
  vNormal = normalize(transpose(inverse(mat3(m))) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const PAINT_FRAG = /* glsl */ `
precision highp float;
varying vec3 vNormal;
varying vec3 vPaint;
uniform vec3 uTint;
${PAINT_TONE}
void main() {
  gl_FragColor = vec4(tone(normalize(vNormal), vPaint) * uTint, 1.0);
}`;

/**
 * The cliff's two paints: turf and rock. Each is three flat tones laid in
 * strokes, with a warm colour worked into its light and a cool one into its
 * shade, the way the owner's reference pictures are painted. The blades of
 * grass use the turf's, so they are the colour of the ground they grow from.
 */
const LAND_TONE = /* glsl */ `
uniform vec3 uLight, uBounce;
uniform vec3 uGrassHi, uGrassMid, uGrassLo, uGrassWarm, uGrassCool;
uniform vec3 uRockHi, uRockMid, uRockLo, uRockWarm, uRockCool, uRockDeep;
uniform float uSeaY;
${NOISE}
// A dab of paint: long one way, thin the other.
float dab(vec2 p, float turn, float fine) {
  float c = cos(turn), s = sin(turn);
  vec2 q = vec2(c * p.x + s * p.y, c * p.y - s * p.x) * fine;
  return noise(vec2(q.x * 0.9, q.y * 5.5)) * 0.65 + noise(vec2(q.x * 2.3 + 3.1, q.y * 11.0)) * 0.35;
}
vec3 grassTone(vec3 n, vec3 p) {
  // The strokes lie along the ground.
  vec2 g = vec2(p.x + p.y * 0.4, p.z * 1.5 + p.y * 1.2);
  float st = dab(g, 0.3, 1.8);
  // Broad masses of light and dark first, then the strokes inside them.
  float mass = noise(g * 0.55 + 4.0) - 0.5;
  float s = 0.34 + 0.3 * (dot(n, uLight) * 0.5 + 0.5) + mass * 0.34 + (st - 0.5) * 0.3 + n.y * 0.06;
  vec3 col = mix(uGrassLo, uGrassMid, smoothstep(0.39, 0.43, s));
  col = mix(col, uGrassHi, smoothstep(0.66, 0.7, s));
  col *= 1.0 + (st - 0.5) * 0.14;
  float lit = smoothstep(0.42, 0.7, s);
  col = mix(col, uGrassWarm, smoothstep(0.6, 0.66, dab(g + 7.3, -0.4, 1.25)) * (0.18 + 0.5 * lit));
  col = mix(col, uGrassCool, smoothstep(0.62, 0.68, dab(g + 19.1, 0.8, 1.05)) * (0.6 - 0.45 * lit));
  return col;
}
vec3 rockTone(vec3 n, vec3 p) {
  // Round the wall, and up it.
  vec2 w = vec2(p.x + p.z * 0.6, p.y + p.z * 0.25);
  float st = dab(w, 0.06, 1.5);
  // Beds of rock: level bands, each its own shade, some with a dark crack under them.
  float layer = p.y * 3.1 + noise(vec2(w.x * 0.8, p.y * 0.5)) * 1.2;
  float bed = floor(layer);
  float s = mix(0.5, dot(n, uLight) * 0.5 + 0.5, 0.75) + (hash(vec2(bed, 7.0)) - 0.5) * 0.26 + (st - 0.5) * 0.22 + n.y * 0.16;
  vec3 col = mix(uRockLo, uRockMid, smoothstep(0.4, 0.44, s));
  col = mix(col, uRockHi, smoothstep(0.66, 0.7, s));
  col *= 1.0 + (st - 0.5) * 0.12;
  float lit = smoothstep(0.42, 0.7, s);
  col = mix(col, uRockWarm, smoothstep(0.62, 0.68, dab(w + 3.7, 0.5, 1.15)) * (0.2 + 0.4 * lit));
  col = mix(col, uRockCool, smoothstep(0.61, 0.67, dab(w + 11.9, -0.3, 0.95)) * (0.62 - 0.47 * lit));
  float f = fract(layer);
  col = mix(col, uRockDeep, 0.5 * step(0.5, hash(vec2(bed, 3.0))) * (1.0 - smoothstep(0.0, 0.07, f)));
  // The sea throws its own colour back up the foot of the rock.
  return mix(col, uBounce, 0.16 * (1.0 - smoothstep(uSeaY, uSeaY + 0.7, p.y)));
}`;

const LAND_VERT = /* glsl */ `
attribute float aDepth;
varying vec3 vNormal;
varying vec3 vPaint;
varying vec3 vWorld;
varying float vDepth;
uniform vec3 uLandOrigin;
uniform float uLandInv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vPaint = (w.xyz - uLandOrigin) * uLandInv;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vDepth = aDepth;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/**
 * A bluff: turf on top that hangs a little way down its own wall, and rock
 * below. Where one ends and the other begins is painted, not modelled: a
 * wavering line with a few long tongues of grass, so the two read as one
 * piece of land. The rock is shaded in flat planes, like blocks cut with a
 * palette knife.
 */
const LAND_FRAG = /* glsl */ `
precision highp float;
varying vec3 vNormal;
varying vec3 vPaint;
varying vec3 vWorld;
varying float vDepth;
uniform vec3 uTint;
uniform float uDrape;
${LAND_TONE}
void main() {
  vec3 p = vPaint;
  float along = p.x * 1.15 + p.z * 0.8;
  float hang = uDrape + 0.1 + 0.05 * sin(p.x * 2.3 + p.z * 1.1) + 0.04 * sin(p.z * 3.7 - p.x * 1.9 + 1.3)
             + 0.16 * pow(max(0.0, sin(along + 0.6)), 8.0) + 0.09 * pow(max(0.0, sin(along * 1.9 + 2.1)), 6.0)
             + (noise(vec2(p.x * 6.0 + p.z * 4.0, p.y * 5.0)) - 0.5) * 0.07
             + (noise(vec2(along * 9.0, 1.7)) - 0.5) * 0.12;
  float below = vDepth - hang;
  float aa = max(fwidth(below), 0.0005);
  float turf = 1.0 - smoothstep(-aa, aa, below);

  vec3 face = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(face, cameraPosition - vWorld) < 0.0) face = -face;
  vec3 rock = rockTone(face, p);
  // The turf's own shadow on the rock just under it.
  rock = mix(rock, uRockDeep, 0.7 * (1.0 - smoothstep(0.0, 0.22, below)));

  vec3 grass = grassTone(normalize(vNormal), p);
  // Turf that hangs over the edge is in its own shade.
  grass = mix(grass, uGrassLo * 0.92, 0.5 * smoothstep(0.05, 0.3, vDepth));

  gl_FragColor = vec4(mix(rock, grass, turf) * uTint, 1.0);
}`;

/**
 * A blade of grass. It takes the ground's own colour where it stands, so the
 * blades grow out of the patch rather than sit on it, and lightens to its
 * tip. The wind bends it in gusts that cross the cliff.
 */
const BLADE_VERT = /* glsl */ `
attribute vec3 aGround;
varying vec3 vGround;
varying vec3 vPaint;
varying float vH;
varying float vSeed;
uniform vec3 uLandOrigin;
uniform float uLandInv, uTime, uWind;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 root = m[3].xyz;
  vec3 at = (root - uLandOrigin) * uLandInv;
  float h = position.y;
  vec4 w = m * vec4(position, 1.0);
  float tall = length(m[1].xyz);
  float gust = (0.5 + 0.5 * sin(at.x * 1.5 + at.z * 0.7 - uTime * 2.3)) * 0.55
             + (0.5 + 0.5 * sin(at.x * 0.5 - uTime * 1.15 + 1.7)) * 0.45;
  float flutter = sin(uTime * 6.0 + at.x * 11.0 + at.z * 9.0) * 0.1;
  float bend = (0.18 + 0.95 * gust + flutter) * uWind * tall * h * h;
  w.x += bend;
  w.z += bend * 0.3;
  w.y -= bend * 0.4 * h;
  vH = h;
  vGround = normalize(mat3(modelMatrix) * aGround);
  vPaint = at;
  vSeed = fract(sin(dot(at.xz, vec2(12.9898, 78.233))) * 43758.5453);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BLADE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vGround;
varying vec3 vPaint;
varying float vH;
varying float vSeed;
uniform vec3 uTint, uTip;
${LAND_TONE}
void main() {
  vec3 col = grassTone(normalize(vGround), vPaint);
  // Most blades pale to their tip; some go to seed and tip gold.
  vec3 tip = mix(uTip, uGrassWarm, step(0.7, vSeed) * 0.85);
  col = mix(col, tip, vH * vH * (0.3 + 0.35 * vSeed));
  gl_FragColor = vec4(col * uTint, 1.0);
}`;

/** Two flat tones, for the flowers. */
const TOON_VERT = /* glsl */ `
varying vec3 vNormal;
void main() {
  vNormal = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

const TOON_FRAG = /* glsl */ `
precision highp float;
varying vec3 vNormal;
uniform vec3 uColor, uShade, uTint, uLight;
void main() {
  vec3 n = normalize(vNormal);
  float t = smoothstep(0.34, 0.62, mix(dot(n, uLight) * 0.5 + 0.5, n.y * 0.5 + 0.5, 0.35));
  gl_FragColor = vec4(mix(uShade, uColor, t) * uTint, 1.0);
}`;

/** A line of wind: a thin ribbon along which a short bright stretch travels. */
const WIND_VERT = /* glsl */ `
attribute float aAlong;
varying float vAlong;
uniform vec2 uOrigin, uHalf;
uniform float uSize;
void main() {
  // Placed in the camera's own space, so the lines cross the view whatever its shape.
  vAlong = aAlong;
  vec3 p = vec3(uOrigin * uHalf + position.xy * uSize, -10.0);
  gl_Position = projectionMatrix * vec4(p, 1.0);
}`;

const WIND_FRAG = /* glsl */ `
precision highp float;
varying float vAlong;
uniform vec3 uColor;
uniform float uHead, uOpacity;
void main() {
  float tail = 0.36;
  float a = smoothstep(uHead - tail, uHead - tail * 0.3, vAlong) * (1.0 - smoothstep(uHead - 0.05, uHead, vAlong));
  gl_FragColor = vec4(uColor, a * uOpacity);
}`;

const RAIN_VERT = /* glsl */ `
attribute float aTail;
uniform float uTime;
varying float vAlpha;
void main() {
  // Positions are in the camera's own space, so the rain always fills the view.
  vec3 p = position;
  float speed = 9.0 + fract(p.x * 13.7) * 3.0;
  p.y = mod(p.y - uTime * speed + 9.0, 18.0) - 9.0 + aTail * 0.3;
  p.x -= p.y * 0.08;
  vAlpha = (1.0 - aTail) * 0.9 + 0.1;
  gl_Position = projectionMatrix * vec4(p, 1.0);
}`;

const RAIN_FRAG = /* glsl */ `
precision highp float;
varying float vAlpha;
uniform vec3 uColor;
uniform float uOpacity;
void main() { gl_FragColor = vec4(uColor, vAlpha * uOpacity); }`;

type Uniforms = Record<string, THREE.IUniform>;

const FLOWER_COLOURS = ["#ff9cc2", "#fff6f0", "#ffd45c", "#b9a6ff", "#ff9078"];
/**
 * The flowers: where each grows on the patch, what kind it is, how tall its
 * stalk and how big it is beside the others. Tall ones stand behind short
 * ones, so none hides another.
 */
const FLOWERS = [
  { x: -1.2, z: 0.95, kind: "cosmos", stem: 0.52, size: 1.25 },
  { x: -0.55, z: 0.7, kind: "daisy", stem: 0.44, size: 1 },
  { x: -2.05, z: 1.0, kind: "buttercup", stem: 0.27, size: 0.8 },
  { x: -2.3, z: 0.0, kind: "pom", stem: 0.66, size: 0.95 },
  { x: -1.72, z: 0.35, kind: "tulip", stem: 0.56, size: 1.05 },
] as const;

/** The lines of wind: where each starts (as a share of the view), its size, and how often it blows. */
const WIND_LINES = [
  { x: -0.95, y: 0.34, length: 6.4, wave: 0.22, curl: 0.34, every: 9.5, after: 1.2 },
  { x: -0.55, y: -0.08, length: 5.2, wave: 0.16, curl: 0, every: 12, after: 5.4 },
  { x: -0.2, y: 0.55, length: 5.8, wave: 0.2, curl: 0.28, every: 14, after: 8.8 },
  { x: -1.05, y: -0.3, length: 6.8, wave: 0.14, curl: 0, every: 11, after: 3.1 },
] as const;

export function createExploreScene(host: HTMLElement, options: ExploreSceneOptions): ExploreScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = false;
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:manipulation";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  /** Puts an object, and everything in it, in one pass. */
  const into = <T extends THREE.Object3D>(pass: number, obj: T): T => {
    obj.traverse((o) => o.layers.set(pass));
    return obj;
  };
  const moving = !options.reducedMotion;

  // Uniforms shared by every material, so one write recolours the scene.
  const shared = {
    uTime: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uLight: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
    uHaze: { value: new THREE.Vector3(1, 1, 1) },
    uCloud: { value: new THREE.Vector3(1, 1, 1) },
    uCloudShade: { value: new THREE.Vector3(0.8, 0.9, 1) },
    uSeaLight: { value: new THREE.Vector3(0.4, 0.8, 0.9) },
    uLightPos: { value: new THREE.Vector2(0, 0.5) },
    uRes: { value: new THREE.Vector2(1, 1) },
    uAspect: { value: 1 },
    uLandOrigin: { value: new THREE.Vector3() },
    uLandInv: { value: 1 },
    /** How high the sea stands on the land, in the land's own measure. */
    uSeaY: { value: 0 },
  };

  // ------------------------------------------------------------------ sky
  const skyUniforms: Uniforms = {
    uTop: { value: new THREE.Vector3() },
    uMid: { value: new THREE.Vector3() },
    uHorizon: { value: new THREE.Vector3() },
    uGlow: { value: new THREE.Vector3() },
    uSunPos: { value: new THREE.Vector2(0, -2) },
    uHorizonY: { value: -0.2 },
    uAspect: shared.uAspect,
    uTime: shared.uTime,
    uStars: { value: 0 },
    uSunStrength: { value: 1 },
  };
  const screen = keep(new THREE.PlaneGeometry(2, 2));
  const sky = new THREE.Mesh(
    screen,
    keep(new THREE.ShaderMaterial({ vertexShader: SCREEN_VERT, fragmentShader: SKY_FRAG, uniforms: skyUniforms, depthTest: false, depthWrite: false })),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(into(BACK, sky));

  // ------------------------------------------------------------------ sun and moon
  const bodyUniforms: Uniforms = {
    uSun: { value: new THREE.Vector3() },
    uGlow: skyUniforms.uGlow!,
    uSunPos: skyUniforms.uSunPos!,
    uMoonPos: { value: new THREE.Vector2(0, -2) },
    uAspect: shared.uAspect,
    uSunR: { value: 0.14 },
    uMoonR: { value: 0.12 },
    uSunStrength: skyUniforms.uSunStrength!,
    uMoonPhase: { value: 0.5 },
    uMoonShow: { value: 0 },
    uNight: skyUniforms.uStars!,
  };
  const bodies = new THREE.Mesh(
    screen,
    keep(
      new THREE.ShaderMaterial({
        vertexShader: SCREEN_VERT,
        fragmentShader: BODIES_FRAG,
        uniforms: bodyUniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    ),
  );
  bodies.frustumCulled = false;
  scene.add(into(BODIES, bodies));

  // ------------------------------------------------------------------ sea
  const seaUniforms: Uniforms = {
    uDeep: { value: new THREE.Vector3() },
    uShallow: { value: new THREE.Vector3() },
    uHorizon: skyUniforms.uHorizon!,
    uGlow: skyUniforms.uGlow!,
    uCam: { value: new THREE.Vector3(0, CAM_Y, CAM_Z) },
    uRes: shared.uRes,
    uGlitterPos: { value: new THREE.Vector2(0, 0) },
    uTime: shared.uTime,
    uAspect: shared.uAspect,
    uGlitter: { value: 0 },
    uHorizonY: skyUniforms.uHorizonY!,
  };
  const sea = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(900, SEA_FAR + 40)),
    keep(new THREE.ShaderMaterial({ vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, uniforms: seaUniforms })),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0, CAM_Z + 20 - (SEA_FAR + 40) / 2);
  scene.add(into(FRONT, sea));

  // ------------------------------------------------------------------ clouds
  const card = keep(new THREE.PlaneGeometry(1, 1));
  const BOX = { half: 2.7, bottom: -0.15, top: 1.75 };
  const clouds: { mesh: THREE.Mesh; speed: number; span: number }[] = [];
  const cloudRandom = rng(7);
  /** Round shapes for one cloud: a big one in the middle, smaller ones stepping out and down, a bump on top. */
  const cloudShapes = (wide: number) => {
    const r = cloudRandom;
    const j = (n: number) => (r() - 0.5) * n;
    const balls = [new THREE.Vector3(j(0.2), 0.52, 0.6 + j(0.08))];
    const lobes = [
      [0.74, 0.42, 0.47],
      [-0.7, 0.38, 0.44],
      [1.34, 0.3, 0.34],
      [-1.26, 0.28, 0.32],
      [1.82, 0.2, 0.23],
      [-1.7, 0.2, 0.22],
    ] as const;
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i += 1) {
      const [x, y, radius] = lobes[i]!;
      balls.push(new THREE.Vector3((x + j(0.14)) * wide, y + j(0.06), radius + j(0.07)));
    }
    balls.push(new THREE.Vector3((r() < 0.5 ? -0.36 : 0.38) + j(0.2), 0.86 + j(0.1), 0.34 + j(0.06)));
    while (balls.length < 8) balls.push(new THREE.Vector3(0, -9, 0));
    return balls.slice(0, 8);
  };
  const addCloud = (pass: number, x: number, y: number, z: number, size: number, fade: number, parent: THREE.Object3D) => {
    const material = keep(
      new THREE.ShaderMaterial({
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        uniforms: {
          uBalls: { value: cloudShapes(0.92 + cloudRandom() * 0.22) },
          uBox: { value: new THREE.Vector4(BOX.half, BOX.bottom, BOX.top, 0) },
          uLit: shared.uCloud,
          uShade: shared.uCloudShade,
          uHaze: shared.uHaze,
          uLightPos: shared.uLightPos,
          uRes: shared.uRes,
          uAspect: shared.uAspect,
          uFade: { value: fade },
          uSeed: { value: cloudRandom() * 40 },
        },
        transparent: true,
        depthWrite: false,
      }),
    );
    const mesh = new THREE.Mesh(card, material);
    mesh.scale.set(BOX.half * 2 * size, (BOX.top - BOX.bottom) * size, 1);
    // The card's middle is above the cloud's flat base; lift it so `y` is the base.
    mesh.position.set(x, y + ((BOX.top + BOX.bottom) / 2) * size, z);
    mesh.frustumCulled = false;
    parent.add(into(pass, mesh));
    clouds.push({ mesh, speed: (0.3 + cloudRandom() * 0.3) * (60 / -z), span: 80 * (-z / 60) + size * 6 });
  };
  const fairClouds = new THREE.Group();
  const rainClouds = new THREE.Group();
  scene.add(fairClouds, rainClouds);
  // Far: small, pale, behind the sun and moon.
  for (const [x, y, z, s, f] of [
    [-46, 15, -118, 4.6, 0.55],
    [4, 24, -124, 5.6, 0.5],
    [50, 12, -112, 4.2, 0.6],
    [-14, 8, -128, 4.4, 0.66],
    [78, 27, -120, 5, 0.52],
  ] as const) {
    addCloud(BACK, x, y, z, s, f, fairClouds);
  }
  // Middle and near: larger, crossing in front of them.
  for (const [x, y, z, s, f] of [
    [-30, 10.5, -84, 5.4, 0.3],
    [34, 16, -80, 5.8, 0.26],
    [-64, 19, -88, 4.8, 0.34],
    [10, 6.4, -62, 4.2, 0.14],
    [-44, 5.2, -58, 3.8, 0.1],
    [62, 8, -64, 4.4, 0.16],
  ] as const) {
    addCloud(FRONT, x, y, z, s, f, fairClouds);
  }
  // Rain cloud: more of it, wider, across the top.
  for (const [x, y, z, s, f] of [
    [-34, 21, -78, 6.4, 0.3],
    [20, 24, -74, 7, 0.26],
    [58, 17, -86, 5.8, 0.38],
    [-70, 15, -92, 5.6, 0.42],
  ] as const) {
    addCloud(FRONT, x, y, z, s, f, rainClouds);
  }
  rainClouds.visible = false;

  // ------------------------------------------------------------------ the cliff
  const cliff = new THREE.Group();
  scene.add(cliff);
  const landRandom = rng(11);
  const between = (a: number, b: number) => a + (b - a) * landRandom();
  const ease = (a: number, b: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const up = new THREE.Vector3(0, 1, 0);

  /**
   * The land's colours, shared by the turf, the rock under it and the blades
   * that grow from it: the reference pictures' yellow-greens with gold worked
   * into the light and blue-green into the shade; cream and ochre rock with
   * orange in its light, and violet and dusty blue in its shade.
   */
  const landUniforms = {
    uGrassHi: { value: hex("#cbd86a") },
    uGrassMid: { value: hex("#86b455") },
    uGrassLo: { value: hex("#3f7c5a") },
    uGrassWarm: { value: hex("#edc95a") },
    uGrassCool: { value: hex("#2f8a82") },
    uRockHi: { value: hex("#efd6a6") },
    uRockMid: { value: hex("#b58a63") },
    uRockLo: { value: hex("#746a92") },
    uRockWarm: { value: hex("#d3935c") },
    uRockCool: { value: hex("#6c86b6") },
    uRockDeep: { value: hex("#463c60") },
    uLight: shared.uLight,
    uBounce: shared.uSeaLight,
    uSeaY: shared.uSeaY,
    uTint: shared.uTint,
    uLandOrigin: shared.uLandOrigin,
    uLandInv: shared.uLandInv,
  };

  /** A bluff: a grassy top that rolls over its edge into a wall of rock. Its outline is a reach in each direction from its middle. */
  type Bluff = { x: number; z: number; rim: (a: number) => number; top: (x: number, z: number) => number };
  /** How far the turf dips as it rolls over the edge. */
  const ROLL = 0.1;
  /** The ground on a bluff's top, and how far out towards its edge that is (1 at the edge). */
  const onTop = (b: Bluff, x: number, z: number) => {
    const s = Math.hypot(x - b.x, z - b.z) / b.rim(Math.atan2(z - b.z, x - b.x));
    return { y: b.top(x, z) - ROLL * ease(0.7, 1, s), s };
  };
  const normalOn = (b: Bluff, x: number, z: number) => {
    const e = 0.04;
    return new THREE.Vector3(onTop(b, x - e, z).y - onTop(b, x + e, z).y, 2 * e, onTop(b, x, z - e).y - onTop(b, x, z + e).y).normalize();
  };
  /** The wall, by how far down it: how far it stands out from the edge above. A nose of rock under the turf, an undercut, then a buttress. */
  const WALL: readonly (readonly [number, number])[] = [
    [0.07, 0.03],
    [0.18, 0.045],
    [0.34, 0.04],
    [0.54, -0.03],
    [0.8, -0.17],
    [1.12, -0.2],
    [1.55, -0.1],
    [2.2, 0.06],
    [3.0, 0.3],
  ];
  /** The rings of the top, as a share of the way out to the edge: closer together where the turf rolls over. */
  const CAP = [0, 0.3, 0.55, 0.74, 0.87, 0.95, 1];
  const AROUND = 64;
  const bluffGeometry = (b: Bluff, seed: number) => {
    // The same every visit, and the same at both ends of the seam.
    const jitter = (i: number, j: number, k: number) => {
      const v = Math.sin(i * 12.9898 + j * 78.233 + k * 37.719 + seed) * 43758.5453;
      return v - Math.floor(v) - 0.5;
    };
    const position: number[] = [];
    const depth: number[] = [];
    const index: number[] = [];
    const rows = CAP.length + WALL.length;
    for (let j = 0; j < rows; j += 1) {
      const w = j - CAP.length; // below 0 on the top; then one row of wall for each step down
      // The first rows of wall are turf and stay smooth. Below them the rock is in blocks, two or three columns
      // wide and a band deep, each standing a little further out or back than its neighbours: flat faces, with
      // a joint between one block and the next.
      const rough = w >= 2;
      const band = w <= 3 ? 0 : w <= 5 ? 1 : 2;
      for (let i = 0; i <= AROUND; i += 1) {
        const col = i % AROUND;
        const block = Math.floor((col + band * 3) / (band === 1 ? 2 : 3));
        const a = ((col + (rough ? jitter(col, band, 1) * 0.3 : 0)) / AROUND) * Math.PI * 2;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const r = b.rim(a);
        if (w < 0) {
          const s = CAP[j]!;
          const x = b.x + dx * r * s;
          const z = b.z + dz * r * s;
          position.push(x, onTop(b, x, z).y, z);
          depth.push(-(1 - s) * r);
        } else {
          const [down, out] = WALL[w]!;
          const edgeX = b.x + dx * r;
          const edgeZ = b.z + dz * r;
          // The nose stands further out in some places than others: buttresses.
          const stand = out * (w <= 3 ? 0.6 + 0.5 * (0.5 + 0.5 * Math.sin(a * 5 + seed)) : 1) + (rough ? jitter(block, band, 2) * 0.2 + jitter(col, j, 4) * 0.03 : 0);
          position.push(edgeX + dx * stand, onTop(b, edgeX, edgeZ).y - down + (rough ? jitter(block, j, 3) * 0.07 : 0), edgeZ + dz * stand);
          depth.push(down);
        }
      }
    }
    for (let j = 0; j < rows - 1; j += 1) {
      for (let i = 0; i < AROUND; i += 1) {
        const inner = j * (AROUND + 1) + i;
        const outer = inner + AROUND + 1;
        // Split each square the other way from its neighbours, so the planes do not all lean one way.
        if ((i + j) % 2) index.push(inner, inner + 1, outer + 1, inner, outer + 1, outer);
        else index.push(inner, inner + 1, outer, inner + 1, outer + 1, outer);
      }
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute("aDepth", new THREE.Float32BufferAttribute(depth, 1));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
  };

  /** A rounded outline with its own reach to each side, and a waver so it is not an oval. */
  const outline = (left: number, right: number, front: number, back: number, k: number) => (a: number) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const oval = 1 / Math.hypot(c / (c < 0 ? left : right), s / (s > 0 ? front : back));
    return oval * (1 + 0.07 * Math.sin(a * 3 + k) + 0.045 * Math.sin(a * 5 + k * 2.3) + 0.025 * Math.sin(a * 9 + k * 0.7));
  };
  /** The patch the flowers grow on. Its nose points out to sea on the left; its near edge is the cliff the visitor looks down. It rises to the right and to the back. */
  const PATCH: Bluff = {
    x: 0,
    z: 0,
    rim: outline(2.75, 3.2, 1.5, 2.3, 0.5),
    top: (x, z) => 1.78 + 0.05 * (x + 2.75) + 0.055 * (1.5 - z) + 0.04 * Math.sin(x * 1.7 + 0.4) * Math.sin(z * 1.3 + 1.1),
  };
  /** The headland behind it, a step higher, running off to the right. */
  const RIDGE: Bluff = {
    x: 4.2,
    z: -1.6,
    rim: outline(3.75, 3.75, 2.9, 2.9, 2.1),
    top: (x, z) => 2.34 + 0.04 * (x - 0.5) + 0.05 * Math.sin(x * 1.3 + 2) * Math.sin(z * 1.1),
  };
  const land = (b: Bluff, seed: number, drape: number) =>
    cliff.add(
      new THREE.Mesh(
        bluffGeometry(b, seed),
        keep(new THREE.ShaderMaterial({ vertexShader: LAND_VERT, fragmentShader: LAND_FRAG, uniforms: { ...landUniforms, uDrape: { value: drape } } })),
      ),
    );
  land(PATCH, 1.7, 0);
  // More of the step up to the headland is turf: it is a bank, not a second cliff.
  land(RIDGE, 4.3, 0.16);

  const underRidge = (x: number, z: number) => onTop(RIDGE, x, z).s < 1.03;
  /** The ground at a point: the headland where it stands, the patch elsewhere. */
  const ground = (x: number, z: number) => (onTop(RIDGE, x, z).s < 1 ? onTop(RIDGE, x, z).y : onTop(PATCH, x, z).y);
  /** Nothing further right than this is ever in view. */
  const SEEN = 2.6;
  /** A point on a bluff's top, anywhere on it. */
  const spot = (b: Bluff, reach = 0.97) => {
    const a = landRandom() * Math.PI * 2;
    const r = b.rim(a) * Math.sqrt(landRandom()) * reach;
    return [b.x + Math.cos(a) * r, b.z + Math.sin(a) * r] as const;
  };
  /** Not on top of a flower. */
  const clear = (x: number, z: number, by: number) => FLOWERS.every((f) => Math.hypot(f.x - x, f.z - z) > by);

  const painted = (o: { hi: string; mid: string; lo: string; warm: string; cool: string; grain: readonly [number, number]; stroke: readonly [number, number, number] }) =>
    keep(
      new THREE.ShaderMaterial({
        vertexShader: PAINT_VERT,
        fragmentShader: PAINT_FRAG,
        uniforms: {
          uHi: { value: hex(o.hi) },
          uMid: { value: hex(o.mid) },
          uLo: { value: hex(o.lo) },
          uWarm: { value: hex(o.warm) },
          uCool: { value: hex(o.cool) },
          uGrain: { value: new THREE.Vector2(...o.grain) },
          uStroke: { value: new THREE.Vector3(...o.stroke) },
          uLight: shared.uLight,
          uTint: shared.uTint,
          uLandOrigin: shared.uLandOrigin,
          uLandInv: shared.uLandInv,
        },
      }),
    );
  const blob = keep(new THREE.IcosahedronGeometry(1, 3));

  // Bushes behind the patch, rounded like the reference's, each its own size and build.
  const bushMat = painted({ hi: "#bccb58", mid: "#5d9a4c", lo: "#285e50", warm: "#e3cf62", cool: "#2a6f7a", grain: [2.4, 0.3], stroke: [0.9, 2.6, 0.34] });
  for (const [bx, bz, bs, squat, leaves] of [
    [1.25, -0.75, 0.5, 0.86, 5],
    [2.4, -0.4, 0.58, 0.8, 6],
    [0.2, -1.6, 0.4, 1.05, 4],
    [-0.9, -1.55, 0.26, 0.7, 3],
  ] as const) {
    const bush = new THREE.Group();
    for (let i = 0; i < leaves; i += 1) {
      const leaf = new THREE.Mesh(blob, bushMat);
      const r = bs * between(0.55, 0.95);
      leaf.scale.set(r, r * squat, r);
      leaf.position.set((landRandom() - 0.5) * bs * 1.3, r * 0.6 + landRandom() * bs * 0.35, (landRandom() - 0.5) * bs * 0.8);
      bush.add(leaf);
    }
    bush.position.set(bx, ground(bx, bz) - 0.1, bz);
    cliff.add(bush);
  }

  // Grass, in the ground's own colours: a short lawn, tufts of long grass, and a fringe that hangs over the cliff's edge.
  const bladeGeo = keep(new THREE.BufferGeometry());
  {
    // A tapering blade in three steps, leaning forward a little as it rises.
    const w = 0.03;
    const ring = [
      [w, 0, 0],
      [w * 0.72, 0.42, 0.05],
      [w * 0.42, 0.76, 0.14],
    ] as const;
    const p: number[] = [];
    ring.forEach(([half, y, z], i) => {
      const next = ring[i + 1];
      if (next) p.push(-half, y, z, half, y, z, -next[0], next[1], next[2], half, y, z, next[0], next[1], next[2], -next[0], next[1], next[2]);
      else p.push(-half, y, z, half, y, z, 0, 1, 0.26);
    });
    bladeGeo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  }
  type Blade = { at: THREE.Vector3; ground: THREE.Vector3; grow: THREE.Vector3; tall: number; wide: number };
  const sown: Blade[] = [];
  /** A blade on a bluff's top: partly upright, partly out from the ground, so the outline is soft with grass. */
  const sow = (b: Bluff, x: number, z: number, tall: number, wide = 1, splay?: THREE.Vector3) => {
    const n = normalOn(b, x, z);
    const grow = n.clone().lerp(up, 0.55);
    if (splay) grow.add(splay);
    sown.push({ at: new THREE.Vector3(x, onTop(b, x, z).y - 0.02, z), ground: n, grow: grow.normalize(), tall, wide });
  };
  const lawn = (b: Bluff, count: number) => {
    for (let n = 0, tries = 0; n < count && tries < count * 8; tries += 1) {
      const [x, z] = spot(b);
      if (x > SEEN || (b === PATCH && underRidge(x, z))) continue;
      // Gathered in tufts; now and then a blade twice the height of its neighbours.
      const tuft = 0.75 + 0.5 * Math.sin(x * 3.1) * Math.sin(z * 2.7);
      sow(b, x, z, between(0.09, 0.22) * tuft * (landRandom() < 0.12 ? 1.9 : 1));
      n += 1;
    }
  };
  lawn(PATCH, 3600);
  lawn(RIDGE, 520);
  // Tufts of long grass: a dozen or so blades from one root, fanning out.
  for (let n = 0, tries = 0; n < 22 && tries < 400; tries += 1) {
    const [x, z] = spot(PATCH, 0.9);
    if (x > SEEN || underRidge(x, z) || !clear(x, z, 0.4)) continue;
    const height = between(0.32, 0.6);
    const count = 9 + Math.floor(landRandom() * 9);
    for (let k = 0; k < count; k += 1) {
      const a = landRandom() * Math.PI * 2;
      const out = landRandom();
      const splay = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(out * 0.5);
      sow(PATCH, x + Math.cos(a) * out * 0.07, z + Math.sin(a) * out * 0.07, height * between(0.6, 1), 1.5, splay);
    }
    n += 1;
  }
  // The fringe: rooted on the lip and the first of the wall, growing out over the drop.
  const fringe = (b: Bluff, count: number) => {
    for (let n = 0, tries = 0; n < count && tries < count * 8; tries += 1) {
      const a = landRandom() * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const r = b.rim(a);
      const x = b.x + out.x * r;
      const z = b.z + out.z * r;
      if (x > SEEN || (b === PATCH && underRidge(x, z))) continue;
      const down = between(0, 0.12);
      const stand = 0.02 + down * 0.6;
      // One in four is long and droops over the rock.
      const long = landRandom() < 0.25;
      sown.push({
        at: new THREE.Vector3(x + out.x * stand, onTop(b, x, z).y - down, z + out.z * stand),
        ground: out.clone().multiplyScalar(0.5).add(up).normalize(),
        grow: out.clone().multiplyScalar(long ? between(1.6, 2.6) : between(0.7, 1.5)).add(up).normalize(),
        tall: long ? between(0.3, 0.46) : between(0.14, 0.32),
        wide: long ? 1.4 : 1.1,
      });
      n += 1;
    }
  };
  fringe(PATCH, 1100);
  fringe(RIDGE, 260);

  const bladeMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: BLADE_VERT,
      fragmentShader: BLADE_FRAG,
      uniforms: { ...landUniforms, uTip: { value: hex("#e3e88c") }, uTime: shared.uTime, uWind: { value: moving ? 0.55 : 0.2 } },
      side: THREE.DoubleSide,
    }),
  );
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, sown.length);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const lean = new THREE.Quaternion();
    const spin = new THREE.Quaternion();
    const size = new THREE.Vector3();
    const under = new Float32Array(sown.length * 3);
    sown.forEach((blade, i) => {
      lean.setFromUnitVectors(up, blade.grow);
      spin.setFromAxisAngle(up, landRandom() * Math.PI * 2);
      m.compose(blade.at, q.copy(lean).multiply(spin), size.set(blade.wide, blade.tall, 1));
      blades.setMatrixAt(i, m);
      under.set([blade.ground.x, blade.ground.y, blade.ground.z], i * 3);
    });
    bladeGeo.setAttribute("aGround", new THREE.InstancedBufferAttribute(under, 3));
  }
  blades.frustumCulled = false;
  cliff.add(blades);

  // ------------------------------------------------------------------ flowers and other plants
  const toon = (color: string, shade: THREE.Vector3) =>
    keep(
      new THREE.ShaderMaterial({
        vertexShader: TOON_VERT,
        fragmentShader: TOON_FRAG,
        uniforms: { uColor: { value: hex(color) }, uShade: { value: shade }, uTint: shared.uTint, uLight: shared.uLight },
      }),
    );
  const stemGeo = keep(new THREE.CylinderGeometry(0.018, 0.024, 1, 6));
  stemGeo.translate(0, 0.5, 0);
  const petalGeo = keep(new THREE.SphereGeometry(1, 12, 8));
  const stemMat = toon("#7fbf62", hex("#4a8f5c"));
  const centreMat = toon("#ffc93c", hex("#f09a2e"));
  const petalMats = FLOWER_COLOURS.map((c) => toon(c, hex(c).multiplyScalar(0.82)));

  // Low plants among the grass: a few broad leaves from one root, each plant its own size.
  {
    // Seen from this low, it is mostly their undersides that show: a middle green, not a dark one.
    const leafMat = toon("#a3cf5f", hex("#58a058"));
    const leaves: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const turn = new THREE.Euler();
    for (let n = 0, tries = 0; n < 11 && tries < 400; tries += 1) {
      const [x, z] = spot(PATCH, 0.88);
      if (x > SEEN || underRidge(x, z) || !clear(x, z, 0.32)) continue;
      const size = between(0.6, 1.6);
      const count = 4 + Math.floor(landRandom() * 4);
      const root = new THREE.Vector3(x, ground(x, z), z);
      for (let k = 0; k < count; k += 1) {
        const long = 0.16 * size * between(0.7, 1.15);
        // A leaf is long along its own z; turn it round the root, then lift its far end.
        q.setFromEuler(turn.set(-between(0.35, 0.95), (k / count) * Math.PI * 2 + landRandom(), 0, "YXZ"));
        const along = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        leaves.push(new THREE.Matrix4().compose(root.clone().addScaledVector(along, long * 0.9), q, new THREE.Vector3(long * 0.42, 0.014, long)));
      }
      n += 1;
    }
    const mesh = new THREE.InstancedMesh(petalGeo, leafMat, leaves.length);
    leaves.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.frustumCulled = false;
    cliff.add(mesh);
  }

  // Grass gone to seed: a thin stalk with a gold head, taller than the lawn, nodding in the wind.
  const reedMat = toon("#e9c56a", hex("#b98b48"));
  const reeds: THREE.Group[] = [];
  for (const [x, z, tall] of [
    [0.55, -0.45, 0.78],
    [0.7, -0.3, 0.6],
    [-0.3, -1.2, 0.7],
    [-2.05, -0.75, 0.55],
    [-1.9, -0.9, 0.72],
    [0.95, 0.35, 0.62],
    [-0.15, 0.2, 0.5],
  ] as const) {
    const root = new THREE.Group();
    const stalk = new THREE.Mesh(stemGeo, stemMat);
    stalk.scale.set(0.7, tall, 0.7);
    root.add(stalk);
    const seed = new THREE.Mesh(petalGeo, reedMat);
    seed.scale.set(0.03, 0.1, 0.03);
    seed.position.y = tall + 0.06;
    root.add(seed);
    root.position.set(x, ground(x, z) - 0.02, z);
    cliff.add(root);
    reeds.push(root);
  }

  type Flower = { root: THREE.Group; hit: THREE.Mesh; shown: boolean; picked: boolean; scale: number; size: number };
  const flowers: Flower[] = [];
  const hitGeo = keep(new THREE.SphereGeometry(0.42, 8, 6));
  const hitMat = keep(new THREE.MeshBasicMaterial({ visible: false }));
  FLOWERS.forEach((spec, i) => {
    const petalMat = petalMats[i % petalMats.length]!;
    const root = new THREE.Group();
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.scale.y = spec.stem;
    root.add(stem);
    const head = new THREE.Group();
    head.position.y = spec.stem;
    /** A ring of petals: each long along its own z, set out from the middle, its far end lifted by `cup`. */
    const ring = (count: number, reach: number, sx: number, sy: number, sz: number, cup = 0, lift = 0, parent: THREE.Object3D = head, mat: THREE.Material = petalMat) => {
      for (let p = 0; p < count; p += 1) {
        const arm = new THREE.Group();
        arm.rotation.y = (p / count) * Math.PI * 2;
        const petal = new THREE.Mesh(petalGeo, mat);
        petal.scale.set(sx, sy, sz);
        petal.position.set(0, lift, reach);
        petal.rotation.x = -cup;
        arm.add(petal);
        parent.add(arm);
      }
    };
    const centre = (r: number) => {
      const mesh = new THREE.Mesh(petalGeo, centreMat);
      mesh.scale.set(r, r * 0.65, r);
      mesh.position.y = 0.02;
      head.add(mesh);
    };
    if (spec.kind === "cosmos") {
      // Five broad petals, wide open.
      ring(5, 0.13, 0.115, 0.03, 0.15);
      centre(0.07);
      head.rotation.x = 0.95; // looks up and out at the visitor
    } else if (spec.kind === "daisy") {
      // Many thin petals round a big eye.
      ring(9, 0.145, 0.042, 0.02, 0.125);
      centre(0.088);
      head.rotation.x = 0.95;
    } else if (spec.kind === "buttercup") {
      // Small and cupped, close to the ground.
      ring(5, 0.07, 0.07, 0.03, 0.08, 0.4);
      centre(0.045);
      head.rotation.x = 0.75;
    } else if (spec.kind === "pom") {
      // A round head of many small florets, on a tall stalk.
      const ball = new THREE.Mesh(petalGeo, petalMat);
      ball.scale.setScalar(0.13);
      ball.position.y = 0.09;
      head.add(ball);
      const r = rng(i + 71);
      for (let k = 0; k < 9; k += 1) {
        const floret = new THREE.Mesh(petalGeo, petalMat);
        const a = r() * Math.PI * 2;
        const tilt = 0.25 + r() * 1.5;
        floret.scale.setScalar(0.05 + r() * 0.02);
        floret.position.set(Math.sin(tilt) * Math.cos(a) * 0.12, 0.09 + Math.cos(tilt) * 0.12, Math.sin(tilt) * Math.sin(a) * 0.12);
        head.add(floret);
      }
    } else {
      // A tulip: a cup of upright petals, and two long leaves from the root.
      ring(5, 0.05, 0.062, 0.034, 0.125, 1.2, 0.1);
      head.rotation.x = 0.22;
      ring(2, 0.13, 0.04, 0.012, 0.19, 1.05, 0.12, root, stemMat);
    }
    if (spec.kind !== "tulip" && spec.kind !== "buttercup") {
      // A leaf or two on the stalk.
      const leafy = new THREE.Group();
      leafy.position.y = spec.stem * 0.32;
      leafy.rotation.y = i * 2.1;
      ring(spec.kind === "pom" ? 2 : 1, 0.085, 0.032, 0.011, 0.1, 0.55, 0.03, leafy, stemMat);
      root.add(leafy);
    }
    root.add(head);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.y = spec.stem;
    hit.userData.flower = i;
    root.add(hit);
    root.position.set(spec.x, ground(spec.x, spec.z) - 0.02, spec.z);
    root.scale.setScalar(0);
    root.visible = false;
    cliff.add(root);
    flowers.push({ root, hit, shown: false, picked: false, scale: 0, size: spec.size });
  });
  into(FRONT, cliff);

  // Petals thrown up when a flower is picked.
  type Petal = { mesh: THREE.Mesh; v: THREE.Vector3; spin: number; born: number };
  const loose: Petal[] = [];

  // ------------------------------------------------------------------ wind
  const windColor = { value: new THREE.Vector3(1, 1, 1) };
  const windHalf = { value: new THREE.Vector2(1, 1) };
  const windSize = { value: 1 };
  const windLines = WIND_LINES.map((line) => {
    // A ribbon along a long shallow wave, with (for some) one curl in it.
    const steps = 96;
    const points: THREE.Vector2[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const p = new THREE.Vector2(u * line.length, Math.sin(u * Math.PI * 2 * 1.15) * line.wave);
      if (line.curl > 0) {
        const s = Math.min(1, Math.max(0, (u - 0.5) / 0.22));
        const turn = s * Math.PI * 2;
        p.x += -Math.sin(turn) * line.curl;
        p.y += (1 - Math.cos(turn)) * line.curl;
      }
      points.push(p);
    }
    const position: number[] = [];
    const along: number[] = [];
    const index: number[] = [];
    points.forEach((p, i) => {
      const a = points[Math.max(0, i - 1)]!;
      const b = points[Math.min(steps, i + 1)]!;
      const across = new THREE.Vector2(-(b.y - a.y), b.x - a.x).normalize();
      const u = i / steps;
      const half = 0.016 * Math.sqrt(Math.sin(Math.PI * u) + 0.02);
      position.push(p.x + across.x * half, p.y + across.y * half, 0, p.x - across.x * half, p.y - across.y * half, 0);
      along.push(u, u);
      if (i < steps) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    });
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 1));
    geometry.setIndex(index);
    const uniforms: Uniforms = {
      uOrigin: { value: new THREE.Vector2(line.x, line.y) },
      uHalf: windHalf,
      uSize: windSize,
      uColor: windColor,
      uHead: { value: -1 },
      uOpacity: { value: 0.5 },
    };
    const mesh = new THREE.Mesh(
      geometry,
      keep(
        new THREE.ShaderMaterial({
          vertexShader: WIND_VERT,
          fragmentShader: WIND_FRAG,
          uniforms,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      ),
    );
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(into(OVER, mesh));
    return { mesh, uniforms, line };
  });

  // ------------------------------------------------------------------ rain
  const DROPS = 420;
  const rainGeo = keep(new THREE.BufferGeometry());
  {
    const r = rng(23);
    const p = new Float32Array(DROPS * 6);
    const tail = new Float32Array(DROPS * 2);
    for (let i = 0; i < DROPS; i += 1) {
      const x = (r() - 0.5) * 30;
      const y = (r() - 0.5) * 18;
      const z = -3 - r() * 16;
      p.set([x, y, z, x, y, z], i * 6);
      tail.set([0, 1], i * 2);
    }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    rainGeo.setAttribute("aTail", new THREE.BufferAttribute(tail, 1));
  }
  const rainUniforms: Uniforms = { uTime: shared.uTime, uColor: { value: new THREE.Vector3(0.93, 0.96, 1) }, uOpacity: { value: 0 } };
  const rain = new THREE.LineSegments(
    rainGeo,
    keep(new THREE.ShaderMaterial({ vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, uniforms: rainUniforms, transparent: true, depthTest: false, depthWrite: false })),
  );
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(into(OVER, rain));

  // ------------------------------------------------------------------ layout
  let width = 1;
  let height = 1;
  let portrait = false;
  let skyState: SkyState | null = null;
  const probe = new THREE.Vector3();
  /** The wheel the sun and moon turn on: its hub on the horizon, and its reach, in screen units. */
  const wheel = { x: 0.4, y: -0.2, r: 0.66 };
  /** Where each is drawn now on the wheel, in degrees: it eases towards where the clock says. */
  const shown = { sun: 270, moon: 90, started: false, risen: 0, from: 0 };

  const nearest = (from: number, to: number) => from + ((((to - from) % 360) + 540) % 360) - 180;

  const placeBodies = () => {
    if (!skyState) return;
    const aspect = shared.uAspect.value;
    const at = (degrees: number, out: THREE.Vector2) => {
      const a = (degrees * Math.PI) / 180;
      out.set(wheel.x + (Math.cos(a) * wheel.r) / aspect, wheel.y + Math.sin(a) * wheel.r);
    };
    at(shown.sun, skyUniforms.uSunPos!.value as THREE.Vector2);
    at(shown.moon, bodyUniforms.uMoonPos!.value as THREE.Vector2);

    const sunHeight = Math.sin((shown.sun * Math.PI) / 180);
    const moonHeight = Math.sin((shown.moon * Math.PI) / 180);
    const sunUp = sunHeight > -0.04;
    const lightAt = (sunUp ? skyUniforms.uSunPos!.value : bodyUniforms.uMoonPos!.value) as THREE.Vector2;
    const lightHeight = sunUp ? sunHeight : moonHeight;
    (seaUniforms.uGlitterPos!.value as THREE.Vector2).copy(lightAt);
    shared.uLightPos.value.copy(lightAt);
    const low = 1 - Math.min(1, Math.max(0, (lightHeight - 0.15) / 0.7));
    seaUniforms.uGlitter!.value =
      lightHeight > -0.04 ? (sunUp ? (0.25 + 0.6 * low) * skyState.palette.sunStrength : 0.5 * skyState.moon.lit * skyState.palette.stars) : 0;
    // Light the land from where the sun (or moon) is on screen.
    shared.uLight.value.set(lightAt.x * 0.9, 0.35 + Math.max(0, lightHeight) * 0.9, 0.55).normalize();
    // A low sun looks bigger still.
    bodyUniforms.uSunR!.value = (portrait ? 0.092 : 0.14) * (1 + 0.16 * low);
    bodyUniforms.uMoonR!.value = portrait ? 0.08 : 0.12;
  };

  const layout = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    const aspect = width / height;
    portrait = aspect < 0.85;
    renderer.setSize(width, height, false);
    camera.fov = portrait ? 50 : 38;
    camera.aspect = aspect;
    const half = Math.tan((camera.fov * Math.PI) / 360);
    // Pitch the camera up so the horizon sits below the middle, leaving the sky to the words.
    const horizonNdc = portrait ? -0.3 : -0.2;
    camera.position.set(0, CAM_Y, CAM_Z);
    camera.rotation.set(Math.atan(-horizonNdc * half), 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // The sky meets the sea where the sea's far edge is drawn.
    probe.set(0, 0, CAM_Z - SEA_FAR).project(camera);
    skyUniforms.uHorizonY!.value = probe.y;
    shared.uAspect.value = aspect;
    renderer.getDrawingBufferSize(shared.uRes.value);

    // The wheel: as large a circle as fits between the horizon and the words, clear of the countdown.
    wheel.y = probe.y;
    if (portrait) {
      wheel.x = 0;
      wheel.r = Math.min(0.32, 0.8 * aspect);
    } else {
      // To the right of the countdown: they rise from the sea beside it and set into it, above the headland.
      wheel.x = 0.4;
      wheel.r = Math.min(0.68, 0.42 * aspect);
    }

    // The cliff keeps to the bottom right corner, whatever the shape of the screen: its grass under
    // the horizon, a little of its rock above the bottom edge, and the sea open over all of it.
    const halfWidth = (CAM_Z - CLIFF_Z) * half * aspect;
    const scale = portrait ? 0.44 : 0.78 * Math.min(1, Math.max(0.72, aspect / 1.6));
    const sunk = portrait ? 0 : 0.35;
    cliff.scale.setScalar(scale);
    cliff.position.set(halfWidth - (portrait ? 0.45 : 1.1) * scale, -sunk * scale, CLIFF_Z);
    shared.uLandOrigin.value.copy(cliff.position);
    shared.uLandInv.value = 1 / scale;
    shared.uSeaY.value = sunk;

    // The wind lines cross the view at a fixed depth in front of the camera.
    windHalf.value.set(10 * half * aspect, 10 * half);
    windSize.value = portrait ? 0.5 : Math.min(1.15, Math.max(0.8, aspect / 1.6));
    placeBodies();
  };

  // ------------------------------------------------------------------ input
  const raycaster = new THREE.Raycaster();
  raycaster.layers.set(FRONT);
  const pointer = new THREE.Vector2();
  const flowerUnder = (ev: PointerEvent | MouseEvent): number => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const live = flowers.filter((f) => f.shown && !f.picked && f.scale > 0.6).map((f) => f.hit);
    const first = raycaster.intersectObjects(live, false)[0];
    return first ? (first.object.userData.flower as number) : -1;
  };
  const onMove = (ev: PointerEvent) => {
    renderer.domElement.style.cursor = flowerUnder(ev) >= 0 ? "pointer" : "";
  };
  const onClick = (ev: MouseEvent) => {
    const i = flowerUnder(ev);
    if (i >= 0) options.onFlower(i, { x: ev.clientX, y: ev.clientY });
  };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("click", onClick);

  // ------------------------------------------------------------------ frame
  const clock = new THREE.Clock();
  let rainTarget = 0;
  let disposed = false;
  let dirty = true;

  const draw = () => {
    renderer.clear();
    for (const pass of [BACK, BODIES, FRONT, OVER]) {
      camera.layers.set(pass);
      renderer.render(scene, camera);
    }
  };

  const frame = () => {
    if (disposed) return;
    const dt = Math.min(0.05, clock.getDelta());
    if (moving) shared.uTime.value += dt;
    const t = shared.uTime.value;
    let animating = false;

    // The sun and moon: turning up out of the sea when the page opens, then keeping the clock's pace.
    if (skyState) {
      const rise = moving && shown.started ? 1 - Math.min(1, (shown.risen += dt) / RISE_SECONDS) : 0;
      const back = shown.from * rise * rise * rise;
      const sunTo = skyState.sun.wheel + back;
      const moonTo = skyState.moon.wheel + back;
      const ease = moving ? Math.min(1, dt * 3) : 1;
      const nextSun = shown.sun + (nearest(shown.sun, sunTo) - shown.sun) * (rise > 0 ? 1 : ease);
      const nextMoon = shown.moon + (nearest(shown.moon, moonTo) - shown.moon) * (rise > 0 ? 1 : ease);
      if (Math.abs(nextSun - shown.sun) > 0.001 || Math.abs(nextMoon - shown.moon) > 0.001) animating = true;
      shown.sun = nextSun;
      shown.moon = nextMoon;
      placeBodies();
    }

    if (moving) {
      for (const c of clouds) {
        c.mesh.position.x += c.speed * dt;
        if (c.mesh.position.x > c.span) c.mesh.position.x = -c.span;
      }
      for (const w of windLines) {
        const since = (((t - w.line.after) % w.line.every) + w.line.every) % w.line.every;
        const blowing = t > w.line.after && since < 2.8;
        w.mesh.visible = blowing;
        if (blowing) w.uniforms.uHead!.value = (since / 2.8) * 1.45 - 0.04;
      }
    }

    // Rain fades in and out rather than switching.
    const opacity = rainUniforms.uOpacity!.value as number;
    const nextOpacity = opacity + (rainTarget - opacity) * Math.min(1, dt * 1.5);
    rainUniforms.uOpacity!.value = Math.abs(rainTarget - nextOpacity) < 0.004 ? rainTarget : nextOpacity;
    rain.visible = moving && (rainUniforms.uOpacity!.value as number) > 0.01;

    for (const f of flowers) {
      const target = f.shown && !f.picked ? 1 : 0;
      if (f.scale !== target) {
        // Grow with a little overshoot; go quickly.
        const k = target ? 5 : 14;
        f.scale += (target - f.scale) * Math.min(1, dt * k);
        if (Math.abs(target - f.scale) < 0.004) f.scale = target;
        const s = target ? f.scale * (1 + 0.25 * Math.sin(f.scale * Math.PI)) : f.scale;
        f.root.scale.setScalar(s * f.size * (portrait ? 1.35 : 1));
        f.root.visible = f.scale > 0.001;
        animating = true;
      }
      // The whole flower leans with the gusts that cross the grass, stem and head together.
      if (moving && f.root.visible) {
        const p = f.root.position;
        const gust = gustAt(p.x, p.z, t);
        f.root.rotation.z = -(0.05 + 0.2 * gust) + Math.sin(t * 3.1 + p.x * 5) * 0.025;
        f.root.rotation.x = (gust - 0.5) * 0.1;
      }
    }
    if (moving) {
      for (const reed of reeds) {
        const p = reed.position;
        const gust = gustAt(p.x, p.z, t);
        reed.rotation.z = -(0.06 + 0.3 * gust) + Math.sin(t * 2.6 + p.x * 7) * 0.04;
        reed.rotation.x = (gust - 0.5) * 0.14;
      }
    }
    for (let i = loose.length - 1; i >= 0; i -= 1) {
      const p = loose[i]!;
      const age = t - p.born;
      p.v.y -= 2.2 * dt;
      p.v.x += 0.9 * dt; // carried off on the wind
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.z += p.spin * 0.7 * dt;
      p.mesh.scale.multiplyScalar(1 - dt * 0.9);
      animating = true;
      if (age > 1.4) {
        cliff.remove(p.mesh);
        loose.splice(i, 1);
      }
    }

    if (moving || dirty || animating) {
      draw();
      dirty = false;
    }
  };
  renderer.setAnimationLoop(frame);

  const onVisibility = () => {
    if (document.hidden) renderer.setAnimationLoop(null);
    else {
      clock.getDelta();
      renderer.setAnimationLoop(frame);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  const resizeObserver = new ResizeObserver(() => {
    layout();
    dirty = true;
  });
  resizeObserver.observe(host);
  layout();

  return {
    setSky(sky) {
      const first = !skyState;
      skyState = sky;
      if (first) {
        // Whichever is up tonight (or today) starts just under the horizon and turns up to its place.
        const lead = sky.sun.elevation > -6 || sky.moon.elevation < 0 ? sky.sun.wheel : sky.moon.wheel;
        shown.from = moving ? nearest(lead, RISE_FROM) - lead : 0;
        shown.sun = sky.sun.wheel + shown.from;
        shown.moon = sky.moon.wheel + shown.from;
        shown.started = true;
      }
      const p = sky.palette;
      (skyUniforms.uTop!.value as THREE.Vector3).copy(v3(p.top));
      (skyUniforms.uMid!.value as THREE.Vector3).copy(v3(p.mid));
      (skyUniforms.uHorizon!.value as THREE.Vector3).copy(v3(p.horizon));
      (skyUniforms.uGlow!.value as THREE.Vector3).copy(v3(p.glow));
      (bodyUniforms.uSun!.value as THREE.Vector3).copy(v3(p.sun));
      skyUniforms.uStars!.value = p.stars;
      skyUniforms.uSunStrength!.value = p.sunStrength;
      bodyUniforms.uMoonPhase!.value = sky.moon.phase;
      // The moon comes out with the stars; by day it is not drawn.
      bodyUniforms.uMoonShow!.value = Math.min(1, p.stars * 1.8);
      (seaUniforms.uDeep!.value as THREE.Vector3).copy(v3(p.seaDeep));
      (seaUniforms.uShallow!.value as THREE.Vector3).copy(v3(p.seaShallow));
      shared.uTint.value.copy(v3(p.tint));
      shared.uHaze.value.copy(v3(p.horizon));
      shared.uCloud.value.copy(v3(p.cloud));
      shared.uCloudShade.value.copy(v3(p.cloudShade));
      shared.uSeaLight.value.copy(v3(p.seaShallow));
      // Wind shows as pale lines by day and fainter ones at night.
      windColor.value.copy(v3(p.cloud)).lerp(new THREE.Vector3(1, 1, 1), 0.5);
      for (const w of windLines) w.uniforms.uOpacity!.value = 0.5 - 0.22 * p.stars;
      rainTarget = sky.raining ? 0.42 : 0;
      rainClouds.visible = sky.raining;
      placeBodies();
      dirty = true;
    },
    setFlowers(count, picked) {
      flowers.forEach((f, i) => {
        f.shown = i < count;
        f.picked = picked.includes(i);
      });
      dirty = true;
    },
    popFlower(index) {
      const f = flowers[index];
      if (!f || f.picked) return;
      f.picked = true;
      if (!moving) return;
      const r = rng(index + 31);
      for (let i = 0; i < 9; i += 1) {
        const mesh = new THREE.Mesh(petalGeo, petalMats[index % petalMats.length]!);
        mesh.layers.set(FRONT);
        mesh.scale.set(0.07, 0.022, 0.1);
        mesh.position.copy(f.root.position).add(new THREE.Vector3(0, f.hit.position.y, 0));
        cliff.add(mesh);
        const a = r() * Math.PI * 2;
        loose.push({ mesh, v: new THREE.Vector3(Math.cos(a) * (0.5 + r()), 1.4 + r() * 1.2, Math.sin(a) * 0.5 + 0.3), spin: 3 + r() * 5, born: shared.uTime.value });
      }
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("click", onClick);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
