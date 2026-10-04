import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ZONE_TINTS, bounds, fitDistance, partFacts, partLabel } from "@/lib/showroom/describe";
import type { ShowroomUnit, Vec3, ViewerPart } from "@/lib/showroom/types";

/**
 * The showroom's three.js scene, kept out of React so the page can load it
 * (and three.js) only when the viewer mounts. The page drives it through
 * `update` and hears about the part under the pointer through `onPick`.
 */

export type SceneOptions = {
  mode: "materials" | "zones";
  cutaway: boolean;
  labels: boolean;
  dims: boolean;
  shadows: boolean;
  grid: boolean;
  dark: boolean;
};

export type PickInfo = {
  key: string;
  label: string;
  facts: string[];
  zone?: string;
  note?: string;
};

export type ShowroomScene = {
  update(opts: SceneOptions): void;
  resetView(): void;
  dispose(): void;
};

const THEME = {
  light: { edge: "#272d2a", dim: "#245d91", grid: "#b9c0b8" },
  dark: { edge: "#171b1e", dim: "#80b4e4", grid: "#323b40" },
};
const HIGHLIGHT = "#d9932a";
const WALK_SPEED = 3; // m/s, x2.5 with Shift

const TAG_ZONE =
  "absolute left-0 top-0 whitespace-nowrap rounded border border-border bg-background/85 px-1.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-wider text-foreground shadow-sm";
const TAG_DIM =
  "absolute left-0 top-0 whitespace-nowrap rounded bg-background/80 px-1 py-0.5 font-mono text-[11px] leading-none tabular-nums text-sky-800 dark:text-sky-300";

const srgb = (rgb: readonly number[]) =>
  new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
const v3 = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);

export function createShowroomScene(
  host: HTMLElement,
  overlay: HTMLElement,
  unit: ShowroomUnit,
  initial: SceneOptions,
  onPick: (info: PickInfo | null) => void,
): ShowroomScene {
  let opts = initial;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "block size-full touch-none cursor-grab active:cursor-grabbing";
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(unit.home.fov, 1, 0.05, 300);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 0.3;
  controls.maxDistance = 90;
  controls.maxPolarAngle = Math.PI * 0.49; // never below the target, so never under the floor
  controls.screenSpacePanning = false; // pan slides along the floor
  controls.zoomToCursor = true;

  // Light in physical units (three r155+): the old 0-1 intensities times pi.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa09a, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.25);
  const [cx, , cz] = unit.home.target;
  sun.position.set(cx - 5, 26, cz + 7);
  sun.target.position.set(cx, 0, cz);
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  fill.position.set(cx + 16, 9, cz - 12);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, -0.151, cz);
  ground.receiveShadow = true;
  scene.add(ground);
  let grid: THREE.GridHelper | null = null;

  // ---- the model: one group coloured by material, one by zone ----
  const edgeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 });
  const frameMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95 });

  function mesh(p: ViewerPart, rgb: readonly number[]) {
    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute("position", new THREE.Float32BufferAttribute(p.position, 3));
    indexed.setIndex(p.index);
    const g = indexed.toNonIndexed(); // flat shading: no normals shared across corners
    indexed.dispose();
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: srgb(rgb),
      roughness: p.glass ? 0.15 : 0.92,
      metalness: 0,
      transparent: p.glass,
      opacity: p.glass ? 0.34 : 1,
      depthWrite: !p.glass,
      side: p.glass ? THREE.DoubleSide : THREE.FrontSide,
    });
    const m = new THREE.Mesh(g, mat);
    m.castShadow = !p.glass;
    m.receiveShadow = !p.glass;
    m.renderOrder = p.glass ? 2 : 0;
    m.userData.part = p;
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), p.glass ? frameMat : edgeMat));
    return m;
  }
  const glassRgb = unit.model.parts.find((p) => p.glass)?.rgb ?? [150, 190, 205];
  const matGroup = new THREE.Group();
  const zoneGroup = new THREE.Group();
  for (const p of unit.model.parts) matGroup.add(mesh(p, p.rgb ?? glassRgb));
  for (const p of unit.model.zonePieces) {
    const tint = ZONE_TINTS[(p.zone ?? 0) % ZONE_TINTS.length];
    zoneGroup.add(mesh(p, p.glass ? tint.map((c) => Math.min(255, c + 40)) : tint));
  }
  scene.add(matGroup, zoneGroup);
  const meshes = () => (opts.mode === "zones" ? zoneGroup : matGroup).children as THREE.Mesh[];

  // ---- dimension chains and tags ----
  const dimMat = new THREE.LineBasicMaterial();
  const dimGroup = new THREE.Group();
  scene.add(dimGroup);
  const tags: { el: HTMLDivElement; at: THREE.Vector3; kind: "zone" | "dim" }[] = [];
  function tag(text: string, at: THREE.Vector3, kind: "zone" | "dim") {
    const el = document.createElement("div");
    el.className = kind === "zone" ? TAG_ZONE : TAG_DIM;
    el.textContent = text;
    overlay.appendChild(el);
    tags.push({ el, at, kind });
  }
  for (const d of unit.dims) {
    const a = v3(d.a), b = v3(d.b);
    const s = b.clone().sub(a).normalize().add(v3(d.slash)).multiplyScalar(0.16);
    const pts = [a, b, a.clone().sub(s), a.clone().add(s), b.clone().sub(s), b.clone().add(s)];
    dimGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), dimMat));
    tag(d.text, a.clone().add(b).multiplyScalar(0.5), "dim");
  }
  dimGroup.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(unit.extensions.flatMap(([p, q]) => [v3(p), v3(q)])),
    dimMat,
  ));
  for (const t of unit.tags) tag(t.text, v3(t.at), "zone");

  // ---- options ----
  function apply(next: SceneOptions) {
    const themeChanged = !grid || next.dark !== opts.dark;
    opts = next;
    const theme = next.dark ? THEME.dark : THEME.light;
    if (themeChanged) {
      edgeMat.color.set(theme.edge);
      frameMat.color.set(theme.edge);
      dimMat.color.set(theme.dim);
      if (grid) {
        scene.remove(grid);
        grid.geometry.dispose();
        (grid.material as THREE.Material).dispose();
      }
      grid = new THREE.GridHelper(60, 60, theme.grid, theme.grid);
      grid.position.set(cx, -0.153, cz);
      scene.add(grid);
    }
    grid!.visible = next.grid;
    matGroup.visible = next.mode === "materials";
    zoneGroup.visible = next.mode === "zones";
    for (const g of [matGroup, zoneGroup]) {
      for (const m of g.children) m.visible = !(next.cutaway && (m.userData.part as ViewerPart).cut);
    }
    dimGroup.visible = next.dims;
    sun.castShadow = next.shadows;
    ground.visible = next.shadows;
    setPick(null, null);
  }

  // ---- camera ----
  function homePose() {
    const h = unit.home;
    const d = fitDistance(h.halfW, h.halfH, h.fov, camera.aspect);
    const target = v3(h.target);
    return { pos: target.clone().addScaledVector(v3(h.dir).normalize(), d), target };
  }
  let tween: { t0: number; p0: THREE.Vector3; g0: THREE.Vector3; pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function resetView(instant = false) {
    const { pos, target } = homePose();
    camera.fov = unit.home.fov;
    camera.updateProjectionMatrix();
    if (instant || reduceMotion) {
      camera.position.copy(pos);
      controls.target.copy(target);
      controls.update();
      tween = null;
      return;
    }
    tween = { t0: performance.now(), p0: camera.position.clone(), g0: controls.target.clone(), pos, target };
  }
  controls.addEventListener("start", () => { tween = null; });

  // ---- picking ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered: THREE.Mesh | null = null;
  let pinned: THREE.Mesh | null = null;
  let shownKey: string | null = null;

  function hit(e: PointerEvent): THREE.Mesh | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const first = ray.intersectObjects(meshes().filter((m) => m.visible), false)[0];
    return (first?.object as THREE.Mesh | undefined) ?? null;
  }
  function glow(m: THREE.Mesh | null, on: boolean) {
    if (!m) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.emissive.set(on ? HIGHLIGHT : 0x000000);
    mat.emissiveIntensity = on ? 0.45 : 0;
  }
  function info(m: THREE.Mesh): PickInfo {
    const p = m.userData.part as ViewerPart;
    return {
      key: `${p.name}:${p.zone ?? ""}`,
      label: partLabel(unit, p),
      facts: partFacts(bounds(p.position)),
      zone: p.zone !== undefined ? unit.zoneNames[p.zone] : undefined,
      note: unit.partNotes[p.item],
    };
  }
  function setPick(h: THREE.Mesh | null, p: THREE.Mesh | null) {
    glow(hovered, false);
    glow(pinned, false);
    hovered = h;
    pinned = p;
    glow(pinned, true);
    glow(hovered, true);
    const shown = hovered ?? pinned;
    const key = shown ? info(shown).key : null;
    if (key !== shownKey) {
      shownKey = key;
      onPick(shown ? info(shown) : null);
    }
  }

  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY };
    host.focus({ preventScroll: true });
  };
  const onUp = (e: PointerEvent) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) setPick(null, hit(e));
    down = null;
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && !e.buttons) setPick(hit(e), pinned);
  };
  const onLeave = () => setPick(null, pinned);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);

  // ---- walking: W A S D / arrows along the floor, E up, Q down, Shift faster ----
  const keys = new Set<string>();
  const WALK_KEYS = new Set(["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!WALK_KEYS.has(k) || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    keys.add(k);
    tween = null;
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const onBlur = () => keys.clear();
  host.addEventListener("keydown", onKeyDown);
  host.addEventListener("keyup", onKeyUp);
  host.addEventListener("blur", onBlur);
  const fwd = new THREE.Vector3();
  const side = new THREE.Vector3();
  const step = new THREE.Vector3();
  function walk(dt: number, fast: boolean) {
    if (!keys.size) return;
    fwd.subVectors(controls.target, camera.position).setY(0);
    if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1);
    fwd.normalize();
    side.crossVectors(fwd, camera.up);
    step.set(0, 0, 0);
    if (keys.has("w") || keys.has("arrowup")) step.add(fwd);
    if (keys.has("s") || keys.has("arrowdown")) step.sub(fwd);
    if (keys.has("d") || keys.has("arrowright")) step.add(side);
    if (keys.has("a") || keys.has("arrowleft")) step.sub(side);
    if (keys.has("e")) step.y += 1;
    if (keys.has("q")) step.y -= 1;
    if (step.lengthSq() === 0) return;
    step.normalize().multiplyScalar(WALK_SPEED * (fast ? 2.5 : 1) * dt);
    if (controls.target.y + step.y < 0) step.y = -controls.target.y; // the target stays on or above the floor
    camera.position.add(step);
    controls.target.add(step);
  }
  let shift = false;
  const onShift = (e: KeyboardEvent) => { shift = e.shiftKey; };
  host.addEventListener("keydown", onShift);
  host.addEventListener("keyup", onShift);

  // ---- size and loop ----
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  apply(opts);
  resetView(true);

  const proj = new THREE.Vector3();
  const occ = new THREE.Raycaster();
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let last = performance.now();
  let raf = 0;
  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / 750), e = ease(k);
      camera.position.lerpVectors(tween.p0, tween.pos, e);
      controls.target.lerpVectors(tween.g0, tween.target, e);
      if (k === 1) tween = null;
    }
    walk(dt, shift);
    controls.update();
    renderer.render(scene, camera);

    const w = host.clientWidth, h = host.clientHeight;
    const solids = meshes().filter((m) => m.visible && !(m.userData.part as ViewerPart).glass);
    for (const t of tags) {
      const wanted = t.kind === "zone" ? opts.labels : opts.dims;
      proj.copy(t.at).project(camera);
      let vis = wanted && proj.z > -1 && proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05;
      if (vis) { // hide a tag that a wall stands in front of
        occ.setFromCamera(new THREE.Vector2(proj.x, proj.y), camera);
        const first = occ.intersectObjects(solids, false)[0];
        vis = !first || first.distance > occ.ray.origin.distanceTo(t.at) - 0.2;
      }
      t.el.hidden = !vis;
      if (vis) {
        t.el.style.transform =
          `translate(${(proj.x * 0.5 + 0.5) * w}px, ${(-proj.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
      }
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    update: apply,
    resetView: () => resetView(false),
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("keydown", onKeyDown);
      host.removeEventListener("keyup", onKeyUp);
      host.removeEventListener("blur", onBlur);
      host.removeEventListener("keydown", onShift);
      host.removeEventListener("keyup", onShift);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const mat of mats) mat.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      for (const t of tags) t.el.remove();
    },
  };
}
