/**
 * Slice 05 self-check: Section drafts, Publish, and the media walks that must see them.
 * Run: npx tsx --env-file=.env.local lib/page-builder/draft-publish.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  describePending,
  draftSections,
  hasPendingDraft,
  mergeDraft,
  summarisePending,
  type LandingSectionRow,
} from "@/lib/page-builder/draft";

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

// --- Draft semantics ---
assert.equal(hasPendingDraft(row()), false, "no draft columns means no pending change");
assert.equal(hasPendingDraft(row({ draft_position: 0 })), true, "draft_position 0 is pending, not absent");
assert.equal(hasPendingDraft(row({ draft_visible: false })), true, "draft_visible false is pending");
assert.equal(mergeDraft(row({ content: { a: 1 }, draft_content: { a: 2 } })).content.a, 2, "draft wins");
assert.equal(mergeDraft(row({ content: { a: 1 } })).content.a, 1, "published stands with no draft");
assert.equal(
  draftSections([row({ id: "a", slug: "a" }), row({ id: "b", slug: "b", draft_deleted: true })]).length,
  1,
  "sections pending removal drop out of the draft view",
);
assert.deepEqual(
  draftSections([row({ id: "a", slug: "a", visible: false })]).map((s) => s.slug),
  ["a"],
  "hidden sections stay in the draft view so the builder can mark them",
);
assert.equal(describePending(summarisePending([row()])), "Published", "clean state reads Published");
assert.equal(
  describePending(summarisePending([row({ draft_content: {} })])),
  "Draft · 1 change",
  "pending state reads as a draft with a count",
);

// --- Migration ---
const migrations = readdirSync(join(ROOT, "supabase/migrations"));
const file = migrations.find((f) => f.includes("landing_section_drafts"));
assert.ok(file, "the draft migration exists");
const sql = read(join("supabase/migrations", file));
for (const col of ["draft_content", "draft_position", "draft_visible", "draft_deleted"]) {
  assert.match(sql, new RegExp(`add column if not exists ${col}`), `${col} is added`);
}
assert.match(sql, /create table if not exists public\.landing_page_publishes/, "snapshot table created");
assert.match(
  sql,
  /alter table public\.landing_page_publishes enable row level security/,
  "RLS is enabled on the new table in the same migration that creates it",
);
assert.match(sql, /create or replace function public\.publish_landing_draft/, "publish is a database function");
assert.match(sql, /create or replace function public\.discard_landing_draft/, "discard is a database function");
assert.match(sql, /language plpgsql/, "publish runs server-side, so it is atomic");
assert.match(sql, /delete from public\.landing_sections where draft_deleted is true/, "publish applies removals");
assert.match(sql, /insert into public\.landing_page_publishes/, "publish writes a snapshot");
assert.match(sql, /keep_limit/, "snapshot retention is bounded");
assert.match(sql, /revoke all on function public\.publish_landing_draft/, "publish is not callable by anon");

// --- Writes go to the draft layer, not to live columns ---
const idRoute = readCode("app/api/landing-sections/[id]/route.ts");
assert.match(idRoute, /update\.draft_content = parsed\.content/, "PATCH writes draft content");
assert.match(idRoute, /update\.draft_visible = parsed\.visible/, "PATCH writes draft visibility");
assert.doesNotMatch(idRoute, /update\.content = parsed\.content/, "PATCH no longer writes live content");
assert.match(idRoute, /draft_deleted: true/, "DELETE marks for removal instead of deleting now");
assert.doesNotMatch(idRoute, /\.delete\(\)/, "nothing is hard-deleted from the builder");

const reorder = readCode("app/api/landing-sections/reorder/route.ts");
assert.match(reorder, /draft_position: index/, "reorder writes draft positions");

const publishRoute = readCode("app/api/landing-sections/publish/route.ts");
assert.match(publishRoute, /rpc\("publish_landing_draft"/, "publish calls the database function");
assert.match(publishRoute, /rpc\("discard_landing_draft"/, "discard calls the database function");
assert.match(publishRoute, /landing_section\.publish/, "publish is audited");
assert.match(publishRoute, /nothing to publish/, "publishing a clean page is refused");

// --- The public page ignores drafts entirely ---
const store = readCode("lib/landing-sections.ts");
const getPublic = store.slice(store.indexOf("export async function getLandingSections"), store.indexOf("export async function listLandingSections"));
assert.doesNotMatch(getPublic, /draft/, "the public read never looks at draft columns");

// --- Media walks reach drafts ---
const usages = read("lib/media/image-usages.ts");
assert.match(usages, /landing_sections: "id, slug, content, draft_content"/, "usage scan selects draft content");
assert.match(usages, /contains\("draft_content::text", id\)/, "usage scan matches draft references");

const replace = read("lib/media/replace.ts");
assert.match(replace, /select\("id, content, draft_content"\)/, "replace-everywhere reads drafts");
assert.match(replace, /draft_content: next\.draft_content/, "replace-everywhere writes drafts back");

// --- Builder surfaces the draft state ---
const client = read("app/[lang]/settings/page-builder/page-builder-client.tsx");
assert.match(client, /data-page-builder-draft-state/, "the header shows draft state");
assert.match(client, /Publish to the live site\?/, "publish asks for confirmation");
assert.match(client, /Discard/, "discard is available");

console.log("landing-draft-publish self-check ok");
