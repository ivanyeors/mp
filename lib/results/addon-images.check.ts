import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

import { resolveAddonImageUrls } from "./addon-images";

const urls = resolveAddonImageUrls(
  [
    { id: 1, primary_media_asset_id: "a" },
    { id: 2, primary_media_asset_id: "b" },
    { id: 3, primary_media_asset_id: "c" },
    { id: 4, primary_media_asset_id: null },
    { id: 5, primary_media_asset_id: "missing" },
  ],
  [
    { id: "a", kind: "image", hosted_url: "https://cdn/x.jpg" },
    { id: "b", kind: "video", hosted_url: "https://cdn/v.mp4" },
    { id: "c", kind: "image", hosted_url: null },
  ],
);
assert.deepEqual([...urls.entries()], [[1, "https://cdn/x.jpg"]]);

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const route = read("app", "api", "results", "addons", "route.ts");
assert.match(route, /resolveAddonImageUrls/, "addons API must resolve item images");
assert.match(route, /image_url/, "addons API must serve image_url");

const cards = read("components", "configurator", "addon-cards.tsx");
assert.match(cards, /addon\.image_url &&/, "option card must fall back to text-only when no image");
assert.match(cards, /flex-col items-center gap-2 lg:flex-row/, "selected previews must stack on mobile, row on desktop");

for (const client of [
  ["app", "[lang]", "mp-config", "mp-config-client.tsx"],
  ["app", "[lang]", "mbolster-config", "mbolster-config-client.tsx"],
] as const) {
  const src = read(...client);
  assert.match(src, /<SelectedAddonPreviews addons=\{addons\} selectedIds=\{selectedAddons\} \/>/, `${client.at(-1)} must render selected previews on the left`);
  assert.match(src, /<AddonOptionButton/, `${client.at(-1)} must render add-on option cards`);
}

assert.match(read("app", "[lang]", "mp-basic", "page.tsx"), /mp-config\/page/);

console.log("addon-images.check: all assertions passed");
