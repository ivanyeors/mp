import type { DimensionOverridesPayload } from "./dimension-overrides";
import { SOLVER_DEFAULTS, type SolverOptions } from "./soft-body";

export const SOFT_BODY_SETTING_KEY = "xray_soft_body";

export type SoftBodySettings = {
  enabled: boolean;
  rigidity: number;
  neckFirmness: number;
  earFirmness: number;
  earWellPct: number;
  earWellDepthPct: number;
  volumePct: number;
  emptyCasePct: number;
  smoothing: number;
  gap: number;
  steps: number;
  animate: boolean;
};

type NumberKey = { [K in keyof SoftBodySettings]: SoftBodySettings[K] extends number ? K : never }[keyof SoftBodySettings];

export const SOFT_BODY_RANGES: Record<NumberKey, { min: number; max: number; step: number }> = {
  rigidity: { min: 0, max: 100, step: 1 },
  neckFirmness: { min: 0, max: 100, step: 1 },
  earFirmness: { min: 0, max: 100, step: 1 },
  earWellPct: { min: 15, max: 60, step: 1 },
  earWellDepthPct: { min: 0, max: 80, step: 1 },
  volumePct: { min: 80, max: 180, step: 1 },
  emptyCasePct: { min: 20, max: 70, step: 1 },
  smoothing: { min: 0, max: 16, step: 1 },
  gap: { min: 1, max: 8, step: 0.5 },
  steps: { min: 8, max: 48, step: 1 },
};

export const SOFT_BODY_DEFAULTS: SoftBodySettings = {
  enabled: true,
  rigidity: 50,
  neckFirmness: Math.round(SOLVER_DEFAULTS.rollFirmness * 100),
  earFirmness: Math.round(SOLVER_DEFAULTS.padFirmness * 100),
  earWellPct: 32,
  earWellDepthPct: 55,
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
    neckFirmness: clampTo("neckFirmness", o.neckFirmness),
    earFirmness: clampTo("earFirmness", o.earFirmness),
    earWellPct: clampTo("earWellPct", o.earWellPct),
    earWellDepthPct: clampTo("earWellDepthPct", o.earWellDepthPct),
    volumePct: clampTo("volumePct", o.volumePct),
    emptyCasePct: clampTo("emptyCasePct", o.emptyCasePct),
    smoothing: clampTo("smoothing", o.smoothing),
    gap: clampTo("gap", o.gap),
    steps: clampTo("steps", o.steps),
    animate: typeof o.animate === "boolean" ? o.animate : SOFT_BODY_DEFAULTS.animate,
  };
}

export function softBodySettingsToStored(s: Partial<SoftBodySettings>): string {
  return JSON.stringify(softBodySettings(s));
}

export type SoftBodyPayload = {
  settings: SoftBodySettings;
  stored: boolean;
  updatedAt: string | null;
  defaults: SoftBodySettings;
};

export function softBodyFromPayload(payload: DimensionOverridesPayload | null | undefined): SoftBodySettings {
  return softBodySettings(payload?.softBody ?? null);
}

export const sameSoftBodySettings = (a: SoftBodySettings, b: SoftBodySettings) =>
  (Object.keys(SOFT_BODY_DEFAULTS) as (keyof SoftBodySettings)[]).every((k) => a[k] === b[k]);

export const DRAFT_STEPS = 8;

export const HELD_EASE_MS = 130;

export function draftSoftBody(s: SoftBodySettings): SoftBodySettings {
  return s.steps <= DRAFT_STEPS ? s : { ...s, steps: DRAFT_STEPS };
}

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
    rollFirmness: s.neckFirmness / 100,
    padFirmness: s.earFirmness / 100,
  };
}

export type PadWell = { width: number; depth: number };

export function padWellOf(s: Pick<SoftBodySettings, "earWellPct" | "earWellDepthPct">): PadWell {
  return { width: s.earWellPct / 100, depth: s.earWellDepthPct / 100 };
}
