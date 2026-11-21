import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { roleHasPermission } from "@/lib/auth/permissions";
import {
  activeDiscoverySourceOptions,
  archiveDiscoverySourceOption,
  assertCatalogAllowsSave,
  DEFAULT_DISCOVERY_SOURCE_CATALOG,
  discoverySourceChoices,
  DISCOVERY_SOURCE_SETTING_KEY,
  normalizeDiscoverySourceOther,
  OTHER_DISCOVERY_SOURCE_ID,
  parseDiscoverySourceCatalog,
  resolveDiscoverySourceLabel,
  serializeDiscoverySourceCatalog,
  validateDiscoverySource,
  type DiscoverySourceCatalog,
} from "./index";

const ROOT = process.cwd();

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const seed = DEFAULT_DISCOVERY_SOURCE_CATALOG;
assert.ok(seed.options.length >= 2, "seed has starter options");
const seedOther = seed.options[seed.options.length - 1];
assert.equal(seedOther.id, OTHER_DISCOVERY_SOURCE_ID);
assert.equal(seedOther.system, true);
assert.equal(seedOther.active, true);
assert.ok(seed.options.every((o) => o.labels["en-US"]));
assert.ok(seed.options.every((o) => o.labels["zh-CN"]));

assert.deepEqual(
  parseDiscoverySourceCatalog(null).options.map((o) => o.id),
  seed.options.map((o) => o.id),
);
assert.deepEqual(
  parseDiscoverySourceCatalog("not-json").options.map((o) => o.id),
  seed.options.map((o) => o.id),
);

const reordered: DiscoverySourceCatalog = {
  options: [
    {
      id: OTHER_DISCOVERY_SOURCE_ID,
      labels: { "en-US": "Other", "zh-CN": "其他" },
      active: true,
      system: true,
    },
    {
      id: "instagram",
      labels: { "en-US": "Instagram", "zh-CN": "Instagram" },
      active: true,
    },
  ],
};
const normalized = parseDiscoverySourceCatalog(JSON.stringify(reordered));
assert.equal(normalized.options.at(-1)?.id, OTHER_DISCOVERY_SOURCE_ID);
assert.equal(normalized.options[0]?.id, "instagram");

const archived = archiveDiscoverySourceOption(seed, "instagram");
assert.equal(
  archived.options.find((o) => o.id === "instagram")?.active,
  false,
);
const activeIds = activeDiscoverySourceOptions(archived).map((o) => o.id);
assert.ok(!activeIds.includes("instagram"));
assert.ok(activeIds.includes(OTHER_DISCOVERY_SOURCE_ID));
assert.deepEqual(
  discoverySourceChoices(archived, "zh-CN").map((o) => o.id),
  activeIds,
);
assert.equal(
  resolveDiscoverySourceLabel(archived, "instagram", "en-US"),
  "Instagram",
);
assert.equal(
  resolveDiscoverySourceLabel(archived, "gone-forever", "en-US"),
  "gone-forever",
);

const noOther = assertCatalogAllowsSave({
  options: seed.options.filter((o) => o.id !== OTHER_DISCOVERY_SOURCE_ID),
});
assert.equal(noOther.ok, false);

const otherOff = assertCatalogAllowsSave({
  options: seed.options.map((o) =>
    o.id === OTHER_DISCOVERY_SOURCE_ID ? { ...o, active: false } : o,
  ),
});
assert.equal(otherOff.ok, false);

const archiveOther = archiveDiscoverySourceOption(seed, OTHER_DISCOVERY_SOURCE_ID);
assert.equal(
  archiveOther.options.find((o) => o.id === OTHER_DISCOVERY_SOURCE_ID)?.active,
  true,
);

const okSave = assertCatalogAllowsSave(archived);
assert.equal(okSave.ok, true);

const roundtrip = parseDiscoverySourceCatalog(
  serializeDiscoverySourceCatalog(archived),
);
assert.equal(
  roundtrip.options.find((o) => o.id === "instagram")?.active,
  false,
);

assert.equal(
  validateDiscoverySource({ discoverySource: "" }, seed)?.field,
  "discoverySource",
);
assert.equal(
  validateDiscoverySource({ discoverySource: "nope" }, seed)?.field,
  "discoverySource",
);
assert.equal(
  validateDiscoverySource({ discoverySource: "instagram" }, archived)?.field,
  "discoverySource",
);
assert.equal(
  validateDiscoverySource(
    { discoverySource: OTHER_DISCOVERY_SOURCE_ID, discoverySourceOther: "" },
    seed,
  )?.field,
  "discoverySourceOther",
);
assert.equal(
  validateDiscoverySource(
    { discoverySource: OTHER_DISCOVERY_SOURCE_ID, discoverySourceOther: "a" },
    seed,
  )?.field,
  "discoverySourceOther",
);
assert.equal(
  validateDiscoverySource(
    {
      discoverySource: OTHER_DISCOVERY_SOURCE_ID,
      discoverySourceOther: "  Reddit ads  ",
    },
    seed,
  ),
  null,
);
assert.equal(
  validateDiscoverySource({ discoverySource: "google" }, seed),
  null,
);

assert.equal(normalizeDiscoverySourceOther("google", "ignore me"), null);
assert.equal(
  normalizeDiscoverySourceOther(OTHER_DISCOVERY_SOURCE_ID, "  Reddit  "),
  "Reddit",
);

assert.equal(DISCOVERY_SOURCE_SETTING_KEY, "forms_discovery_source");

const migration = read(
  "supabase/migrations/20260711120000_result_discovery_source.sql",
);
assert.match(migration, /customer_phone/);
assert.match(migration, /discovery_source/);
assert.match(migration, /discovery_source_other/);
assert.match(migration, /mp_config_responses/);

const adminApi = read("app/api/settings/forms/discovery-source/route.ts");
assert.match(adminApi, /requireAdmin\("forms"\)/);
assert.match(adminApi, /export async function GET/);
assert.match(adminApi, /export async function PUT/);

const publicApi = read("app/api/discovery-source/route.ts");
assert.match(publicApi, /discoverySourceChoices/);
assert.doesNotMatch(publicApi, /requireAdmin/);

assert.equal(roleHasPermission("owner", "forms"), true);
assert.equal(roleHasPermission("viewer", "forms"), false);

const context = read("CONTEXT.md");
assert.match(context, /\*\*Discovery source\*\*:/);
assert.match(context, /How did you hear about us/);
assert.match(context, /_Avoid_:\s*referral/);
assert.match(context, /option-list editing only/);
assert.match(context, /Customer preference/);

async function dbRoundtrip() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SUPABASE_URL) {
    console.log("discovery-source.check.ts: ok (skipped DB — no env)");
    return;
  }
  const {
    getDiscoverySourceCatalog,
    saveDiscoverySourceCatalog,
  } = await import("./index");

  const before = await getDiscoverySourceCatalog();
  assert.ok(before.options.some((o) => o.id === OTHER_DISCOVERY_SOURCE_ID));

  const markerId = "slice02-check-channel";
  const withMarker: DiscoverySourceCatalog = {
    options: [
      ...before.options.filter(
        (o) => o.id !== markerId && o.id !== OTHER_DISCOVERY_SOURCE_ID,
      ),
      {
        id: markerId,
        labels: { "en-US": "Slice02 Check", "zh-CN": "切片02检查" },
        active: true,
      },
      before.options.find((o) => o.id === OTHER_DISCOVERY_SOURCE_ID)!,
    ],
  };

  const saved = await saveDiscoverySourceCatalog(withMarker);
  assert.equal(saved.ok, true, "save catalog");
  if (!saved.ok) return;

  const loaded = await getDiscoverySourceCatalog();
  assert.ok(
    loaded.options.some((o) => o.id === markerId && o.active),
    "marker persisted",
  );
  assert.equal(loaded.options.at(-1)?.id, OTHER_DISCOVERY_SOURCE_ID);

  const cleaned: DiscoverySourceCatalog = {
    options: loaded.options.filter((o) => o.id !== markerId),
  };
  const restored = await saveDiscoverySourceCatalog(cleaned);
  assert.equal(restored.ok, true, "cleanup catalog");

  console.log("discovery-source.check.ts: ok (incl. DB roundtrip)");
}

void dbRoundtrip().catch((err) => {
  console.error(err);
  process.exit(1);
});
