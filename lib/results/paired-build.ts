/**
 * Paired build (ADR 0026): an Mpillow Result (the anchor) and an Mbolster Result
 * (the companion) under one Authorization hold, accepted together into one Order.
 *
 * Pure. The routes do the I/O and ask these what a pair means, so the rules that
 * keep one hold safe across two Results live in one place.
 */

export type PairedRow = {
  id: string;
  paired_build_id?: string | null;
};

type Status = string | null | undefined;

/** Both rows carry the anchor's id; an unpaired Result carries null. */
export function isAnchor(row: PairedRow): boolean {
  return row.paired_build_id != null && row.paired_build_id === row.id;
}

export function isCompanion(row: PairedRow): boolean {
  return row.paired_build_id != null && row.paired_build_id !== row.id;
}

/**
 * The companion rides in the anchor's shipment, so it never charges shipping of
 * its own. Every repricing site asks this rather than the product type.
 */
export function shipsWithAnchor(row: PairedRow): boolean {
  return isCompanion(row);
}

/** Still in play: neither ended nor turned into an Order. */
export function isLive(status: Status): boolean {
  return status === "held" || status === "assigned" || status === "accepted";
}

export type EndingPlan = {
  /** Cancel the shared PaymentIntent. */
  releaseHold: boolean;
  /** The partner that ends with this member, in the same status. */
  cascadeTo: string | null;
};

/**
 * What ending one member (decline, cancel, expire, delete) does to the pair.
 *
 * The anchor anchors: ending it ends a companion that is still `held` or
 * `assigned`, and frees the hold. Ending the companion leaves the anchor and the
 * hold it still needs alone. The hold is released only once the anchor has ended
 * too, which is how a companion is never charged and never stranded.
 */
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

/**
 * The whole intent: what one Checkout authorised for every member. Each row
 * quotes only its own build, so the intent's capacity is their sum. Null when no
 * member was held on a card.
 */
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

/**
 * Whether Accept on the anchor takes the companion along. An assigned companion
 * is accepted with it; one that has ended is left out, and the capture simply
 * stops short of its share. A companion still being built blocks Accept, because
 * the hold can be captured only once.
 */
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

/**
 * The shopper can be asked to accept once no member is still being built: the
 * assigned email waits for the second build rather than inviting an Accept that
 * would be refused.
 */
export function pairReadyToAccept(members: ReadonlyArray<{ status: Status }>): boolean {
  return members.every((m) => m.status !== "held");
}
