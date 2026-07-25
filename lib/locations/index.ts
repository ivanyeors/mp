import { supabaseAdmin } from "@/lib/supabase/server";
import type { PartnerRow } from "@/lib/partners/types";

// ponytail: Locations live in the legacy `partners` table (additive columns, ADR 0012 —
// no rename, prod-safe). `type` discriminates own studios from partner clinics.
export type LocationType = "own" | "partner";
export type LocationRow = PartnerRow;

export type ResolvedLocation = {
  id: string;
  name: string;
  type: LocationType;
  address: string | null;
  postalCode: string | null;
  visible: boolean;
};

export function toResolvedLocation(row: LocationRow): ResolvedLocation {
  return {
    id: row.id,
    name: row.name,
    type: (row.type ?? "partner") as LocationType,
    address: row.address ?? null,
    postalCode: row.postal_code ?? null,
    visible: row.visible,
  };
}

/**
 * Pure partner projection: own studios never leak to /our-partners, and hidden
 * partners are excluded unless explicitly requested. This is the rule the
 * partner-facing surfaces depend on — locked down by unit tests.
 */
export function selectPartnerRows(rows: LocationRow[], includeHidden = false): LocationRow[] {
  return rows.filter(
    (r) => (r.type ?? "partner") === "partner" && (includeHidden || r.visible),
  );
}

/** Single fetch of every location row (own + partner), ordered by position. */
export async function getLocationRows(): Promise<LocationRow[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("partners")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    console.error("[getLocationRows]", error.message);
    return [];
  }

  return (data as LocationRow[]) ?? [];
}

/** All locations (own + partner), or one type when `opts.type` is given. */
export async function getLocations(opts?: { type?: LocationType }): Promise<ResolvedLocation[]> {
  const rows = await getLocationRows();
  const filtered = opts?.type
    ? rows.filter((r) => (r.type ?? "partner") === opts.type)
    : rows;
  return filtered.map(toResolvedLocation);
}

export async function getLocation(id: string): Promise<ResolvedLocation | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("partners")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[getLocation]", error.message);
    return null;
  }

  return data ? toResolvedLocation(data as LocationRow) : null;
}
