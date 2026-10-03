/**
 * Cards every Google review that has no reply from us, however old. The regular
 * sync only cards reviews from the last 14 days and stores older ones as `backlog`.
 *
 *   npx tsx --env-file=.env.local scripts/google-reviews-backfill.ts --dry-run   # list, change nothing
 *   npx tsx --env-file=.env.local scripts/google-reviews-backfill.ts             # card them all, newest first
 *   npx tsx --env-file=.env.local scripts/google-reviews-backfill.ts --max 10    # cap this run; rerun for the rest
 *
 * Needs GOOGLE_BUSINESS_* (OPS-CHECKLIST §3–4), Supabase and TELEGRAM_BOT_TOKEN;
 * ANTHROPIC_API_KEY for drafts, otherwise cards say "No draft yet".
 * Reviews already carded, posted or skipped are left alone.
 */
import {
  businessProfileClientFromConfig,
  getBusinessProfileConfig,
  isReviewName,
  starRatingToNumber,
  type GbpReview,
} from "../lib/google/business-profile";
import { GOOGLE_REVIEW_COLUMNS, type GoogleReviewRow } from "../lib/reviews/google-reviews";
import { deliverGoogleReviewCard, reviewFields } from "../lib/reviews/google-sync";
import { supabaseAdmin } from "../lib/supabase/server";

const PACE_MS = 3_000; // Telegram allows ~20 group messages a minute.

async function listAllReviews(): Promise<GbpReview[]> {
  const config = getBusinessProfileConfig();
  if (!config) {
    throw new Error("GOOGLE_BUSINESS_* env is not set — see .claude/PRD-google-review-replies/OPS-CHECKLIST.md §3–4");
  }
  const client = businessProfileClientFromConfig(config);
  const reviews: GbpReview[] = [];
  let pageToken: string | undefined;
  do {
    const page = await client.listReviews(config.location, { pageSize: 50, pageToken });
    reviews.push(...page.reviews.filter((r) => isReviewName(r.name)));
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken);
  return reviews;
}

const hasReply = (r: GbpReview) => Boolean(r.reviewReply?.comment?.trim());

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const maxIndex = process.argv.indexOf("--max");
  const maxCards = maxIndex === -1 ? Infinity : Number(process.argv[maxIndex + 1]);
  if (!(maxCards > 0)) throw new Error("--max needs a positive number");

  const reviews = await listAllReviews();
  const admin = supabaseAdmin();
  const { data: known, error: readError } = await admin
    .from("google_reviews")
    .select("review_name,status")
    .in("review_name", reviews.map((r) => r.name));
  if (readError) throw new Error(readError.message);
  const status = new Map((known ?? []).map((r) => [r.review_name as string, r.status as string]));

  const toCard = reviews.filter((r) => !hasReply(r) && (!status.has(r.name) || status.get(r.name) === "backlog"));
  const history = reviews.filter((r) => hasReply(r) && !status.has(r.name));
  console.log(`${reviews.length} reviews on Google, ${reviews.filter((r) => !hasReply(r)).length} without a reply, ${toCard.length} to card:`);
  for (const r of toCard) {
    console.log(`  ${starRatingToNumber(r.starRating) ?? "?"}★ ${r.reviewer?.displayName ?? "Anonymous"} — ${(r.comment ?? "").slice(0, 70)}`);
  }
  if (dryRun || !toCard.length) return;

  const { data: upserted, error } = await admin
    .from("google_reviews")
    .upsert(
      [
        ...toCard.map((r) => ({ ...reviewFields(r), status: "new" as const })),
        ...history.map((r) => ({ ...reviewFields(r), status: "replied_elsewhere" as const })),
      ],
      { onConflict: "review_name" },
    )
    .select(GOOGLE_REVIEW_COLUMNS);
  if (error) throw new Error(error.message);

  const queue = (upserted as GoogleReviewRow[])
    .filter((r) => r.status === "new")
    .sort((a, b) => Date.parse(b.review_updated_at ?? "") - Date.parse(a.review_updated_at ?? ""))
    .slice(0, maxCards);
  let carded = 0;
  for (const row of queue) {
    if (await deliverGoogleReviewCard(row)) carded += 1;
    await new Promise((resolve) => setTimeout(resolve, PACE_MS));
  }
  const left = toCard.length - carded;
  console.log(`Sent ${carded} card(s).${left ? ` ${left} still queued as new — the next sync or rerun sends them.` : ""}`);
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
