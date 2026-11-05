/**
 * The Result's own Filling configuration on the Result detail page: what Staff
 * may do with it in each state. Pure, and shared by the page (which editor it
 * mounts) and the draft save route (what it refuses), so the button and the
 * route cannot disagree.
 *
 * - **draft**: a **Draft Result** (no status yet — the customer has not
 *   submitted). Staff lay the fillings out ahead of them and save the mix onto
 *   the Result. Nothing else moves: no status, no price, no email. When the
 *   customer submits, the hold keeps the mix (`/api/results/hold` replaces a
 *   Result's placements only when the configurator sends its own), and it
 *   arrives in Needs assign ready to confirm.
 * - **assign**: `held`. The Assignment card edits the mix and Save assignment
 *   confirms it (`/api/results/[id]/assign`), as before.
 * - **view**: everything after. The mix is shown read-only; a change to an
 *   `assigned` build goes through Edit configuration, which reprices it.
 *
 * Mpillow only for drafts: the Mbolster configurator creates no Draft Result
 * (its session id is minted at hold), so there is nothing to save onto.
 */

export type FillingMixMode = "draft" | "assign" | "view";

export type FillingMixRow = {
  status?: string | null;
  order_id?: string | null;
  product_type?: string | null;
};

export function fillingMixMode(row: FillingMixRow): FillingMixMode {
  if (draftMixVerdict(row).ok) return "draft";
  if (row.status === "held") return "assign";
  return "view";
}

export type DraftMixVerdict = { ok: true } | { ok: false; reason: string };

/** Whether Staff may save a filling mix onto this Result without assigning it. */
export function draftMixVerdict(row: FillingMixRow): DraftMixVerdict {
  if (row.order_id) {
    return { ok: false, reason: "This Result is already an Order — change it there" };
  }
  if (row.status != null) {
    return {
      ok: false,
      reason:
        row.status === "held"
          ? "The customer has submitted — confirm the mix with Save assignment"
          : `Cannot save a mix on a Result that is ${row.status}`,
    };
  }
  if ((row.product_type ?? "pillow") !== "pillow") {
    return { ok: false, reason: "Only an Mpillow draft can carry a mix" };
  }
  return { ok: true };
}
