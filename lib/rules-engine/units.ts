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
