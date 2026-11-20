export const VISIT_INACTIVITY_MS = 30 * 60 * 1000;

export type LifecycleEvent = {
  type: "page_view" | "section_view" | "heartbeat";
  path: string;
  sectionId?: string | null;
  occurredAt: string;
};

export type DropOff = {
  path: string;
  sectionId: string | null;
  dwellMs: number;
  endedAt: string;
};

export function resolveInactivityDropOff(
  events: LifecycleEvent[],
  nowIso: string,
  inactivityMs: number = VISIT_INACTIVITY_MS,
): DropOff | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const last = sorted[sorted.length - 1]!;
  const lastMs = Date.parse(last.occurredAt);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs)) return null;
  if (nowMs - lastMs < inactivityMs) return null;

  const firstMs = Date.parse(sorted[0]!.occurredAt);
  const dwellMs = Math.max(0, lastMs - (Number.isFinite(firstMs) ? firstMs : lastMs));

  let path = last.path;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i]!.type === "page_view") {
      path = sorted[i]!.path;
      break;
    }
  }
  let sectionId: string | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i]!.sectionId;
    if (s) {
      sectionId = s;
      break;
    }
  }

  return {
    path,
    sectionId,
    dwellMs,
    endedAt: new Date(lastMs + inactivityMs).toISOString(),
  };
}

export function resolveExplicitDropOff(
  events: LifecycleEvent[],
  endedAtIso: string,
): DropOff | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const last = sorted[sorted.length - 1]!;
  const firstMs = Date.parse(sorted[0]!.occurredAt);
  const endMs = Date.parse(endedAtIso);
  const lastMs = Date.parse(last.occurredAt);
  const dwellMs = Math.max(
    0,
    (Number.isFinite(lastMs) ? lastMs : endMs) - (Number.isFinite(firstMs) ? firstMs : endMs),
  );

  let path = last.path;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i]!.type === "page_view") {
      path = sorted[i]!.path;
      break;
    }
  }
  let sectionId: string | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i]!.sectionId;
    if (s) {
      sectionId = s;
      break;
    }
  }

  return { path, sectionId, dwellMs, endedAt: endedAtIso };
}

export function shouldStartNewVisit(
  lastActivityIso: string | null,
  nowIso: string,
  inactivityMs: number = VISIT_INACTIVITY_MS,
): boolean {
  if (!lastActivityIso) return true;
  const last = Date.parse(lastActivityIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(last) || !Number.isFinite(now)) return true;
  return now - last >= inactivityMs;
}
