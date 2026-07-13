import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "app/[lang]/mbolster-config/mbolster-config-client.tsx",
  "utf8",
);
const dialog = source.slice(
  source.indexOf("<DialogContent", source.indexOf('aria-label="About customisation"')),
  source.indexOf("</DialogContent>", source.indexOf('aria-label="About customisation"')),
);

assert.match(dialog, /<DialogContent\s+hideClose/);
assert.match(dialog, /<OverlayDismissButton variant="inline" \/>/);
assert.ok(
  dialog.indexOf("<PageFaqAccordion") < dialog.indexOf("<OverlayDismissButton"),
  "inline dismiss follows the FAQ accordion",
);

console.log("mbolster FAQ dismiss self-check ok: inline close follows accordion");
