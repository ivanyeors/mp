/**
 * Spatial filling placements (ADR 0008): where each filling piece goes. Pure — no I/O.
 * Server entry: re-exports the browser-safe core plus the node-only fingerprint.
 * Client components import from "./core" to keep node:crypto out of the bundle.
 */

export * from "./core";
export { fingerprintPlacements } from "./fingerprint";
