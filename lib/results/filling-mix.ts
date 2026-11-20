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
