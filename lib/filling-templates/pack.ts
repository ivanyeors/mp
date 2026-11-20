import type { SupabaseClient } from "@supabase/supabase-js";
import { derivePackList } from "@/lib/spatial-fillings/core";

export type FillingPackLine = { item_id: number; quantity: number };

export async function loadFillingTemplatePack(
  admin: SupabaseClient,
  templateId: number,
): Promise<FillingPackLine[]> {
  const { data: template, error: tErr } = await admin
    .from("bom_templates")
    .select("id, kind")
    .eq("id", templateId)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!template) throw new Error(`Filling template ${templateId} not found`);

  const placementTable =
    template.kind === "bolster" ? "bolster_template_placements" : "filling_template_placements";
  const [{ data: placements, error: pErr }, { data: lines, error: lErr }] = await Promise.all([
    admin.from(placementTable).select("item_id").eq("template_id", templateId),
    admin.from("bom_template_lines").select("item_id, quantity").eq("template_id", templateId),
  ]);
  if (pErr) throw new Error(pErr.message);
  if (lErr) throw new Error(lErr.message);

  return derivePackList(
    (placements ?? []).map((p: { item_id: number | string }) => ({ item_id: Number(p.item_id) })),
    (lines ?? []).map((l: { item_id: number | string; quantity: number | string }) => ({
      item_id: Number(l.item_id),
      quantity: Number(l.quantity),
    })),
  ).map((l) => ({ item_id: l.item_id, quantity: l.count }));
}
