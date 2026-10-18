/**
 * Soft cut settings (ADR 0025): the few knobs Staff tune in Settings →
 * Inventory → Configure → Soft body, stored as one JSON site setting. Absent,
 * unparsable or out-of-range values fall back to the defaults below — the
 * values the testing preview settled on (Oct 2026). Every surface that draws
 * the cut reads the same stored value, so what Staff save is what shoppers
 * and the build team see. Pure + browser-safe.
 */

// Type-only: the payload module never loads at runtime from here, so there is no cycle.
import type { DimensionOverridesPayload } from "./dimension-overrides";
import { SOLVER_DEFAULTS, type SolverOptions } from "./soft-body";

/** `site_settings.key` holding the soft cut settings as JSON. */
export const SOFT_BODY_SETTING_KEY = "xray_soft_body";

export type SoftBodySettings = {
  /** Off draws the cut as rounded slabs, as before the soft cut. */
  enabled: boolean;
  /** How firmly a pouch keeps its cushion shape, 0 floppy … 100 stiff. */
  rigidity: number;
  /** A pouch's volume as a share of its relaxed size, %. Over 100 lets it fill the space it is given. */
  volumePct: number;
  /** How high the empty case stands, as a share of its sewn height, %. */
  emptyCasePct: number;
  /** Smoothing passes on what is drawn: more is rounder, 0 shows the raw settle. */
  smoothing: number;
  /** Space kept between pieces so each stays countable, view units. */
  gap: number;
  /** Settle length, steps of 1/60 s. */
  steps: number;
  /** Animate the settle when the recipe changes (never under reduced motion). */
  animate: boolean;
};

type NumberKey = { [K in keyof SoftBodySettings]: SoftBodySettings[K] extends number ? K : never }[keyof SoftBodySettings];

/** Each number's range and step, as the Settings sliders offer them. */
export const SOFT_BODY_RANGES: Record<NumberKey, { min: number; max: number; step: number }> = {
  rigidity: { min: 0, max: 100, step: 1 },
  volumePct: { min: 80, max: 180, step: 1 },
  emptyCasePct: { min: 20, max: 70, step: 1 },
  smoothing: { min: 0, max: 16, step: 1 },
  gap: { min: 1, max: 8, step: 0.5 },
  steps: { min: 8, max: 48, step: 1 },
};

export const SOFT_BODY_DEFAULTS: SoftBodySettings = {
  enabled: true,
  rigidity: 50,
  volumePct: 130,
  emptyCasePct: Math.round(SOLVER_DEFAULTS.slump * 100),
  smoothing: 8,
  gap: SOLVER_DEFAULTS.gap,
  steps: SOLVER_DEFAULTS.steps,
  animate: true,
};

const clampTo = (key: NumberKey, value: unknown): number => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return SOFT_BODY_DEFAULTS[key];
  const { min, max, step } = SOFT_BODY_RANGES[key];
  const stepped = Math.round(n / step) * step;
  return Math.min(Math.max(Number(stepped.toFixed(3)), min), max);
};

/** The settings from their stored value (JSON text or an object); anything missing or invalid is its default. */
export function softBodySettings(value: unknown): SoftBodySettings {
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      raw = null;
    }
  }
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : SOFT_BODY_DEFAULTS.enabled,
    rigidity: clampTo("rigidity", o.rigidity),
    volumePct: clampTo("volumePct", o.volumePct),
    emptyCasePct: clampTo("emptyCasePct", o.emptyCasePct),
    smoothing: clampTo("smoothing", o.smoothing),
    gap: clampTo("gap", o.gap),
    steps: clampTo("steps", o.steps),
    animate: typeof o.animate === "boolean" ? o.animate : SOFT_BODY_DEFAULTS.animate,
  };
}

/** What is stored: the settings as JSON, validated. */
export function softBodySettingsToStored(s: Partial<SoftBodySettings>): string {
  return JSON.stringify(softBodySettings(s));
}

/** What `GET /settings/product-builder/soft-body` returns, and its POST and DELETE too. */
export type SoftBodyPayload = {
  /** The effective settings: the stored row, or the defaults without one. */
  settings: SoftBodySettings;
  /** False when no row is stored and every cut draws the defaults. */
  stored: boolean;
  /** When the row was last saved; null without one. */
  updatedAt: string | null;
  /** What Reset returns to. */
  defaults: SoftBodySettings;
};

/**
 * The settings a host draws the cut with: the stored value its dimension
 * overrides payload carries, or the defaults before it loads (or when the
 * payload predates the setting).
 */
export function softBodyFromPayload(payload: DimensionOverridesPayload | null | undefined): SoftBodySettings {
  return softBodySettings(payload?.softBody ?? null);
}

export const sameSoftBodySettings = (a: SoftBodySettings, b: SoftBodySettings) =>
  (Object.keys(SOFT_BODY_DEFAULTS) as (keyof SoftBodySettings)[]).every((k) => a[k] === b[k]);

/**
 * The solver's options for these settings in a cut drawn `scale` times the
 * 664-wide desktop cut (lengths, speeds and areas scale with it). Rigidity is
 * shape memory and skin tension together: the preview's 0 … 100 mapping.
 */
export function solverOptionsFor(s: SoftBodySettings, scale = 1): Partial<SolverOptions> {
  const rig = s.rigidity / 100;
  return {
    steps: s.steps,
    slump: s.emptyCasePct / 100,
    gap: s.gap * scale,
    margin: SOLVER_DEFAULTS.margin * scale,
    billow: SOLVER_DEFAULTS.billow * scale,
    maxStep: SOLVER_DEFAULTS.maxStep * scale,
    gravity: SOLVER_DEFAULTS.gravity * scale,
    shapeMemory: 0.01 + rig * 0.06,
    skin: 0.08 + rig * 0.24,
  };
}
