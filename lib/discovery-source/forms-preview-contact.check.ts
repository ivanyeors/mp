import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { previewContactFieldChecks } from "@/components/configurator/preview-contact-fields";
import { permissionForHref, roleHasPermission } from "@/lib/auth/permissions";
import { OTHER_DISCOVERY_SOURCE_ID } from "@/lib/discovery-source";

const ROOT = process.cwd();
function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

assert.equal(
  previewContactFieldChecks({
    email: "",
    phone: "",
    discoverySource: "",
    discoverySourceOther: "",
    notes: "",
  }).filter((f) => !f.valid).length,
  3,
);

assert.ok(
  previewContactFieldChecks({
    email: "a@b.co",
    phone: "87805311",
    discoverySource: "google",
    discoverySourceOther: "",
    notes: "",
  }).every((f) => f.valid),
);

assert.equal(
  previewContactFieldChecks({
    email: "a@b.co",
    phone: "87805311",
    discoverySource: OTHER_DISCOVERY_SOURCE_ID,
    discoverySourceOther: "",
    notes: "",
  }).find((f) => f.key === "discoverySourceOther")?.valid,
  false,
);

assert.ok(
  previewContactFieldChecks({
    email: "a@b.co",
    phone: "87805311",
    discoverySource: OTHER_DISCOVERY_SOURCE_ID,
    discoverySourceOther: "Reddit",
    notes: "edge softer please",
  }).every((f) => f.valid),
);

const nav = read("components/settings/settings-sidebar-nav.tsx");
assert.match(nav, /\/settings\/forms/);
assert.match(nav, /label: "Forms"/);
assert.equal(permissionForHref("/settings/forms"), "forms");

const formsPage = read("app/[lang]/settings/forms/forms-client.tsx");
assert.match(formsPage, /data-settings-forms/);
assert.match(formsPage, /\/api\/settings\/forms\/discovery-source/);
assert.match(formsPage, /en-US/);
assert.match(formsPage, /zh-CN/);
assert.match(formsPage, /OTHER_DISCOVERY_SOURCE_ID/);
assert.match(formsPage, /Archive/);

assert.equal(roleHasPermission("viewer", "forms"), false);

const preview = read("components/configurator/preview-contact-fields.tsx");
assert.match(preview, /data-preview-contact/);
assert.match(preview, /How did you hear about us/);
assert.match(preview, /Additional Notes/);
assert.match(preview, /discoverySourceOptions/);

const mp = read("app/[lang]/mp-config/mp-config-client.tsx");
assert.match(mp, /PreviewContactFields/);
assert.match(mp, /persistContact:\s*true/);
assert.match(mp, /phone:\s*holdPhone/);
assert.match(mp, /discoverySource/);

const bolster = read("app/[lang]/mbolster-config/mbolster-config-client.tsx");
assert.match(bolster, /PreviewContactFields/);
assert.match(bolster, /phone:\s*holdPhone\.trim\(\)/);
assert.match(bolster, /discoverySource/);

const hold = read("app/api/results/hold/route.ts");
assert.match(hold, /customer_phone/);
assert.match(hold, /discovery_source/);
assert.match(hold, /normalizePhone/);
assert.match(hold, /validateDiscoverySource/);

const upsert = read("app/api/mp-config/responses/route.ts");
assert.match(upsert, /persistContact/);
assert.match(upsert, /customer_phone/);
assert.match(upsert, /discovery_source/);

const detailApi = read("lib/results/admin/response-detail.ts");
assert.match(detailApi, /customer_phone/);
assert.match(detailApi, /discovery_source/);
assert.match(detailApi, /resolveDiscoverySourceLabel/);
assert.match(detailApi, /discovery_source_label/);

const detailPage = read("app/[lang]/settings/results/[id]/result-detail-client.tsx");
assert.match(detailPage, /customer_phone/);
assert.match(detailPage, /Discovery source/);
assert.match(detailPage, /discovery_source_label/);
assert.match(detailPage, /discovery_source_other/);

console.log("forms-preview-contact.check.ts: ok");
