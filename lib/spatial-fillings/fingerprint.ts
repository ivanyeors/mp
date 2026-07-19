/** Server-only (node:crypto): stable fingerprint of a spatial mix. Split from index so client components can import the pure lib. */

import { createHash } from "node:crypto";

import { canonicalizePlacements, type AnyPlacement } from "./index";

/** Stable sha256 fingerprint of the canonical spatial mix (pillow or bolster). */
export function fingerprintPlacements(placements: AnyPlacement[]): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalizePlacements(placements)))
    .digest("hex");
}
