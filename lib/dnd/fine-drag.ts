export type Vec = readonly [number, number];

export type FineDrag = {
  at: Vec;
  direct: Vec;
  speed: number;
  client: Vec;
  t: number;
  scale: number;
};

export const CREEP_SPEED = 0.05;
export const BRISK_SPEED = 0.2;
export const FINE_GAIN = 0.3;
export const CATCH_UP = 0.35;
const PAUSE_MS = 120;
export const PHONE_DRAWING_PX = 360;

export function drawingScale(widthPx: number): number {
  return widthPx > 0 ? Math.max(1, widthPx / PHONE_DRAWING_PX) : 1;
}

export function fineGain(speed: number): number {
  if (speed <= CREEP_SPEED) return FINE_GAIN;
  if (speed >= BRISK_SPEED) return 1;
  return FINE_GAIN + ((1 - FINE_GAIN) * (speed - CREEP_SPEED)) / (BRISK_SPEED - CREEP_SPEED);
}

export function startFineDrag(at: Vec, client: Vec, t: number, scale = 1): FineDrag {
  return { at, direct: at, speed: 0, client, t, scale: scale > 0 ? scale : 1 };
}

export function moveFineDrag(d: FineDrag, direct: Vec, client: Vec, t: number): FineDrag {
  const dt = Math.max(t - d.t, 1);
  const travelled = Math.hypot(client[0] - d.client[0], client[1] - d.client[1]) / d.scale;
  const sample = travelled / dt;
  const speed = dt > PAUSE_MS ? sample : d.speed + (sample - d.speed) * 0.5;
  const gain = fineGain(speed);
  const step = (i: 0 | 1) => (direct[i] - d.direct[i]) * gain;
  const catchUp = (CATCH_UP * (gain - FINE_GAIN)) / (1 - FINE_GAIN);
  let x = d.at[0] + step(0);
  let y = d.at[1] + step(1);
  x += (direct[0] - x) * catchUp;
  y += (direct[1] - y) * catchUp;
  return { at: [x, y], direct, speed, client, t, scale: d.scale };
}

export const snapsNow = (d: FineDrag): boolean => fineGain(d.speed) >= 0.9;

export function holdSnap(d: FineDrag, at: Vec): FineDrag {
  return { ...d, at };
}
