/**
 * Seed Page FAQ sets + items from lib/page-faq/defaults.ts.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-page-faq.ts
 *   npx tsx --env-file=.env.local scripts/seed-page-faq.ts --force
 */
import { seedPageFaqDatabase } from "../lib/page-faq/seed";

async function main() {
  const force = process.argv.includes("--force");
  const result = await seedPageFaqDatabase({ force });

  if (result.ok) {
    console.log(result.message);
    console.log(`  sets: ${result.sets}`);
    console.log(`  items: ${result.items}`);
    if (result.skipped.length) {
      console.log(`  skipped: ${result.skipped.join("; ")}`);
    }
    return;
  }
  console.error("Page FAQ seed failed:", result.message);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
