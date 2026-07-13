/**
 * Run: npx tsx components/ui/app-dock-visibility.check.ts
 */
import assert from "node:assert/strict";
import { isNearDocumentBottom } from "./app-dock-visibility";

assert.equal(isNearDocumentBottom(800, 1176, 2000), true);
assert.equal(isNearDocumentBottom(800, 1175, 2000), false);
assert.equal(isNearDocumentBottom(800, 1200, 2000), true);

console.log("app-dock-visibility.check.ts: ok");
