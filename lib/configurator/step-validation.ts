/** Hybrid CTA enablement + submit-time field error maps for configurator steps. */

export type FieldCheck = {
  key: string;
  /** Any input present (counts toward enabling the CTA). */
  touched: boolean;
  /** Satisfies the required rule for this field. */
  valid: boolean;
  message?: string;
};

/** Empty step → disabled; any field touched → enabled (validate on submit). */
export function hybridCtaEnabled(fields: FieldCheck[]): boolean {
  return fields.some((f) => f.touched);
}

/** Build error map for every invalid required field. */
export function buildFieldErrorMap(fields: FieldCheck[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (!f.valid) out[f.key] = f.message ?? "Required";
  }
  return out;
}

/** Drop errors for fields that are now valid (no remount needed). */
export function pruneFieldErrors(
  errors: Record<string, string>,
  fields: FieldCheck[],
): Record<string, string> {
  if (Object.keys(errors).length === 0) return errors;
  let changed = false;
  const next = { ...errors };
  for (const f of fields) {
    if (f.valid && f.key in next) {
      delete next[f.key];
      changed = true;
    }
  }
  return changed ? next : errors;
}

export function isNonEmptyString(v: string): boolean {
  return v.trim().length > 0;
}

export function isPositiveNumberString(v: string): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}
