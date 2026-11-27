import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { APPLE_SPLASH_BACKGROUND, APPLE_SPLASH_IMAGES } from "../lib/apple-splash";
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

assert.match(
  layout,
  /startupImage:\s*APPLE_SPLASH_IMAGES\.map/,
  "app/layout.tsx must send the apple-touch-startup-image links, or the installed app opens on a blank screen until the first page arrives",
);
assert.ok(
  layout.includes(`color: "${APPLE_SPLASH_BACKGROUND.dark}"`) && layout.includes(`color: "${APPLE_SPLASH_BACKGROUND.light}"`),
  "the launch images use the same two backgrounds as the page (viewport.themeColor), so the screen does not change colour when the page takes over",
);
const urls = new Set<string>();
for (const image of APPLE_SPLASH_IMAGES) {
  const { url, media, widthPx, heightPx, ratio, scheme } = image;
  assert.match(url, /^\/apple-splash\/\d+x\d+-(light|dark)\.png$/, `${url}: the proxy only leaves paths with a file extension alone; anything else is redirected to a language path`);
  assert.equal(url, `/apple-splash/${widthPx}x${heightPx}-${scheme}.png`);
  assert.ok(
    media.includes(`(device-width: ${widthPx / ratio}px)`) &&
      media.includes(`(device-height: ${heightPx / ratio}px)`) &&
      media.includes(`(-webkit-device-pixel-ratio: ${ratio})`) &&
      media.includes(`(prefers-color-scheme: ${scheme})`),
    `${url}: iOS ignores a launch image whose pixel size is not exactly its screen's, so the media query and the file must name the same screen`,
  );
  assert.ok(!urls.has(url), `${url} is listed twice`);
  urls.add(url);
}
for (const { url, scheme } of APPLE_SPLASH_IMAGES) {
  const other = url.replace(`-${scheme}.png`, scheme === "light" ? "-dark.png" : "-light.png");
  assert.ok(urls.has(other), `${url} has no ${scheme === "light" ? "dark" : "light"} twin: that phone would open on a blank screen in the other appearance`);
}
assert.ok(urls.has("/apple-splash/1290x2796-dark.png"), "iPhone Pro Max / Plus (430 x 932 at 3x) is covered");

console.log("web-app-head: ok");
