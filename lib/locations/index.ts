import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { PartnerRow } from "@/lib/partners/types";
import { isBranch, locationDisplayName, orderWithBranches } from "./branches";

export {
  branchesByParent,
  formatLocationAddress,
  isBranch,
  locationDisplayName,
  locationMapsUrl,
  orderWithBranches,
} from "./branches";

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
  bookable: boolean;
};

export function toResolvedLocation(row: LocationRow): ResolvedLocation {
  return {
    id: row.id,
    name: locationDisplayName(row),
    type: (row.type ?? "partner") as LocationType,
    address: row.address ?? null,
    postalCode: row.postal_code ?? null,
    visible: row.visible,
    bookable: row.bookable ?? true,
  };
}

export function selectBookableLocations(rows: ResolvedLocation[]): ResolvedLocation[] {
  return rows.filter((l) => l.bookable && !!l.address?.trim());
}

export async function readBookingLocations(): Promise<{ id: string; name: string; type: string; address: string }[]> {
  return selectBookableLocations(await getLocations()).map(({ id, name, type, address }) => ({ id, name, type, address: address ?? "" }));
}

export function selectPartnerRows(rows: LocationRow[], includeHidden = false): LocationRow[] {
  return rows.filter(
    (r) => (r.type ?? "partner") === "partner" && !isBranch(r) && (includeHidden || r.visible),
  );
}

async function _getLocationRows(): Promise<LocationRow[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("partners")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    console.error("[getLocationRows]", error.message);
    return [];
  }

  return orderWithBranches((data as LocationRow[]) ?? []);
}

export const getLocationRows = unstable_cache(_getLocationRows, ["location-rows"], {
  tags: ["locations"],
  revalidate: 300,
});

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
