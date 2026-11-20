import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { invalidateTag } from "@/lib/cache/invalidate";
import { requireBearerOrAdmin } from "@/lib/auth/bearer-or-admin";
import { easyshipList } from "@/lib/easyship/client";
import type { EasyshipReference } from "@/lib/easyship/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const readReference = unstable_cache(
  async (): Promise<EasyshipReference> => {
    type Country = { id: number; alpha2: string; name: string };
    type Service = { id: string; name: string; umbrella_name: string; active: boolean };
    type Box = { id: string; name: string; type: "box" | "flat_rate_box" };
    type Address = { id: string; status: string; company_name: string | null; line_1: string; city: string };
    type Store = { id: string; name: string };
    type Category = { id: number | string; name: string };
    const [countries, services, boxes, addresses, stores, categories] = await Promise.all([
      easyshipList<Country>("/countries", "countries"),
      easyshipList<Service>("/courier_services", "courier_services"),
      easyshipList<Box>("/boxes", "boxes"),
      easyshipList<Address>("/addresses", "addresses"),
      easyshipList<Store>("/stores", "stores").catch(() => []),
      easyshipList<Category>("/item_categories", "item_categories").catch(() => []),
    ]);
    return {
      countries: countries.map(({ id, alpha2, name }) => ({ id, alpha2, name })).sort((a, b) => a.name.localeCompare(b.name)),
      courier_services: services
        .filter((s) => s.active)
        .map(({ id, name, umbrella_name }) => ({ id, name, umbrella_name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      boxes: boxes.map(({ id, name, type }) => ({ id, name, type })),
      addresses: addresses
        .filter((a) => a.status === "active")
        .map((a) => ({ id: a.id, label: [a.company_name, a.line_1, a.city].filter(Boolean).join(" · ") })),
      stores: stores.map(({ id, name }) => ({ id, name })),
      categories: categories.map(({ id, name }) => ({ id: String(id), name })),
    };
  },
  ["easyship-reference"],
  { tags: ["easyship-reference"], revalidate: 3600 },
);

export async function GET(req: Request) {
  const denied = await requireBearerOrAdmin(req, "EASYSHIP_SYNC_TOKEN", "shipping");
  if (denied) return denied;
  try {
    if (new URL(req.url).searchParams.get("refresh") === "1") invalidateTag("easyship-reference");
    return NextResponse.json({ ok: true, reference: await readReference() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
