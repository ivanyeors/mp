"use client";
import React, { useEffect, useRef } from "react";
import {
  WebGLRenderer,
  Scene,
  Color,
  Clock,
  Vector2,
  Vector3,
  InstancedMesh,
  SphereGeometry,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  InstancedBufferAttribute,
  OrthographicCamera,
  Matrix4,
  SRGBColorSpace,
  AmbientLight,
  PointLight,
  ACESFilmicToneMapping,
} from "three";
import { cn } from "@/lib/utils";

// Simple 2D value noise utilities (deterministic, no deps)
function fract(x: number) { return x - Math.floor(x); }
function hash2(x: number, y: number) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}
function smoothstep01(x: number) {
  return x * x * (3 - 2 * x);
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function noise2d(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  const u = smoothstep01(xf);
  const v = smoothstep01(yf);
  const lerp1 = lerp(a, b, u);
  const lerp2 = lerp(c, d, u);
  return lerp(lerp1, lerp2, v); // 0..1
}

interface BallpitProps extends React.HTMLAttributes<HTMLDivElement> {
  followCursor?: boolean;
  count?: number;
  vertexColors?: boolean;
  colors?: number[];
  gravity?: number; // attraction strength towards cursor
  friction?: number; // velocity damping (0-1)
  minSize?: number; // in world units relative to shorter side (vmin)
  maxSize?: number;
  deformity?: number; // 0 = sphere, 1 = max squash/stretch
  wobbleSpeed?: number; // speed multiplier for wobble
  wobbleAxisMix?: number; // 0=x only, 1=y only, 0.5=both
  axisNoiseStrength?: number; // 0..1, how strongly noise overrides wobbleAxisMix
  axisNoiseScale?: number; // spatial/temporal scale of the noise field
  axisNoiseSpeed?: number; // time multiplier for the noise field
  pbr?: boolean; // enable physically-based material + lights
  lightIntensity?: number;
  ambientIntensity?: number;
}

export default function 
  Ballpit({
    className,
    followCursor = true,
    count = 35,
    vertexColors = true,
    colors = [0x0ea5e9, 0x06b6d4, 0x10b981],
    gravity = 1,
    friction = 0.8,
    minSize = 5,
    maxSize = 20,
    deformity = 0.21,
    wobbleSpeed = 0.1,
    wobbleAxisMix = 0.05,
    axisNoiseStrength = 0.6,
    axisNoiseScale = 0.5,
    axisNoiseSpeed = 0.3,
    pbr = true,
    lightIntensity = 350,
    ambientIntensity = 1.8,}: 
    
  BallpitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<OrthographicCamera | null>(null);
  const clockRef = useRef<Clock | null>(null);
  const mouseRef = useRef(new Vector2(0, 0));
  const instancedRef = useRef<InstancedMesh | null>(null);

  // physics state
  const positionsRef = useRef<Vector3[]>([]);
  const velocitiesRef = useRef<Vector3[]>([]);
  const radiiRef = useRef<number[]>([]);
  const phaseRef = useRef<number[]>([]); // per-instance wobble phase
  const deformSeedRef = useRef<number[]>([]); // per-instance wobble amplitude seed

  useEffect(() => {
    if (!canvasRef.current) return;

    const renderer = new WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;

    const scene = new Scene();
    scene.background = null;

    // camera in world units equals pixels; origin at center
    const camera = new OrthographicCamera(0, 0, 0, 0, -1000, 1000);

    const clock = new Clock();

    // instanced spheres
    const geometry = new SphereGeometry(1, 16, 16);
    const material = pbr
      ? new MeshPhysicalMaterial({ color: new Color(0xffffff), vertexColors: true, metalness: 0.5, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.2 })
      : new MeshBasicMaterial({ color: new Color(0xffffff), vertexColors: true, toneMapped: false });
    const instanced = new InstancedMesh(geometry, material, count);
    scene.add(instanced);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    clockRef.current = clock;
    instancedRef.current = instanced;

    // ensure instanceColor buffer exists
    if (!instanced.instanceColor) {
      instanced.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    }

    // initialize instance colors once (gradient) so first render has colors
    {
      const colA = new Color(colors?.[0] ?? 0x0ea5e9);
      const colB = new Color(colors?.[1] ?? 0x06b6d4);
      const colC = new Color(colors?.[2] ?? 0x10b981);
      for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, (count - 1));
        const mid = t < 0.5
          ? colA.clone().lerp(colB, t * 2)
          : colB.clone().lerp(colC, (t - 0.5) * 2);
        instanced.setColorAt(i, mid);
      }
      if (instanced.instanceColor) {
        instanced.instanceColor.needsUpdate = true;
      }
      (material as MeshBasicMaterial | MeshPhysicalMaterial).needsUpdate = true;
    }

    const tmpMatrix = new Matrix4();

    let ambient: AmbientLight | undefined;
    let point: PointLight | undefined;
    if (pbr) {
      ambient = new AmbientLight(0xffffff, ambientIntensity);
      scene.add(ambient);
      point = new PointLight(0xffffff, lightIntensity);
      scene.add(point);
      if (renderer.toneMapping !== ACESFilmicToneMapping) {
        renderer.toneMapping = ACESFilmicToneMapping;
      }
    }

    const resize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const { clientWidth: w, clientHeight: h } = containerRef.current;
      rendererRef.current.setSize(w, h, false);
      const halfW = w / 2;
      const halfH = h / 2;
      cameraRef.current.left = -halfW;
      cameraRef.current.right = halfW;
      cameraRef.current.top = halfH;
      cameraRef.current.bottom = -halfH;
      cameraRef.current.updateProjectionMatrix();

      // initialize if empty or on resize normalize within bounds
      const shortSide = Math.min(w, h);
      if (positionsRef.current.length !== count) {
        positionsRef.current = [];
        velocitiesRef.current = [];
        radiiRef.current = [];
        phaseRef.current = [];
        deformSeedRef.current = [];
        for (let i = 0; i < count; i++) {
          // radius as fraction of vmin (shortSide)
          const r = (Math.random() * (maxSize - minSize) + minSize) * (shortSide * 0.01);
          const x = (Math.random() * (w - 2 * r) - (w / 2 - r));
          const y = (Math.random() * (h - 2 * r) - (h / 2 - r));
          positionsRef.current.push(new Vector3(x, y, 0));
          velocitiesRef.current.push(new Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 0));
          radiiRef.current.push(r);
          phaseRef.current.push(Math.random() * Math.PI * 2);
          deformSeedRef.current.push(0.5 + Math.random() * 0.5);
        }
      } else {
        // clamp existing to new bounds
        for (let i = 0; i < positionsRef.current.length; i++) {
          const r = radiiRef.current[i];
          positionsRef.current[i].x = Math.max(-halfW + r, Math.min(halfW - r, positionsRef.current[i].x));
          positionsRef.current[i].y = Math.max(-halfH + r, Math.min(halfH - r, positionsRef.current[i].y));
        }
      }

      // redraw immediately after resize
      for (let i = 0; i < count; i++) {
        const p = positionsRef.current[i];
        const r = radiiRef.current[i];
        tmpMatrix.makeTranslation(p.x, p.y, 0);
        tmpMatrix.multiply(new Matrix4().makeScale(r, r, r));
        instanced.setMatrixAt(i, tmpMatrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
      renderer.render(scene, camera);
    };

    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      if (!containerRef.current || !cameraRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = (e.clientY - rect.top - rect.height / 2) * -1; // flip Y to world
      mouseRef.current.set(x, y);
    };

    if (followCursor) {
      window.addEventListener("mousemove", onMove);
    }

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.033); // cap step

      const cam = cameraRef.current!;
      const halfW = cam.right;
      const halfH = cam.top;

      // physics
      for (let i = 0; i < count; i++) {
        const p = positionsRef.current[i];
        const v = velocitiesRef.current[i];
        const r = radiiRef.current[i];

        // attraction to cursor
        const toMouseX = mouseRef.current.x - p.x;
        const toMouseY = mouseRef.current.y - p.y;
        const ax = (toMouseX) * (gravity * dt * 0.2);
        const ay = (toMouseY) * (gravity * dt * 0.2);
        v.x += ax;
        v.y += ay;

        // friction
        v.multiplyScalar(friction);

        // integrate
        p.x += v.x * dt;
        p.y += v.y * dt;

        // walls
        if (p.x - r < -halfW) { p.x = -halfW + r; v.x = Math.abs(v.x); }
        if (p.x + r > halfW) { p.x = halfW - r; v.x = -Math.abs(v.x); }
        if (p.y - r < -halfH) { p.y = -halfH + r; v.y = Math.abs(v.y); }
        if (p.y + r > halfH) { p.y = halfH - r; v.y = -Math.abs(v.y); }
      }

      // naive collisions O(n^2)
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const pi = positionsRef.current[i];
          const pj = positionsRef.current[j];
          const dx = pj.x - pi.x;
          const dy = pj.y - pi.y;
          const rr = radiiRef.current[i] + radiiRef.current[j];
          const dist2 = dx * dx + dy * dy;
          if (dist2 > 0 && dist2 < rr * rr) {
            const dist = Math.sqrt(dist2);
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = rr - dist;
            // separate equally
            pi.x -= nx * (overlap * 0.5);
            pi.y -= ny * (overlap * 0.5);
            pj.x += nx * (overlap * 0.5);
            pj.y += ny * (overlap * 0.5);
            // simple velocity response
            const vi = velocitiesRef.current[i];
            const vj = velocitiesRef.current[j];
            const relVel = (vj.x - vi.x) * nx + (vj.y - vi.y) * ny;
            if (relVel < 0) {
              const impulse = -relVel * 0.9; // restitution
              vi.x -= impulse * nx;
              vi.y -= impulse * ny;
              vj.x += impulse * nx;
              vj.y += impulse * ny;
            }
          }
        }
      }

      // update matrices with optional deformity wobble
      for (let i = 0; i < count; i++) {
        const p = positionsRef.current[i];
        const r = radiiRef.current[i];

        // wobble
        const phase = (phaseRef.current[i] = (phaseRef.current[i] || 0) + wobbleSpeed * dt * 2 * Math.PI);
        const seed = deformSeedRef.current[i] || 1;
        const amp = deformity * seed;

        // noise-driven axis mix overrides base wobbleAxisMix
        const t = clock.getElapsedTime();
        const n = noise2d((p.x * axisNoiseScale) + i * 13.37, (p.y * axisNoiseScale) + t * axisNoiseSpeed);
        const noisyMix = Math.min(1, Math.max(0, wobbleAxisMix * (1 - axisNoiseStrength) + n * axisNoiseStrength));
        const xMix = 1 - noisyMix;
        const yMix = noisyMix;
        const sx = 1 + Math.sin(phase) * amp * xMix - Math.cos(phase) * amp * yMix * 0.5;
        const sy = 1 - Math.sin(phase) * amp * xMix + Math.cos(phase) * amp * yMix * 0.5;

        tmpMatrix.makeTranslation(p.x, p.y, 0);
        tmpMatrix.multiply(new Matrix4().makeScale(r * sx, r * sy, r));
        instanced.setMatrixAt(i, tmpMatrix);
      }
      instanced.instanceMatrix.needsUpdate = true;

      if (pbr && point) {
        // follow the first instance as a key light
        const p0 = positionsRef.current[0] ?? new Vector3();
        point.position.set(p0.x, p0.y, 200);
      }
      renderer.render(scene, camera);
    };

    clockRef.current!.start();
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (followCursor) window.removeEventListener("mousemove", onMove);
      geometry.dispose();
      material.dispose();
      if (pbr) {
        if (ambient) scene.remove(ambient);
        if (point) scene.remove(point);
      }
      renderer.dispose();
    };
  }, [followCursor, count, colors, gravity, friction, minSize, maxSize, vertexColors, deformity, wobbleSpeed, wobbleAxisMix, axisNoiseStrength, axisNoiseScale, axisNoiseSpeed, pbr, lightIntensity, ambientIntensity]);

  return (
    <div ref={containerRef} className={cn("w-full h-full", className)}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
