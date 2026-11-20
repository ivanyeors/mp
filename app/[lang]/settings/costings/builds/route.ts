import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { loadTemplateKeys } from "@/lib/filling-templates/membership";
import { derivePackList } from "@/lib/spatial-fillings";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 1000;

type PlacementRow = { template_id: number; item_id: number };

async function readPlacements(
  admin: ReturnType<typeof supabaseAdmin>,
  table: "filling_template_placements" | "bolster_template_placements",
  templateIds: number[],
): Promise<PlacementRow[]> {
  if (templateIds.length === 0) return [];
  const rows: PlacementRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select("template_id,item_id")
      .in("template_id", templateIds)
      .order("template_id")
      .order("item_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as PlacementRow[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function GET() {
  const denied = await requireAdmin("costings");
  if (denied) return denied;

  const admin = supabaseAdmin();
  try {
    const { data: templateRows, error: templateError } = await admin
      .from("bom_templates")
      .select("id,kind,name")
      .eq("role", "filling")
      .eq("is_active", true)
      .order("name");
    if (templateError) throw new Error(templateError.message);
    const templates = (templateRows ?? []) as Array<{ id: number; kind: string; name: string }>;
    const ids = templates.map((t) => Number(t.id));
    const idsOf = (kind: string) => templates.filter((t) => t.kind === kind).map((t) => Number(t.id));

    const [keys, lines, pillowPlacements, bolsterPlacements] = await Promise.all([
      loadTemplateKeys(admin, ids),
      ids.length
        ? admin.from("bom_template_lines").select("template_id,item_id,quantity").in("template_id", ids)
        : Promise.resolve({ data: [], error: null }),
      readPlacements(admin, "filling_template_placements", idsOf("pillow")),
      readPlacements(admin, "bolster_template_placements", idsOf("bolster")),
    ]);
    if (!keys.ok) throw new Error(keys.error);
    if (lines.error) throw new Error(lines.error.message);

    const linesById = new Map<number, Array<{ item_id: number; quantity: number }>>();
    for (const l of (lines.data ?? []) as Array<{ template_id: number; item_id: number; quantity: number | string }>) {
      const id = Number(l.template_id);
      linesById.set(id, [...(linesById.get(id) ?? []), { item_id: Number(l.item_id), quantity: Number(l.quantity) }]);
    }
    const placementsById = new Map<number, PlacementRow[]>();
    for (const p of [...pillowPlacements, ...bolsterPlacements]) {
      const id = Number(p.template_id);
      placementsById.set(id, [...(placementsById.get(id) ?? []), p]);
    }

    return NextResponse.json({
      ok: true,
      templates: templates.map((t) => {
        const id = Number(t.id);
        return {
          id,
          kind: t.kind,
          name: t.name,
          keys: keys.byId.get(id) ?? [],
          pack: derivePackList(placementsById.get(id) ?? [], linesById.get(id) ?? []).map((l) => ({
            itemId: l.item_id,
            count: l.count,
          })),
        };
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't load Filling Templates." },
      { status: 500 },
    );
  }
}
