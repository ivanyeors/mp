/**
 * Publish unpublished sellable accessories into the shop (grouped by item name).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-shop-accessories.ts
 */
import { publishAllUnpublishedAccessories } from "../lib/ecommerce/from-inventory";
import { stripeWarningText } from "../lib/shop/stripe-warnings";

async function main() {
  const result = await publishAllUnpublishedAccessories();

  console.log(`published: ${result.published.length}`);
  for (const row of result.published) {
    console.log(`  ${row.slug} (${row.name}) — ${row.variantCount} variant(s) id=${row.productId}`);
    for (const w of row.stripeWarnings) console.error(`    ${stripeWarningText(w)}`);
  }
  if (result.published.some((row) => row.stripeWarnings.length > 0)) process.exitCode = 1;
  if (result.skipped.length) {
    console.log(`skipped: ${result.skipped.length}`);
    for (const row of result.skipped) {
      console.log(`  ${row.name}: ${row.error}`);
    }
  }
  if (result.published.length === 0 && result.skipped.length === 0) {
    console.log("nothing to publish (no unpublished sellable accessories)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
