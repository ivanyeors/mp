// Load all of Search Console's available history (16 months) into seo_daily_metrics.
//
//   npm run seo:gsc-backfill                 # full 16 months
//   npm run seo:gsc-backfill -- --days 90    # just the last 90 days
//
// Safe to re-run: every row upserts on (date, source, dimension, key). Runs one
// month at a time so a failure part-way keeps what was already written; re-run to
// finish. After this, the daily cron (results-sla chain) keeps it current.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      GOOGLE_SEARCH_CONSOLE_SITE_URL, GOOGLE_SERVICE_ACCOUNT_EMAIL,
//      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

import { createClient } from "@supabase/supabase-js";

import { createGscClient, getGscConfig } from "@/lib/google/search-console";
import {
  addDays,
  createSupabaseSeoMetricsStore,
  MAX_HISTORY_DAYS,
  runGscIngest,
} from "@/lib/seo-metrics/ingest-gsc";

const CHUNK_DAYS = 30;

async function main() {
  const daysArg = process.argv.indexOf("--days");
  const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : MAX_HISTORY_DAYS;
  if (!Number.isFinite(days) || days < 1) throw new Error("--days must be a positive number");

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
  const client = createGscClient(config);
  const today = new Date().toISOString().slice(0, 10);

  for (let start = addDays(today, -Math.min(days, MAX_HISTORY_DAYS)); start <= today; ) {
    const end = addDays(start, CHUNK_DAYS - 1) < today ? addDays(start, CHUNK_DAYS - 1) : today;
    const summary = await runGscIngest(store, client, { today, startDate: start, endDate: end });
    console.log(`${start} → ${end}`, summary.rows);
    start = addDays(end, 1);
  }
  console.log("Backfill complete.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
