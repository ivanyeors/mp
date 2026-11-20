export type PairedRow = {
  id: string;
  paired_build_id?: string | null;
};

type Status = string | null | undefined;

export function isAnchor(row: PairedRow): boolean {
  return row.paired_build_id != null && row.paired_build_id === row.id;
}

export function isCompanion(row: PairedRow): boolean {
  return row.paired_build_id != null && row.paired_build_id !== row.id;
}

export function shipsWithAnchor(row: PairedRow): boolean {
  return isCompanion(row);
}

export function isLive(status: Status): boolean {
  return status === "held" || status === "assigned" || status === "accepted";
}

export type EndingPlan = {
  releaseHold: boolean;
  cascadeTo: string | null;
};

export function endingPlan(
  ending: PairedRow & { payment_intent_id?: string | null },
  partner: (PairedRow & { status: Status }) | null,
): EndingPlan {
  const hasHold = ending.payment_intent_id != null;
  if (isAnchor(ending)) {
    const cascade = partner && (partner.status === "held" || partner.status === "assigned");
    return { releaseHold: hasHold, cascadeTo: cascade ? partner.id : null };
  }
  if (isCompanion(ending)) {
    return { releaseHold: hasHold && !(partner && isLive(partner.status)), cascadeTo: null };
  }
  return { releaseHold: hasHold, cascadeTo: null };
}

export function pairAuthorized(
  members: ReadonlyArray<{ authorized_amount?: number | string | null }>,
): number | null {
  let total = 0;
  let any = false;
  for (const m of members) {
    if (m.authorized_amount == null) continue;
    any = true;
    total += Number(m.authorized_amount);
  }
  return any ? Math.round(total * 100) / 100 : null;
}

export type CompanionAtAccept =
  | { ok: true; include: boolean }
  | { ok: false; code: "pair_pending" | "pair_busy"; error: string };

export function companionAtAccept(companion: { status: Status } | null): CompanionAtAccept {
  if (!companion) return { ok: true, include: false };
  switch (companion.status) {
    case "assigned":
      return { ok: true, include: true };
    case "held":
      return {
        ok: false,
        code: "pair_pending",
        error: "Your Mbolster is still being built. You can accept both once it is ready.",
      };
    case "accepted":
    case "captured":
      return {
        ok: false,
        code: "pair_busy",
        error: "This build is already being accepted. Reload and try again.",
      };
    default:
      return { ok: true, include: false };
  }
}

export function pairReadyToAccept(members: ReadonlyArray<{ status: Status }>): boolean {
  return members.every((m) => m.status !== "held");
}

export function pickPartner<T extends { id: string; status?: Status }>(
  members: ReadonlyArray<T>,
  selfId: string,
): T | null {
  const others = members.filter((m) => m.id !== selfId);
  return others.find((m) => isLive(m.status) || m.status === "captured") ?? others[0] ?? null;
}

export function liveCompanions<T extends { id: string; status?: Status }>(
  members: ReadonlyArray<T>,
  anchorId: string,
): T[] {
  return members.filter((m) => m.id !== anchorId && (isLive(m.status) || m.status === "captured"));
}
