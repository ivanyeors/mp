export const CM_PER_INCH = 2.54;

export function inchesToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

export function cmToInches(cm: number): number {
  return cm / CM_PER_INCH;
}

export function roundCm(cm: number): number {
  return Math.round(cm * 100) / 100;
}

export const HEAD_TO_BACK_MIN_CM = -7.62;
