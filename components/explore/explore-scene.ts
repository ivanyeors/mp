import * as THREE from "three";
import type { Rgb, SkyState } from "@/lib/explore/sky";

/**
 * The Explore page's scene (owner, 2026-11-17): a sky that follows the
 * visitor's clock, sun and moon, drifting clouds, a sea, and a grassy cliff
 * on the right where flowers sometimes grow. Kept out of React so three.js
 * loads only when the page mounts it; the page drives it through the methods
 * below and hears about a tapped flower through `onFlower`.
 *
 * Every colour is written as it should appear on screen (the shaders work in
 * sRGB and skip three's colour conversion), so the scene matches the CSS
 * fallback behind it exactly.
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

const v3 = (c: Rgb) => new THREE.Vector3(c[0], c[1], c[2]);
const hex = (h: string) => {
  const c = new THREE.Color();
  c.setHex(parseInt(h.slice(1), 16), THREE.NoColorSpace);
  return new THREE.Vector3(c.r, c.g, c.b);
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

const SKY_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec2 vNdc;
uniform vec3 uTop, uMid, uHorizon, uSun, uGlow;
uniform vec2 uSunPos, uMoonPos;
uniform float uHorizonY, uAspect, uTime, uStars, uSunStrength, uSunR, uMoonR, uMoonPhase, uMoonShow;

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

  // The sun: a soft disc in a wide glow.
  vec2 ds = (vNdc - uSunPos) * vec2(uAspect, 1.0);
  float rs = length(ds);
  float halo = exp(-rs * 2.6) * 0.5 + exp(-rs * 9.0) * 0.45;
  col = mix(col, uGlow, clamp(halo, 0.0, 1.0) * uSunStrength);
  col = mix(col, uSun, smoothstep(uSunR, uSunR * 0.86, rs) * uSunStrength);

  // The moon, in tonight's phase.
  vec2 m = (vNdc - uMoonPos) * vec2(uAspect, 1.0) / uMoonR;
  float rm = length(m);
  col += vec3(0.75, 0.8, 1.0) * exp(-rm * 1.5) * 0.16 * uMoonShow * (0.3 + 0.7 * uStars);
  if (rm < 1.0) {
    vec3 n = vec3(m, sqrt(1.0 - rm * rm));
    float a = uMoonPhase * 6.2831853;
    float lit = smoothstep(-0.04, 0.1, dot(n, vec3(sin(a), 0.0, -cos(a))));
    float spots = smoothstep(0.26, 0.2, length(m - vec2(-0.28, 0.3))) * 0.07
                + smoothstep(0.17, 0.12, length(m - vec2(0.32, -0.12))) * 0.06
                + smoothstep(0.13, 0.09, length(m - vec2(-0.08, -0.42))) * 0.05;
    vec3 face = mix(mix(col, vec3(0.72, 0.78, 0.95), 0.1), vec3(1.0, 0.98, 0.9) - spots, lit);
    col = mix(col, face, smoothstep(1.0, 0.95, rm) * uMoonShow);
  }
  gl_FragColor = vec4(col, 1.0);
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

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  float dist = length(vWorld.xz - uCam.xz);
  float far = smoothstep(4.0, 150.0, dist);
  vec3 col = mix(uDeep, uShallow, smoothstep(0.0, 0.8, pow(far, 0.6)));
  col = mix(col, uHorizon, smoothstep(0.55, 1.0, far) * 0.9);

  // Slow swell lines, finer with distance.
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

/** Two-tone shading for the clouds and the land, lit from `uLight`. */
const TOON_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
varying float vSeed;
varying float vLocalY;
uniform float uTime, uSway;
void main() {
  vec3 p = position;
  vLocalY = p.y;
  #ifdef USE_INSTANCING
    mat4 m = modelMatrix * instanceMatrix;
  #else
    mat4 m = modelMatrix;
  #endif
  vec4 w = m * vec4(p, 1.0);
  vSeed = fract(sin(dot(m[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  // Wind: the further up a blade or a stem, the more it leans.
  float lean = uSway * p.y * p.y;
  w.x += sin(uTime * 1.3 + m[3].x * 1.7 + m[3].z * 0.9) * lean;
  w.z += cos(uTime * 0.9 + m[3].x * 0.6) * lean * 0.5;
  vWorld = w.xyz;
  vNormal = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const TOON_FRAG = /* glsl */ `
precision highp float;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vSeed;
varying float vLocalY;
uniform vec3 uColor, uShade, uTint, uLight, uHaze;
uniform float uFacet, uFade, uVary, uBands, uFoot;
void main() {
  vec3 n = normalize(vNormal);
  if (uFacet > 0.5) n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  float d = dot(n, uLight) * 0.5 + 0.5;
  float up = n.y * 0.5 + 0.5;
  float t = smoothstep(0.34, 0.62, mix(d, up, 0.35));
  vec3 col = mix(uShade, uColor, t);
  col *= 1.0 - uBands * 0.1 * step(0.5, fract(vWorld.y * 2.3 + sin(vWorld.x * 1.7) * 0.15));
  col *= 1.0 + (vSeed - 0.5) * uVary;
  // Grass darkens towards the edge it laps over.
  col *= 1.0 - uFoot * (1.0 - smoothstep(0.0, 0.45, vLocalY));
  col = mix(col * uTint, uHaze, uFade);
  gl_FragColor = vec4(col, 1.0);
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

export function createExploreScene(host: HTMLElement, options: ExploreSceneOptions): ExploreScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:manipulation";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // Uniforms shared by every material, so one write recolours the scene.
  const shared = {
    uTime: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uLight: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
    uHaze: { value: new THREE.Vector3(1, 1, 1) },
    uCloud: { value: new THREE.Vector3(1, 1, 1) },
    uCloudShade: { value: new THREE.Vector3(0.8, 0.9, 1) },
  };
  const ONE = new THREE.Vector3(1, 1, 1);

  // ------------------------------------------------------------------ sky
  const skyUniforms: Uniforms = {
    uTop: { value: new THREE.Vector3() },
    uMid: { value: new THREE.Vector3() },
    uHorizon: { value: new THREE.Vector3() },
    uSun: { value: new THREE.Vector3() },
    uGlow: { value: new THREE.Vector3() },
    uSunPos: { value: new THREE.Vector2(0, -2) },
    uMoonPos: { value: new THREE.Vector2(0, -2) },
    uHorizonY: { value: -0.2 },
    uAspect: { value: 1 },
    uTime: shared.uTime,
    uStars: { value: 0 },
    uSunStrength: { value: 1 },
    uSunR: { value: 0.06 },
    uMoonR: { value: 0.055 },
    uMoonPhase: { value: 0.5 },
    uMoonShow: { value: 0 },
  };
  const sky = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(2, 2)),
    keep(new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyUniforms, depthTest: false, depthWrite: false })),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // ------------------------------------------------------------------ sea
  const seaUniforms: Uniforms = {
    uDeep: { value: new THREE.Vector3() },
    uShallow: { value: new THREE.Vector3() },
    uHorizon: skyUniforms.uHorizon!,
    uGlow: skyUniforms.uGlow!,
    uCam: { value: new THREE.Vector3(0, CAM_Y, CAM_Z) },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGlitterPos: { value: new THREE.Vector2(0, 0) },
    uTime: shared.uTime,
    uAspect: skyUniforms.uAspect!,
    uGlitter: { value: 0 },
    uHorizonY: skyUniforms.uHorizonY!,
  };
  const sea = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(900, SEA_FAR + 40)),
    keep(new THREE.ShaderMaterial({ vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, uniforms: seaUniforms })),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0, CAM_Z + 20 - (SEA_FAR + 40) / 2);
  scene.add(sea);

  const toon = (o: {
    color: string | THREE.IUniform;
    shade: string | THREE.IUniform;
    tint?: boolean;
    facet?: boolean;
    sway?: number;
    fade?: number;
    vary?: number;
    bands?: boolean;
    foot?: number;
  }) =>
    keep(
      new THREE.ShaderMaterial({
        vertexShader: TOON_VERT,
        fragmentShader: TOON_FRAG,
        uniforms: {
          uColor: typeof o.color === "string" ? { value: hex(o.color) } : o.color,
          uShade: typeof o.shade === "string" ? { value: hex(o.shade) } : o.shade,
          uTint: o.tint === false ? { value: ONE } : shared.uTint,
          uLight: shared.uLight,
          uHaze: shared.uHaze,
          uTime: shared.uTime,
          uSway: { value: options.reducedMotion ? 0 : (o.sway ?? 0) },
          uFacet: { value: o.facet ? 1 : 0 },
          uFade: { value: o.fade ?? 0 },
          uVary: { value: o.vary ?? 0 },
          uBands: { value: o.bands ? 1 : 0 },
          uFoot: { value: o.foot ?? 0 },
        },
      }),
    );

  // ------------------------------------------------------------------ clouds
  const puff = keep(new THREE.IcosahedronGeometry(1, 3));
  const clouds: { group: THREE.Group; speed: number; span: number }[] = [];
  const cloudRandom = rng(7);
  const addCloud = (x: number, y: number, z: number, size: number, fade: number, parent: THREE.Object3D) => {
    const n = 5 + Math.floor(cloudRandom() * 3);
    const mesh = new THREE.InstancedMesh(puff, toon({ color: shared.uCloud, shade: shared.uCloudShade, tint: false, fade }), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i += 1) {
      // A big puff in the middle, smaller ones stepping out to each side, all resting on one flat base.
      const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
      const r = (i === 0 ? 1 : 0.78 - Math.abs(side) * 0.14 + cloudRandom() * 0.12) * size;
      m.compose(
        new THREE.Vector3(side * size * 0.82 + (cloudRandom() - 0.5) * size * 0.2, r * 0.62, (cloudRandom() - 0.5) * size * 0.5),
        new THREE.Quaternion(),
        new THREE.Vector3(r, r * 0.8, r),
      );
      mesh.setMatrixAt(i, m);
    }
    mesh.frustumCulled = false;
    const group = new THREE.Group();
    group.add(mesh);
    group.position.set(x, y, z);
    parent.add(group);
    clouds.push({ group, speed: (0.16 + cloudRandom() * 0.2) * (60 / -z), span: 70 * (-z / 60) + size * 3 });
  };
  const fairClouds = new THREE.Group();
  const rainClouds = new THREE.Group();
  scene.add(fairClouds, rainClouds);
  for (const [x, y, z, s, f] of [
    [-34, 13, -70, 5.2, 0.28],
    [6, 17, -80, 6.4, 0.34],
    [40, 11, -64, 4.6, 0.24],
    [-12, 7.5, -92, 4.4, 0.5],
    [26, 6, -100, 5.2, 0.56],
    [-52, 5.5, -96, 4, 0.56],
    [58, 19, -88, 5, 0.38],
  ] as const) {
    addCloud(x, y, z, s, f, fairClouds);
  }
  // Rain cloud: more of it, lower and wider.
  for (const [x, y, z, s, f] of [
    [-30, 21, -76, 6.2, 0.3],
    [18, 23, -72, 6.8, 0.26],
    [52, 16, -84, 5.6, 0.4],
    [-60, 15, -90, 5.4, 0.44],
  ] as const) {
    addCloud(x, y, z, s, f, rainClouds);
  }
  rainClouds.visible = false;

  // ------------------------------------------------------------------ the cliff
  const cliff = new THREE.Group();
  scene.add(cliff);
  const landRandom = rng(11);

  // Rock: a rough column, wider at the foot, with ledges.
  const rockGeo = keep(new THREE.CylinderGeometry(1, 1.18, 1, 30, 7, false));
  {
    const pos = rockGeo.attributes.position!;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const bump = 1 + Math.sin(a * 5 + y * 7) * 0.05 + Math.sin(a * 11 + y * 3) * 0.035 + Math.sin(y * 19 + a * 2) * 0.03;
      pos.setXYZ(i, x * bump, y, z * bump);
    }
    rockGeo.computeVertexNormals();
  }
  const rockMat = toon({ color: "#cdb9a2", shade: "#96826f", facet: true, bands: true });
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.scale.set(2.45, 3.6, 2.05);
  rock.position.set(0, -0.2, 0);
  cliff.add(rock);
  // The headland carries on to the right, a little taller and further back.
  const rockBack = new THREE.Mesh(rockGeo, rockMat);
  rockBack.scale.set(3.4, 4.6, 2.6);
  rockBack.rotation.y = 1.9;
  rockBack.position.set(4.2, -0.1, -1.6);
  cliff.add(rockBack);
  // A few stones at its foot.
  const stoneGeo = keep(new THREE.IcosahedronGeometry(1, 1));
  for (const [x, z, s] of [
    [-2.9, 1.5, 0.42],
    [-3.5, 0.6, 0.26],
    [-2.3, 2.3, 0.3],
  ] as const) {
    const stone = new THREE.Mesh(stoneGeo, rockMat);
    stone.scale.set(s * 1.3, s * 0.8, s);
    stone.position.set(x, 0.02, z);
    stone.rotation.y = x * 2;
    cliff.add(stone);
  }

  // Grass: a round hill over the rock, lapping over its edge.
  const HILL = { rx: 2.75, ry: 1.0, rz: 2.3, y: 1.55 };
  const hillAt = (x: number, z: number) => {
    const k = 1 - (x / HILL.rx) ** 2 - (z / HILL.rz) ** 2;
    return HILL.y + HILL.ry * Math.sqrt(Math.max(0, k));
  };
  const hillGeo = keep(new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, Math.PI * 0.56));
  const hill = new THREE.Mesh(hillGeo, toon({ color: "#8fd873", shade: "#58b068", foot: 0.22 }));
  hill.scale.set(HILL.rx, HILL.ry, HILL.rz);
  hill.position.y = HILL.y;
  cliff.add(hill);
  const hillBack = new THREE.Mesh(hillGeo, toon({ color: "#84d06e", shade: "#52a765", foot: 0.22 }));
  hillBack.scale.set(3.75, 1.2, 2.9);
  hillBack.position.set(4.2, 2.15, -1.6);
  cliff.add(hillBack);

  // Blades of grass over the slope that faces the visitor.
  const bladeGeo = keep(new THREE.BufferGeometry());
  bladeGeo.setAttribute("position", new THREE.Float32BufferAttribute([-0.028, 0, 0, 0.028, 0, 0, 0, 1, 0], 3));
  bladeGeo.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0.5, 1, 0, 0.5, 1, 0, 1, 0.4], 3));
  const BLADES = 2600;
  const bladeMat = toon({ color: "#9fe07a", shade: "#6cc26a", sway: 0.045, vary: 0.22 });
  bladeMat.side = THREE.DoubleSide;
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, BLADES);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < BLADES; i += 1) {
      // Mostly the front of the hill, a few everywhere.
      const a = landRandom() * Math.PI * 2;
      const r = Math.sqrt(landRandom()) * 0.97;
      const x = Math.cos(a) * r * HILL.rx;
      const z = Math.abs(Math.sin(a)) * r * HILL.rz * (landRandom() < 0.85 ? 1 : -1);
      e.set((landRandom() - 0.5) * 0.4, landRandom() * Math.PI, (landRandom() - 0.5) * 0.4);
      q.setFromEuler(e);
      const h = 0.07 + landRandom() * 0.11;
      m.compose(new THREE.Vector3(x, hillAt(x, z) - 0.03, z), q, new THREE.Vector3(1, h, 1));
      blades.setMatrixAt(i, m);
    }
  }
  blades.frustumCulled = false;
  cliff.add(blades);

  // ------------------------------------------------------------------ flowers
  const stemGeo = keep(new THREE.CylinderGeometry(0.018, 0.024, 1, 6));
  stemGeo.translate(0, 0.5, 0);
  const petalGeo = keep(new THREE.SphereGeometry(1, 12, 8));
  const stemMat = toon({ color: "#6cc267", shade: "#3f9a55" });
  const centreMat = toon({ color: "#ffc93c", shade: "#f09a2e" });
  const petalMats = FLOWER_COLOURS.map((c) => {
    const shade = hex(c).multiplyScalar(0.82);
    return toon({ color: c, shade: { value: shade } });
  });
  type Flower = { root: THREE.Group; head: THREE.Group; hit: THREE.Mesh; shown: boolean; picked: boolean; scale: number; born: number };
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
    flowers.push({ root, head, hit, shown: false, picked: false, scale: 0, born: 0 });
  });

  // Petals thrown up when a flower is picked.
  type Petal = { mesh: THREE.Mesh; v: THREE.Vector3; spin: number; born: number };
  const loose: Petal[] = [];

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
  rain.renderOrder = 10;
  rain.visible = false;
  scene.add(rain);

  // ------------------------------------------------------------------ layout
  let width = 1;
  let height = 1;
  let portrait = false;
  let skyState: SkyState | null = null;
  const probe = new THREE.Vector3();

  const placeBodies = () => {
    if (!skyState) return;
    // The sun and moon cross a window of sky kept clear of the words.
    const win = portrait ? { x0: -0.55, x1: 0.3, top: 0.05 } : { x0: -0.2, x1: 0.42, top: 0.78 };
    const horizon = skyUniforms.uHorizonY!.value as number;
    const place = (body: { elevation: number; hourAngle: number }, out: THREE.Vector2) => {
      const across = Math.min(1, Math.max(0, (body.hourAngle + 100) / 200));
      const up = Math.sin((Math.max(-12, body.elevation) * Math.PI) / 180);
      out.set(win.x0 + (win.x1 - win.x0) * across, horizon + (win.top - horizon) * up);
    };
    place(skyState.sun, skyUniforms.uSunPos!.value as THREE.Vector2);
    place(skyState.moon, skyUniforms.uMoonPos!.value as THREE.Vector2);

    const sunUp = skyState.sun.elevation > -1;
    const body = sunUp ? skyState.sun : skyState.moon;
    const at = (sunUp ? skyUniforms.uSunPos!.value : skyUniforms.uMoonPos!.value) as THREE.Vector2;
    (seaUniforms.uGlitterPos!.value as THREE.Vector2).copy(at);
    const low = 1 - Math.min(1, Math.max(0, (body.elevation - 8) / 50));
    seaUniforms.uGlitter!.value =
      body.elevation > -1 ? (sunUp ? (0.25 + 0.6 * low) * skyState.palette.sunStrength : 0.5 * skyState.moon.lit * skyState.palette.stars) : 0;
    // Light the land from where the sun (or moon) is on screen.
    shared.uLight.value.set(at.x * 0.9, 0.35 + Math.max(0, Math.sin((body.elevation * Math.PI) / 180)) * 0.9, 0.55).normalize();
    // A low sun looks bigger.
    skyUniforms.uSunR!.value = (portrait ? 0.042 : 0.06) * (1 + 0.3 * low);
    skyUniforms.uMoonR!.value = portrait ? 0.036 : 0.05;
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
    skyUniforms.uAspect!.value = aspect;
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    (seaUniforms.uRes!.value as THREE.Vector2).copy(buffer);

    // The cliff keeps to the right edge, whatever the shape of the screen.
    const halfWidth = (CAM_Z - CLIFF_Z) * half * aspect;
    const scale = portrait ? 0.56 : Math.min(1, Math.max(0.72, aspect / 1.6));
    cliff.scale.setScalar(scale);
    cliff.position.set(halfWidth - (portrait ? 0.45 : 1.1) * scale, 0, CLIFF_Z);
    placeBodies();
  };

  // ------------------------------------------------------------------ input
  const raycaster = new THREE.Raycaster();
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

  const frame = () => {
    if (disposed) return;
    const dt = Math.min(0.05, clock.getDelta());
    const moving = !options.reducedMotion;
    if (moving) shared.uTime.value += dt;
    const t = shared.uTime.value;

    if (moving) {
      for (const c of clouds) {
        c.group.position.x += c.speed * dt;
        if (c.group.position.x > c.span) c.group.position.x = -c.span;
      }
    }

    // Rain fades in and out rather than switching.
    const opacity = rainUniforms.uOpacity!.value as number;
    const nextOpacity = opacity + (rainTarget - opacity) * Math.min(1, dt * 1.5);
    rainUniforms.uOpacity!.value = Math.abs(rainTarget - nextOpacity) < 0.004 ? rainTarget : nextOpacity;
    rain.visible = moving && (rainUniforms.uOpacity!.value as number) > 0.01;

    let animating = false;
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
      // The whole flower leans in the wind, stem and head together.
      if (moving && f.root.visible) {
        f.root.rotation.z = Math.sin(t * 1.1 + f.root.position.x * 2) * 0.09;
        f.root.rotation.x = Math.cos(t * 0.8 + f.root.position.x) * 0.05;
      }
    }
    for (let i = loose.length - 1; i >= 0; i -= 1) {
      const p = loose[i]!;
      const age = t - p.born;
      p.v.y -= 2.2 * dt;
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
      renderer.render(scene, camera);
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
      skyState = sky;
      const p = sky.palette;
      (skyUniforms.uTop!.value as THREE.Vector3).copy(v3(p.top));
      (skyUniforms.uMid!.value as THREE.Vector3).copy(v3(p.mid));
      (skyUniforms.uHorizon!.value as THREE.Vector3).copy(v3(p.horizon));
      (skyUniforms.uSun!.value as THREE.Vector3).copy(v3(p.sun));
      (skyUniforms.uGlow!.value as THREE.Vector3).copy(v3(p.glow));
      skyUniforms.uStars!.value = p.stars;
      skyUniforms.uSunStrength!.value = p.sunStrength;
      skyUniforms.uMoonPhase!.value = sky.moon.phase;
      // The moon comes out with the stars; by day it is not drawn.
      skyUniforms.uMoonShow!.value = sky.moon.elevation > -2 ? Math.min(1, p.stars * 1.8) : 0;
      (seaUniforms.uDeep!.value as THREE.Vector3).copy(v3(p.seaDeep));
      (seaUniforms.uShallow!.value as THREE.Vector3).copy(v3(p.seaShallow));
      shared.uTint.value.copy(v3(p.tint));
      shared.uHaze.value.copy(v3(p.horizon));
      shared.uCloud.value.copy(v3(p.cloud));
      shared.uCloudShade.value.copy(v3(p.cloudShade));
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
      if (options.reducedMotion) return;
      const r = rng(index + 31);
      for (let i = 0; i < 9; i += 1) {
        const mesh = new THREE.Mesh(petalGeo, petalMats[index % petalMats.length]!);
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
