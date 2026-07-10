/**
 * Seed FAQ categories + items from lib/faq/defaults.ts (mpillow.com legacy content).
 *
 * Usage:
 *   npm run db:seed-faq
 *   npm run db:seed-faq -- --force   # wipe and reseed
 */
import { seedFaqDatabase } from "../lib/faq/seed";

async function main() {
  const force = process.argv.includes("--force");
  const result = await seedFaqDatabase({ force });

  if (result.ok) {
    console.log(result.message);
    if (result.seeded) {
      console.log(`  categories: ${result.categories}`);
      console.log(`  items: ${result.items}`);
    }
    return;
  }
  console.error("FAQ seed failed:", result.message);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
