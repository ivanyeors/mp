import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const src = readFileSync(join(ROOT, "components/effects/youtube-autoplay-on-view.tsx"), "utf8");

assert.match(src, /useIsMobile/);

assert.match(src, /img\.youtube\.com/);

assert.match(src, /showIframe/);
assert.match(src, /setShowIframe\(true\)/);

console.log("youtube-facade.check.ts: ok");
