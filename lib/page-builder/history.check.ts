import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describeSnapshotDiff, diffSnapshot, type LandingSectionRow } from "@/lib/page-builder/draft";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const readCode = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function row(over: Partial<LandingSectionRow> = {}): LandingSectionRow {
  return {
    id: "id", section_type: "text_image", slug: "slug", position: 0, visible: true,
    content: {}, created_at: "", updated_at: "", ...over,
  };
}

const snap = [
  { slug: "hero", section_type: "hero", position: 0, visible: true, content: { title: "A" } },
];
assert.deepEqual(
  diffSnapshot(snap, [row({ slug: "hero", content: { title: "A" } })]),
  { changed: [], missing: [], added: [] },
);
assert.deepEqual(diffSnapshot(snap, [row({ slug: "hero", content: { title: "B" } })]).changed, ["hero"]);
assert.deepEqual(diffSnapshot(snap, []).missing, ["hero"], "a retired section is reported, not silently skipped");
assert.deepEqual(
  diffSnapshot(snap, [row({ slug: "hero", content: { title: "A" } }), row({ slug: "extra", content: {} })]).added,
  ["extra"],
  "sections added since the snapshot would be removed by a restore",
);
assert.match(describeSnapshotDiff({ changed: [], missing: [], added: [] }), /Matches the live page/);
assert.match(describeSnapshotDiff({ changed: ["a"], missing: [], added: [] }), /would change/);

assert.deepEqual(
  diffSnapshot(snap, [row({ slug: "hero", content: { title: "A" }, draft_content: { title: "Z" } })]).changed,
  [],
  "the diff compares published content, not the pending draft",
);

const file = readdirSync(join(ROOT, "supabase/migrations")).find((f) => f.includes("landing_restore_snapshot"));
assert.ok(file, "the restore migration exists");
const sql = read(join("supabase/migrations", file));
assert.match(sql, /create or replace function public\.restore_landing_snapshot/, "restore is a database function");
assert.match(sql, /draft_content  = en\.content/, "restore writes the draft layer");
const restoreBody = sql.slice(sql.indexOf("create or replace function public.restore_landing_snapshot"));
assert.doesNotMatch(
  restoreBody.replace(/--.*$/gm, ""),
  /set content\s*=/,
  "restore never writes published content directly",
);
assert.match(sql, /perform public\.discard_landing_draft\(\)/, "restoring replaces the pending draft");
assert.match(sql, /set draft_deleted = true/, "sections added after the snapshot are staged for removal");
assert.match(sql, /revoke all on function public\.restore_landing_snapshot/, "not callable by anon");

const api = readCode("app/api/landing-sections/history/route.ts");
assert.match(api, /requireAdminContext\("page-builder"\)/, "history is staff-only");
assert.match(api, /order\("published_at", \{ ascending: false \}\)/, "newest first");
assert.match(api, /rpc\("restore_landing_snapshot"/, "restore calls the database function");
assert.match(api, /landing_section\.restore_snapshot/, "a restore is audited");
assert.match(api, /LIST_LIMIT/, "the listing is bounded by the retention limit");

const ui = read("components/settings/page-builder/publish-history.tsx");
assert.match(ui, /Restore this version\?/, "restore asks for confirmation");
assert.match(ui, /discarding \$\{pending\.total\}/, "the confirm names how many pending changes are lost");
assert.match(ui, /<Dialog/, "the confirm uses the design system dialog");
assert.doesNotMatch(readCode("components/settings/page-builder/publish-history.tsx"), /\bconfirm\(/, "no native confirm()");
assert.match(ui, /no longer exist/, "a snapshot referencing retired sections warns before restoring");
assert.match(ui, /does not change the live site|until you publish/, "restore is clearly not a publish");

console.log("landing-history self-check ok");

assert.match(
  sql,
  /and \(s\.content  is distinct from en\.content/,
  "restore stages only sections that differ",
);

assert.match(sql, /and s\.section_type = en\.section_type/, "restore matches type as well as slug");

assert.match(
  sql,
  /s\.section_type in \(\s*'custom_text_image'/,
  "only builder-creatable types can be staged for removal by a restore",
);

assert.match(sql, /create or replace function public\.publish_landing_draft/, "publish is corrected here");
const publishBody = sql.slice(sql.indexOf("create or replace function public.publish_landing_draft"));
const compactAt = publishBody.indexOf("row_number() over");
const snapshotAt = publishBody.indexOf("insert into public.landing_page_publishes");
assert.ok(compactAt !== -1 && snapshotAt !== -1, "both steps are present");
assert.ok(
  snapshotAt > compactAt,
  "the snapshot is taken after positions are compacted — otherwise every later diff " +
    "reports most of the page as changed on the entry labelled Latest",
);
assert.match(publishBody, /'position', s\.position/, "the snapshot records final positions");

assert.match(sql, /grant execute on function public\.restore_landing_snapshot\(uuid\) to service_role/);
assert.match(sql, /grant execute on function public\.publish_landing_draft\(text\) to service_role/);

const shellSrc = read("app/[lang]/settings/page-builder/page-builder-client.tsx");
assert.match(shellSrc, /onRestored=\{resetAndRefresh\}/, "restore closes the inspector");
assert.match(shellSrc, /onDiscarded=\{resetAndRefresh\}/, "discard closes the inspector");

console.log("landing-history regression checks ok");
