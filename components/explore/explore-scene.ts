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
 * The land and the clouds are painted in the colours of the owner's
 * reference picture: cream where the light falls, lavender in the shade,
 * yellow-greens for the grass. Every colour is written as it should appear
 * on screen (the shaders work in sRGB and skip three's colour conversion), so
 * the scene matches the CSS fallback behind it exactly.
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
const CLIFF_Z = 5;
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
uniform float uAspect, uFade;

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
  // Capped, so the middle of each round (where the field runs away) stays solid.
  float f = min(field(vP), 3.0);
  float aa = fwidth(f) * 1.1;
  float alpha = smoothstep(1.0 - aa, 1.0 + aa, f);
  if (alpha < 0.004) discard;

  // Light comes from where the sun or moon is on screen, and a little from above.
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec2 toLight = (uLightPos - ndc) * vec2(uAspect, 1.0);
  vec2 L = normalize(toLight + vec2(0.0, 0.35));
  // Step towards the light: where that soon leaves the cloud, this edge faces it.
  float edge = 1.0 - smoothstep(0.9, 1.3, field(vP + L * 0.2));
  float body = 1.0 - smoothstep(0.8, 2.6, field(vP + L * 0.46));
  float under = 1.0 - smoothstep(0.08, 0.5, vP.y);
  float lit = clamp(edge + body * 0.55, 0.0, 1.0) * (1.0 - under * 0.8);
  vec3 col = mix(uShade, uLit, lit);
  col = mix(col, uShade * 0.92, under * 0.3);
  gl_FragColor = vec4(mix(col, uHaze, uFade), alpha);
}`;

/** Painted land: three flat tones with a brushy edge between them. */
const PAINT_TONE = /* glsl */ `
uniform vec3 uHi, uMid, uLo, uLight, uBounce;
uniform vec2 uGrain;
uniform vec3 uFoot; // darker towards an edge: amount, from height, to height
uniform vec3 uCap;  // in shade under an overhang: amount, from height, to height
uniform float uStrata, uBounceAmt, uDirect;
${NOISE}
vec3 tone(vec3 n, vec3 paint) {
  // How much the tone follows the light rather than the surface's own pattern.
  float d = mix(0.5, dot(n, uLight) * 0.5 + 0.5, uDirect);
  float brush = (noise(paint.xy * uGrain.x + paint.z * 1.7) - 0.5) * uGrain.y;
  // Layers of rock: level bands of uneven depth, wavering as they run round, each its own shade.
  float layer = paint.y * 3.4 + noise(vec2((paint.x + paint.z) * 0.8, paint.y * 0.5)) * 1.3;
  float bed = floor(layer + 0.35 * sin(floor(layer) * 2.7));
  float strata = (hash(vec2(bed, 7.0)) - 0.5) * uStrata;
  float s = d + brush + strata + n.y * 0.1;
  vec3 col = mix(uLo, uMid, smoothstep(0.38, 0.44, s));
  col = mix(col, uHi, smoothstep(0.66, 0.72, s));
  col *= 1.0 - uFoot.x * (1.0 - smoothstep(uFoot.y, uFoot.z, paint.y));
  col = mix(col, uLo, uCap.x * smoothstep(uCap.y, uCap.z, paint.y));
  // The sea throws its own colour back up the foot of the rock.
  return mix(col, uBounce, uBounceAmt * (1.0 - smoothstep(0.0, 0.7, paint.y)));
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
 * A blade of grass. It takes the hill's own colour where it stands, so the
 * blades grow out of the patch rather than sit on it, and lightens to its
 * tip. The wind bends it in gusts that cross the hill.
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
${PAINT_TONE}
void main() {
  vec3 col = tone(normalize(vGround), vPaint);
  col = mix(col, uTip, vH * vH * (0.3 + 0.35 * vSeed));
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
/** Where the flowers grow: across the slope of the hill that faces the visitor. */
const FLOWER_SPOTS: readonly (readonly [number, number])[] = [
  [-1.25, 1.5],
  [-0.65, 1.05],
  [-1.9, 0.95],
  [-2.3, 0.3],
  [-1.5, 0.4],
];

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
    [-30, 10.5, -84, 4.4, 0.3],
    [34, 16, -80, 4.8, 0.26],
    [-64, 19, -88, 4, 0.34],
    [10, 6.4, -62, 3.6, 0.14],
    [-44, 5.2, -58, 3.2, 0.1],
    [62, 8, -64, 3.8, 0.16],
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

  const paint = (o: {
    hi: string;
    mid: string;
    lo: string;
    grain?: readonly [number, number];
    strata?: number;
    bounce?: number;
    foot?: readonly [number, number, number];
    cap?: readonly [number, number, number];
    direct?: number;
  }) => ({
    uHi: { value: hex(o.hi) },
    uMid: { value: hex(o.mid) },
    uLo: { value: hex(o.lo) },
    uLight: shared.uLight,
    uBounce: shared.uSeaLight,
    uGrain: { value: new THREE.Vector2(...(o.grain ?? [1.4, 0.16])) },
    uFoot: { value: new THREE.Vector3(...(o.foot ?? [0, 0, 1])) },
    uCap: { value: new THREE.Vector3(...(o.cap ?? [0, 0, 1])) },
    uStrata: { value: o.strata ?? 0 },
    uDirect: { value: o.direct ?? 1 },
    uBounceAmt: { value: o.bounce ?? 0 },
    uTint: shared.uTint,
    uLandOrigin: shared.uLandOrigin,
    uLandInv: shared.uLandInv,
  });
  const painted = (o: Parameters<typeof paint>[0]) =>
    keep(new THREE.ShaderMaterial({ vertexShader: PAINT_VERT, fragmentShader: PAINT_FRAG, uniforms: paint(o) }));

  // Rock: cream in the light, sand between, lavender in the shade, as the reference paints its shore.
  const ROCK = { hi: "#f6e7ca", mid: "#d2b292", lo: "#8f84b0", grain: [3.2, 0.08], strata: 0.56, bounce: 0.16, cap: [0.85, 1.05, 1.5], direct: 0.6 } as const;
  const rockGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 64, 22, false));
  {
    const pos = rockGeo.attributes.position!;
    const ease = (a: number, b: number, v: number) => {
      const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const v = y + 0.5; // 0 at the foot, 1 at the top
      const a = Math.atan2(z, x);
      // A flared foot, a waist, a ledge two-thirds up, and a lip that overhangs.
      const profile = 1.26 - 0.34 * ease(0, 0.4, v) + 0.1 * ease(0.56, 0.64, v) - 0.05 * ease(0.66, 0.9, v) + 0.12 * ease(0.9, 1, v);
      const lumps = 1 + Math.sin(a * 3 + v * 4) * 0.07 + Math.sin(a * 7 - v * 9 + 1.3) * 0.04 + Math.sin(a * 13 + v * 17) * 0.02;
      // Only the wall moves: the caps keep their centres.
      const wall = Math.hypot(x, z) > 0.5 ? profile * lumps : 1;
      pos.setXYZ(i, x * wall, y, z * wall);
    }
    rockGeo.computeVertexNormals();
  }
  const rockMat = painted(ROCK);
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.scale.set(2.3, 3.7, 1.95);
  rock.position.set(0, -0.25, 0);
  cliff.add(rock);
  // The headland carries on to the right, a little taller and further back.
  const rockBack = new THREE.Mesh(rockGeo, painted({ ...ROCK, cap: [0.85, 1.6, 2.1] }));
  rockBack.scale.set(3.3, 4.7, 2.5);
  rockBack.rotation.y = 1.9;
  rockBack.position.set(4.2, -0.15, -1.6);
  cliff.add(rockBack);

  // A spit of pale sand at its foot, and a few stones on it.
  const blob = keep(new THREE.IcosahedronGeometry(1, 3));
  const sand = new THREE.Mesh(blob, painted({ hi: "#fbf1d8", mid: "#efdfbd", lo: "#c4b4c4", grain: [1.2, 0.12] }));
  sand.scale.set(2.5, 0.16, 1.25);
  sand.position.set(-2.35, -0.02, 1.35);
  sand.rotation.y = -0.25;
  cliff.add(sand);
  const stoneMat = painted({ hi: "#f1e2c6", mid: "#c9ab90", lo: "#8f84b0", grain: [2.2, 0.18] });
  for (const [x, z, s] of [
    [-2.95, 1.55, 0.36],
    [-3.6, 0.85, 0.22],
    [-2.2, 2.25, 0.26],
  ] as const) {
    const stone = new THREE.Mesh(blob, stoneMat);
    stone.scale.set(s * 1.35, s * 0.8, s);
    stone.position.set(x, 0.1, z);
    stone.rotation.y = x * 2;
    cliff.add(stone);
  }

  // Grass: a round hill over the rock, lapping over its edge. Yellow-green in the light, blue-green in the shade.
  const HILL = { rx: 2.75, ry: 1.0, rz: 2.3, y: 1.55 };
  const GRASS = { hi: "#c9de7c", mid: "#8fc066", lo: "#4f9068", grain: [1.7, 0.42], foot: [0.26, HILL.y - 0.1, HILL.y + 0.42] } as const;
  const hillAt = (x: number, z: number) => {
    const k = 1 - (x / HILL.rx) ** 2 - (z / HILL.rz) ** 2;
    return HILL.y + HILL.ry * Math.sqrt(Math.max(0, k));
  };
  /** The hill's outward direction at a point on it. */
  const hillNormal = (x: number, z: number) =>
    new THREE.Vector3(x / HILL.rx ** 2, (hillAt(x, z) - HILL.y) / HILL.ry ** 2, z / HILL.rz ** 2).normalize();
  const hillGeo = keep(new THREE.SphereGeometry(1, 56, 24, 0, Math.PI * 2, 0, Math.PI * 0.56));
  const hill = new THREE.Mesh(hillGeo, painted(GRASS));
  hill.scale.set(HILL.rx, HILL.ry, HILL.rz);
  hill.position.y = HILL.y;
  cliff.add(hill);
  const hillBack = new THREE.Mesh(hillGeo, painted({ ...GRASS, hi: "#bfd67a", mid: "#86b866", lo: "#4a8a68", foot: [0.26, 2.05, 2.6] }));
  hillBack.scale.set(3.75, 1.2, 2.9);
  hillBack.position.set(4.2, 2.15, -1.6);
  cliff.add(hillBack);

  // Bushes behind the patch, rounded like the reference's.
  const bushMat = painted({ hi: "#bcd568", mid: "#63a65b", lo: "#2f705c", grain: [2.4, 0.4] });
  for (const [bx, bz, bs] of [
    [1.15, -0.55, 0.62],
    [2.5, 0.1, 0.8],
    [0.2, -1.35, 0.5],
  ] as const) {
    const bush = new THREE.Group();
    for (let i = 0; i < 5; i += 1) {
      const leaf = new THREE.Mesh(blob, bushMat);
      const r = bs * (0.55 + landRandom() * 0.4);
      leaf.scale.set(r, r * 0.86, r);
      leaf.position.set((landRandom() - 0.5) * bs * 1.3, r * 0.6 + landRandom() * bs * 0.35, (landRandom() - 0.5) * bs * 0.8);
      bush.add(leaf);
    }
    bush.position.set(bx, (bx > 2 ? 3.0 : hillAt(bx, bz)) - 0.12, bz);
    cliff.add(bush);
  }

  // Blades of grass, in the hill's own colours, thickest on the slope that faces the visitor.
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
  const BLADES = 4200;
  const RIM_BLADES = 520;
  const ground = new Float32Array((BLADES + RIM_BLADES) * 3);
  const bladeMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: BLADE_VERT,
      fragmentShader: BLADE_FRAG,
      uniforms: { ...paint(GRASS), uTip: { value: hex("#e2ef9c") }, uTime: shared.uTime, uWind: { value: moving ? 0.55 : 0.2 } },
      side: THREE.DoubleSide,
    }),
  );
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, BLADES + RIM_BLADES);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const lean = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const spin = new THREE.Quaternion();
    for (let i = 0; i < BLADES + RIM_BLADES; i += 1) {
      const rim = i >= BLADES;
      const a = landRandom() * Math.PI * 2;
      // The patch: everywhere, gathered in tufts. The rim: a fringe hanging over the rock's edge.
      const r = rim ? 0.955 + landRandom() * 0.04 : Math.sqrt(landRandom()) * 0.95;
      const x = Math.cos(a) * r * HILL.rx;
      const z = (rim ? Math.sin(a) : Math.abs(Math.sin(a)) * (landRandom() < 0.82 ? 1 : -1)) * r * HILL.rz;
      const n = hillNormal(x, z);
      // Stand partly upright, partly out from the hill, so the outline is soft with grass.
      lean.setFromUnitVectors(up, n.clone().lerp(up, rim ? 0.15 : 0.55).normalize());
      spin.setFromAxisAngle(up, landRandom() * Math.PI * 2);
      q.copy(lean).multiply(spin);
      const tuft = 0.75 + 0.5 * Math.sin(x * 3.1) * Math.sin(z * 2.7);
      const tall = (rim ? 0.2 + landRandom() * 0.14 : 0.1 + landRandom() * 0.14) * tuft;
      m.compose(new THREE.Vector3(x, hillAt(x, z) - 0.02, z), q, new THREE.Vector3(1, tall, 1));
      blades.setMatrixAt(i, m);
      ground.set([n.x, n.y, n.z], i * 3);
    }
  }
  bladeGeo.setAttribute("aGround", new THREE.InstancedBufferAttribute(ground, 3));
  blades.frustumCulled = false;
  cliff.add(blades);

  // ------------------------------------------------------------------ flowers
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
  type Flower = { root: THREE.Group; hit: THREE.Mesh; shown: boolean; picked: boolean; scale: number };
  const flowers: Flower[] = [];
  const hitGeo = keep(new THREE.SphereGeometry(0.42, 8, 6));
  const hitMat = keep(new THREE.MeshBasicMaterial({ visible: false }));
  FLOWER_SPOTS.forEach(([x, z], i) => {
    const root = new THREE.Group();
    const stemHeight = 0.42 + (i % 3) * 0.07;
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.scale.y = stemHeight;
    root.add(stem);
    const head = new THREE.Group();
    head.position.y = stemHeight;
    head.rotation.x = 0.95; // looks up and out at the visitor
    for (let p = 0; p < 6; p += 1) {
      const petal = new THREE.Mesh(petalGeo, petalMats[i % petalMats.length]!);
      const a = (p / 6) * Math.PI * 2;
      petal.scale.set(0.085, 0.03, 0.12);
      petal.position.set(Math.sin(a) * 0.13, 0, Math.cos(a) * 0.13);
      petal.rotation.y = a;
      head.add(petal);
    }
    const centre = new THREE.Mesh(petalGeo, centreMat);
    centre.scale.set(0.075, 0.05, 0.075);
    centre.position.y = 0.02;
    head.add(centre);
    root.add(head);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.y = stemHeight;
    hit.userData.flower = i;
    root.add(hit);
    root.position.set(x, hillAt(x, z) - 0.02, z);
    root.scale.setScalar(0);
    root.visible = false;
    cliff.add(root);
    flowers.push({ root, hit, shown: false, picked: false, scale: 0 });
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
      // To the right of the countdown: they rise in the gap of sea beside it and set behind the headland.
      wheel.x = 0.4;
      wheel.r = Math.min(0.68, 0.42 * aspect);
    }

    // The cliff keeps to the right edge, whatever the shape of the screen.
    const halfWidth = (CAM_Z - CLIFF_Z) * half * aspect;
    const scale = portrait ? 0.56 : Math.min(1, Math.max(0.72, aspect / 1.6));
    cliff.scale.setScalar(scale);
    cliff.position.set(halfWidth - (portrait ? 0.45 : 1.1) * scale, 0, CLIFF_Z);
    shared.uLandOrigin.value.copy(cliff.position);
    shared.uLandInv.value = 1 / scale;

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
        f.root.scale.setScalar(s * (portrait ? 1.35 : 1));
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
