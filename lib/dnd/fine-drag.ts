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
 *
 * Same millimetres in both views (9-11-2026): the top view draws the whole
 * pillow, about half the side view's scale on a phone, so one creeping pixel
 * moved a pouch nearly twice as far there. Each drag now creeps at the gain
 * its view's scale asks (`creepGain`): no more than CREEP_MM_PER_PX a pixel,
 * in either view, on any screen.
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
  /** Its gain while creeping: FINE_GAIN, or less in a view drawn small (`creepGain`). */
  creep: number;
};

/** At or below this speed (50 px a second: a deliberate creep) the filling moves at FINE_GAIN of the pointer's travel. */
export const CREEP_SPEED = 0.05;
/** At or above it (200 px a second: an ordinary drag), one to one. */
export const BRISK_SPEED = 0.2;
/** The slowest a filling moves against the pointer where the drawing is large enough (`creepGain` lowers it where not). */
export const FINE_GAIN = 0.3;
/** At most this far, mm, a creeping pixel moves a filling, in either view: about what the cut gave on a phone. */
export const CREEP_MM_PER_PX = 0.35;
/** The least creep gain: under it a hand would seem to move nothing. */
export const MIN_CREEP_GAIN = 0.12;

/**
 * The creep gain for a view drawn at `pxPerMm` screen pixels a millimetre:
 * FINE_GAIN where that already keeps a creeping pixel within
 * CREEP_MM_PER_PX, and less on a smaller drawing (the top view on a phone).
 */
export function creepGain(pxPerMm: number): number {
  if (!(pxPerMm > 0)) return FINE_GAIN;
  return Math.min(FINE_GAIN, Math.max(MIN_CREEP_GAIN, pxPerMm * CREEP_MM_PER_PX));
}

/** Moving at an ordinary pace, the share of the gap to the pointer a filling closes each sample (less, the slower). */
export const CATCH_UP = 0.35;
/** A pause longer than this starts the speed afresh (a fresh, slow move is fine at once). */
const PAUSE_MS = 120;

/** The gain at a speed: `creep` (FINE_GAIN unless the view asks less) when creeping, 1 when brisk, straight in between. */
export function fineGain(speed: number, creep = FINE_GAIN): number {
  if (speed <= CREEP_SPEED) return creep;
  if (speed >= BRISK_SPEED) return 1;
  return creep + ((1 - creep) * (speed - CREEP_SPEED)) / (BRISK_SPEED - CREEP_SPEED);
}

/**
 * A drag picked up with the filling at `at`, the pointer at `client` (screen
 * px) at time `t`, creeping at `creep` (`creepGain` of the view's scale).
 */
export function startFineDrag(at: Vec, client: Vec, t: number, creep = FINE_GAIN): FineDrag {
  return { at, direct: at, speed: 0, client, t, creep };
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
  const gain = fineGain(speed, d.creep);
  const step = (i: 0 | 1) => (direct[i] - d.direct[i]) * gain;
  const catchUp = (CATCH_UP * (gain - d.creep)) / (1 - d.creep);
  let x = d.at[0] + step(0);
  let y = d.at[1] + step(1);
  x += (direct[0] - x) * catchUp;
  y += (direct[1] - y) * catchUp;
  return { at: [x, y], direct, speed, client, t, creep: d.creep };
}

/** True while the hand moves at a normal pace: snapping helps then, and stands aside while it creeps. */
export const snapsNow = (d: FineDrag): boolean => fineGain(d.speed, d.creep) >= 0.9;

/**
 * The hand slowed while a snap held the filling: from here it creeps from
 * where the snap put it, so slowing down never makes it jump off the snap.
 */
export function holdSnap(d: FineDrag, at: Vec): FineDrag {
  return { ...d, at };
}
