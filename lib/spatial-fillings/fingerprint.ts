import { createHash } from "node:crypto";

import { canonicalizePlacements, type AnyPlacement } from "./core";

export function fingerprintPlacements(placements: AnyPlacement[]): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalizePlacements(placements)))
    .digest("hex");
}
