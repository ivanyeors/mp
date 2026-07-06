/**
 * Seed FAQ categories + items from lib/faq/defaults.ts (mpillow.com legacy content).
 *
 * Usage:
 *   npm run db:seed-faq
 *   npm run db:seed-faq -- --force   # wipe and reseed
 */
import { seedFaqDatabase } from "../lib/faq/seed";

const force = process.argv.includes("--force");

const result = await seedFaqDatabase({ force });

if (result.ok) {
  console.log(result.message);
  if (result.seeded) {
    console.log(`  categories: ${result.categories}`);
    console.log(`  items: ${result.items}`);
  }
  process.exit(0);
} else {
  console.error("FAQ seed failed:", result.message);
  process.exit(1);
}
