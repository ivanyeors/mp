/**
 * Issue #62: mobile click-to-play YouTube facade (token asserts).
 * Run: npx tsx components/effects/youtube-facade.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const src = readFileSync(join(ROOT, "components/effects/youtube-autoplay-on-view.tsx"), "utf8");

// Mobile gate.
assert.match(src, /useIsMobile/);

// Lightweight poster thumbnail from YouTube.
assert.match(src, /img\.youtube\.com/);

// Iframe mount gated on tap/state, not just scroll visibility.
assert.match(src, /showIframe/);
assert.match(src, /setShowIframe\(true\)/);

console.log("youtube-facade.check.ts: ok");
