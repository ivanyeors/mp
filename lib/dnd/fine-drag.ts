/**
 * Precise by default (Ivan, 8-11-2026: "precision without pressing any
 * buttons, on desktop and phone"): a held filling follows the pointer one to
 * one while the hand moves briskly, and at a fraction of its travel while it
 * creeps, so slowing down IS the fine control — the way a hand slows to set a
 * pouch exactly. Moving briskly again draws the filling back under the
 * pointer, so the two never stay apart. Pure, for both x-ray views.
 *
 * Positions are in the caller's units (the views pass view units); speed is
 * measured in screen pixels per millisecond, so the feel is the same on a
 * phone and a desktop whatever the drawing's scale.
 */

export type Vec = readonly [number, number];

export type FineDrag = {
  /** Where the held filling is: its centre, in the caller's units. */
  at: Vec;
  /** Where the pointer alone would put it (pointer less where it was grabbed). */
  direct: Vec;
  /** Smoothed pointer speed, screen px per ms. */
  speed: number;
  /** The last pointer sample: screen px and its time, ms. */
  client: Vec;
  t: number;
};

/** At or below this speed (50 px a second: a deliberate creep) the filling moves at FINE_GAIN of the pointer's travel. */
export const CREEP_SPEED = 0.05;
/** At or above it (200 px a second: an ordinary drag), one to one. */
export const BRISK_SPEED = 0.2;
/** The slowest a filling moves against the pointer: a 3 px creep is about a millimetre on either view. */
export const FINE_GAIN = 0.3;
/** Moving at an ordinary pace, the share of the gap to the pointer a filling closes each sample (less, the slower). */
export const CATCH_UP = 0.35;
/** A pause longer than this starts the speed afresh (a fresh, slow move is fine at once). */
const PAUSE_MS = 120;

/** The gain at a speed: FINE_GAIN when creeping, 1 when brisk, straight in between. */
export function fineGain(speed: number): number {
  if (speed <= CREEP_SPEED) return FINE_GAIN;
  if (speed >= BRISK_SPEED) return 1;
  return FINE_GAIN + ((1 - FINE_GAIN) * (speed - CREEP_SPEED)) / (BRISK_SPEED - CREEP_SPEED);
}

/** A drag picked up with the filling at `at`, the pointer at `client` (screen px) at time `t`. */
export function startFineDrag(at: Vec, client: Vec, t: number): FineDrag {
  return { at, direct: at, speed: 0, client, t };
}

/**
 * One pointer sample: `direct` is where the pointer alone would put the
 * filling now. The filling moves by the pointer's step × the gain at its
 * speed, and closes part of the gap creeping left — none while it creeps,
 * CATCH_UP at an ordinary pace — so it comes back under the pointer as soon
 * as the hand moves on, and never trails it through a normal drag.
 */
export function moveFineDrag(d: FineDrag, direct: Vec, client: Vec, t: number): FineDrag {
  const dt = Math.max(t - d.t, 1);
  const travelled = Math.hypot(client[0] - d.client[0], client[1] - d.client[1]);
  const sample = travelled / dt;
  // Smoothed, so one jittery sample neither jolts nor freezes it; a pause forgets the old speed.
  const speed = dt > PAUSE_MS ? sample : d.speed + (sample - d.speed) * 0.5;
  const gain = fineGain(speed);
  const step = (i: 0 | 1) => (direct[i] - d.direct[i]) * gain;
  const catchUp = (CATCH_UP * (gain - FINE_GAIN)) / (1 - FINE_GAIN);
  let x = d.at[0] + step(0);
  let y = d.at[1] + step(1);
  x += (direct[0] - x) * catchUp;
  y += (direct[1] - y) * catchUp;
  return { at: [x, y], direct, speed, client, t };
}

/** True while the hand moves at a normal pace: snapping helps then, and stands aside while it creeps. */
export const snapsNow = (d: FineDrag): boolean => fineGain(d.speed) >= 0.9;

/**
 * The hand slowed while a snap held the filling: from here it creeps from
 * where the snap put it, so slowing down never makes it jump off the snap.
 */
export function holdSnap(d: FineDrag, at: Vec): FineDrag {
  return { ...d, at };
}
