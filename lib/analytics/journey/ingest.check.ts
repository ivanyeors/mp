import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { persistJourneyIngest } from "./ingest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const src = readFileSync(join(root, "lib/analytics/journey/ingest.ts"), "utf8");
assert.match(src, /from\("analytics_visits"\)\.upsert/);
assert.match(src, /onConflict:\s*"id",\s*ignoreDuplicates:\s*true/);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("ingest.check.ts: ok (static; skip live — no Supabase env)");
  process.exit(0);
}

const db = createClient(url, key);
const visitorId = crypto.randomUUID();
const visitId = crypto.randomUUID();

async function cleanup() {
  await db.from("analytics_events").delete().eq("visit_id", visitId);
  await db.from("analytics_visits").delete().eq("id", visitId);
  await db.from("analytics_visitors").delete().eq("id", visitorId);
}

async function main() {
  const [a, b] = await Promise.all([
    persistJourneyIngest(db, {
      visitorId,
      visitId,
      entry: { search: "?utm_source=ingest-race", referrer: null },
      country: "SG",
      events: [{ type: "page_view", path: "/", occurredAt: "2026-07-19T04:00:00.000Z" }],
    }),
    persistJourneyIngest(db, {
      visitorId,
      visitId,
      events: [
        {
          type: "section_view",
          path: "/",
          sectionId: "hero",
          occurredAt: "2026-07-19T04:00:01.000Z",
        },
      ],
    }),
  ]);
  assert.equal(a.ok, true, a.ok === false ? a.error : "");
  assert.equal(b.ok, true, b.ok === false ? b.error : "");

  const { count, error } = await db
    .from("analytics_visits")
    .select("id", { count: "exact", head: true })
    .eq("id", visitId);
  if (error) throw new Error(error.message);
  assert.equal(count, 1);

  const { count: eventCount, error: eErr } = await db
    .from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("visit_id", visitId);
  if (eErr) throw new Error(eErr.message);
  assert.equal(eventCount, 2);
}

main()
  .then(async () => {
    await cleanup();
    console.log("ingest.check.ts: ok");
  })
  .catch(async (e) => {
    await cleanup();
    console.error(e);
    process.exit(1);
  });
