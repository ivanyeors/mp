// Load all of Search Console's available history (16 months) into seo_daily_metrics now.
//
//   npm run seo:gsc-backfill
//
// Optional: the daily cron (results-sla chain) loads the same history by itself, a
// few months per run (lib/seo-metrics/ingest-gsc.ts). This does it in one go, with
// no time limit. Safe to re-run: every row upserts on (date, source, dimension,
// key), and a re-run fetches only the days still missing.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      GOOGLE_SEARCH_CONSOLE_SITE_URL, GOOGLE_SERVICE_ACCOUNT_EMAIL,
//      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

import { createClient } from "@supabase/supabase-js";

import { createGscClient, getGscConfig } from "@/lib/google/search-console";
import { createSupabaseSeoMetricsStore, runGscIngest } from "@/lib/seo-metrics/ingest-gsc";

async function main() {
  const config = getGscConfig();
  if (!config) {
    throw new Error(
      "Set GOOGLE_SEARCH_CONSOLE_SITE_URL, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

  const store = createSupabaseSeoMetricsStore(createClient(url, key, { auth: { persistSession: false } }));
  const summary = await runGscIngest(store, createGscClient(config), {
    today: new Date().toISOString().slice(0, 10),
    property: config.siteUrl,
    maxBackfillWindows: Infinity,
    deadline: Infinity,
  });
  for (const w of summary.backfilled) console.log(`${w.startDate} → ${w.endDate}`);
  console.log(`${config.siteUrl}: backfill complete, ${summary.missingDays} days still missing.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
