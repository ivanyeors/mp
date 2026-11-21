import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import manifest from "./manifest";

const layout = readFileSync(path.join(import.meta.dirname, "layout.tsx"), "utf8");

assert.match(
  layout,
  /["']apple-mobile-web-app-capable["']\s*:\s*["']yes["']/,
  "app/layout.tsx must send apple-mobile-web-app-capable itself: Next 16 renders appleWebApp.capable as mobile-web-app-capable only, and without the Apple tag an iPhone home-screen icon can open with Safari's bars",
);
assert.doesNotMatch(
  layout,
  /["']mobile-web-app-capable["']\s*:/,
  "mobile-web-app-capable already comes from appleWebApp.capable; listing it under `other` sends it twice and leaves out the Apple tag",
);

const m = manifest();
assert.equal(m.display, "standalone", "the installed app opens without browser bars only when the manifest says standalone");
assert.equal(m.scope, "/", "a narrower scope shows browser bars on every page outside it");
assert.ok(m.start_url?.startsWith("/"), "start_url must stay on the address the app was added from, or iOS shows browser bars at launch");

console.log("web-app-head: ok");
