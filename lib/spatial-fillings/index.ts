/**
 * Spatial filling placements (ADR 0008): where each filling piece goes. Pure — no I/O.
 * Server entry: re-exports the browser-safe core plus the node-only fingerprint.
 * Client components import from "./core" to keep node:crypto out of the bundle.
 */

import { createHash } from "node:crypto";

import { canonicalize, type AnyPlacement } from "./core";

export * from "./core";

/** Stable sha256 fingerprint of the canonical spatial mix (pillow or bolster). */
export function fingerprintPlacements(placements: AnyPlacement[]): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(placements))).digest("hex");
}
