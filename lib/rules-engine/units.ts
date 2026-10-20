/** Display/authoring inches ↔ canonical cm. 1 in = 2.54 cm. */

export const CM_PER_INCH = 2.54;

export function inchesToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

export function cmToInches(cm: number): number {
  return cm / CM_PER_INCH;
}

/** Round to 2 decimal cm — enough for measurement bands. */
export function roundCm(cm: number): number {
  return Math.round(cm * 100) / 100;
}

/**
 * Head-to-back is the gap from the back of the head to the wall the upper back
 * rests on, so 0 is a real answer. The floor sits a little below it (−3 in)
 * rather than refuse a head that reaches past the wall line. Every other
 * measurement must be positive.
 */
export const HEAD_TO_BACK_MIN_CM = roundCm(inchesToCm(-3));
