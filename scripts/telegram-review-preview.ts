/**
 * Sends sample review cards to the measurements Telegram group — the same
 * preview as "Send preview" under Settings → Staff Management → Telegram access.
 * Nothing is stored or posted to Google.
 *
 *   npx tsx --env-file=.env.local scripts/telegram-review-preview.ts              # send to the group
 *   npx tsx --env-file=.env.local scripts/telegram-review-preview.ts --dry-run    # print, send nothing
 *   ... --no-claude    sample reply text instead of real Claude drafts
 *
 * Needs TELEGRAM_BOT_TOKEN; uses ANTHROPIC_API_KEY for the drafts when set.
 */
import { PREVIEW_INTRO, buildReviewCardPreview, sendReviewCardPreview } from "../lib/reviews/preview";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const draft = process.argv.includes("--no-claude") ? null : undefined;

  if (dryRun) {
    const { cards, usedClaude, draftErrors } = await buildReviewCardPreview({ draft });
    console.log(`${PREVIEW_INTRO}\n`);
    for (const { card } of cards) {
      const buttons = (card.replyMarkup?.inline_keyboard ?? []).flat().map((b) => `[${b.text}]`);
      console.log(`${"─".repeat(60)}\n${card.text}${buttons.length ? `\n\n${buttons.join(" ")}` : ""}\n`);
    }
    console.log(`Claude drafts: ${usedClaude ? "yes" : "no"}${draftErrors.length ? ` (errors: ${draftErrors.join("; ")})` : ""}`);
    return;
  }

  const result = await sendReviewCardPreview({ draft });
  if (!result.ok) throw new Error(`Sent ${result.sent}/${result.total}, then Telegram said: ${result.error}`);
  console.log(`Sent ${result.sent} messages to the measurements group${result.usedClaude ? " (replies drafted by Claude)" : ""}.`);
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
