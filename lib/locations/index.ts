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
    // A partner's clinics share its name, so the branch name tells them apart.
    name: locationDisplayName(row),
    type: (row.type ?? "partner") as LocationType,
    address: row.address ?? null,
    postalCode: row.postal_code ?? null,
    visible: row.visible,
    // Rows written before the column existed read back as undefined → bookable.
    bookable: row.bookable ?? true,
  };
}

/**
 * Pure booking projection: the Locations a customer may pick. `bookable` is the
 * admin switch; an address is required because it is stamped onto the calendar
 * event. `visible` is deliberately *not* consulted — it only governs
 * /our-partners, and own studios are saved with it off.
 */
export function selectBookableLocations(rows: ResolvedLocation[]): ResolvedLocation[] {
  return rows.filter((l) => l.bookable && !!l.address?.trim());
}

/**
 * Pure partner projection: own studios never leak to /our-partners, and hidden
 * partners are excluded unless explicitly requested. A branch is another clinic
 * of a partner, not a partner, so it is never a row here (ADR 0037). This is
 * the rule the partner-facing surfaces depend on — locked down by unit tests.
 */
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

/**
 * Single fetch of every location row (own + partner), ordered by position with
 * each partner's branches right after it.
 * Locations change rarely and are read on the booking picker, the results list
 * and /our-partners, so the service-role read is cached behind the `locations`
 * tag; every writer of the `partners` table revalidates it.
 */
export const getLocationRows = unstable_cache(_getLocationRows, ["location-rows"], {
  tags: ["locations"],
  revalidate: 300,
});

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
