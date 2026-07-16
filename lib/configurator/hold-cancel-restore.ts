/** Hold-cancel restore: persist preview + hold-prep so Stripe cancel returns to customisation. */

export type HoldPrepAddress = {
  recipient: string;
  line1: string;
  line2: string;
  city: string;
  postal_code: string;
  country: string;
};

export type HoldPrepSelections = {
  selectedCover: number | null;
  selectedCase: number | null;
  selectedAddons: number[];
  selectedShippingId: string;
  holdEmail: string;
  holdPhone: string;
  discoverySource: string;
  discoverySourceOther: string;
  notes: string;
  holdAddress: HoldPrepAddress;
};

export type HoldCancelSurface = "mp-full" | "mp-basic" | "mbolster";

export type HoldCancelDraft = {
  v: 1;
  surface: HoldCancelSurface;
  step: "preview";
  responseId?: string | null;
  measurementUnit?: "cm" | "in";
  /** Opaque measurement blob — client owns the shape. */
  measurementData?: Record<string, unknown>;
  heightUnit?: "cm" | "m";
  heightCm?: string;
  sleepPosition?: "side" | "stomach" | "other" | null;
  selections: HoldPrepSelections;
};

export function holdCancelDraftKey(surface: HoldCancelSurface): string {
  return `mp_hold_cancel_${surface}_v1`;
}

export function isHoldCancelledQuery(search: string): boolean {
  const q = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(q).get("hold_cancelled") === "1";
}

/** Drop hold_cancelled from the query string (keeps other params). */
export function stripHoldCancelledFromSearch(search: string): string {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(q);
  params.delete("hold_cancelled");
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function shouldRestorePreview(opts: {
  holdCancelled: boolean;
  draftStep: string | null | undefined;
}): boolean {
  return opts.holdCancelled || opts.draftStep === "preview";
}

export function parseHoldPrepSelections(raw: unknown): HoldPrepSelections | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const cover = s.selectedCover;
  const caseId = s.selectedCase;
  if (cover != null && typeof cover !== "number") return null;
  if (caseId != null && typeof caseId !== "number") return null;
  const addons = Array.isArray(s.selectedAddons)
    ? s.selectedAddons.filter((n): n is number => typeof n === "number")
    : [];
  const addr = s.holdAddress;
  if (!addr || typeof addr !== "object") return null;
  const a = addr as Record<string, unknown>;
  return {
    selectedCover: (cover as number | null) ?? null,
    selectedCase: (caseId as number | null) ?? null,
    selectedAddons: addons,
    selectedShippingId: typeof s.selectedShippingId === "string" ? s.selectedShippingId : "",
    holdEmail: typeof s.holdEmail === "string" ? s.holdEmail : "",
    holdPhone: typeof s.holdPhone === "string" ? s.holdPhone : "",
    discoverySource: typeof s.discoverySource === "string" ? s.discoverySource : "",
    discoverySourceOther:
      typeof s.discoverySourceOther === "string" ? s.discoverySourceOther : "",
    notes: typeof s.notes === "string" ? s.notes : "",
    holdAddress: {
      recipient: typeof a.recipient === "string" ? a.recipient : "",
      line1: typeof a.line1 === "string" ? a.line1 : "",
      line2: typeof a.line2 === "string" ? a.line2 : "",
      city: typeof a.city === "string" ? a.city : "",
      postal_code: typeof a.postal_code === "string" ? a.postal_code : "",
      country: typeof a.country === "string" ? a.country : "SG",
    },
  };
}

export function parseHoldCancelDraft(raw: unknown): HoldCancelDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.v !== 1) return null;
  if (d.step !== "preview") return null;
  if (d.surface !== "mp-full" && d.surface !== "mp-basic" && d.surface !== "mbolster") {
    return null;
  }
  const selections = parseHoldPrepSelections(d.selections);
  if (!selections) return null;
  return {
    v: 1,
    surface: d.surface,
    step: "preview",
    responseId: typeof d.responseId === "string" || d.responseId == null ? (d.responseId as string | null) : undefined,
    measurementUnit: d.measurementUnit === "cm" || d.measurementUnit === "in" ? d.measurementUnit : undefined,
    measurementData:
      d.measurementData && typeof d.measurementData === "object"
        ? (d.measurementData as Record<string, unknown>)
        : undefined,
    heightUnit: d.heightUnit === "cm" || d.heightUnit === "m" ? d.heightUnit : undefined,
    heightCm: typeof d.heightCm === "string" ? d.heightCm : undefined,
    sleepPosition:
      d.sleepPosition === "side" ||
      d.sleepPosition === "stomach" ||
      d.sleepPosition === "other" ||
      d.sleepPosition === null
        ? d.sleepPosition
        : undefined,
    selections,
  };
}

export function readHoldCancelDraft(
  storage: Pick<Storage, "getItem">,
  surface: HoldCancelSurface,
): HoldCancelDraft | null {
  try {
    const raw = storage.getItem(holdCancelDraftKey(surface));
    if (!raw) return null;
    return parseHoldCancelDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeHoldCancelDraft(
  storage: Pick<Storage, "setItem">,
  draft: HoldCancelDraft,
): void {
  storage.setItem(holdCancelDraftKey(draft.surface), JSON.stringify(draft));
}

export function clearHoldCancelDraft(
  storage: Pick<Storage, "removeItem">,
  surface: HoldCancelSurface,
): void {
  storage.removeItem(holdCancelDraftKey(surface));
}

export const HOLD_CANCELLED_NOTICE = {
  title: "Payment cancelled",
  description: "Your choices are still here — you can try again when ready.",
} as const;
