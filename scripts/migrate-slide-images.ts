/**
 * Migrate slide config + ambassadors gallery images into Media Assets (slice 17).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/migrate-slide-images.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/migrate-slide-images.ts --apply
 */
import {
  applySlideMigration,
  formatSlidePlanReport,
} from "../lib/media/migrate-slide-apply";

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run") || !args.has("--apply");

  if (!args.has("--dry-run") && !args.has("--apply")) {
    console.log("No --apply flag: defaulting to --dry-run\n");
  }

  const result = await applySlideMigration({ dryRun });
  console.log(formatSlidePlanReport(result.plan));
  if (dryRun) {
    console.log("\nDRY_RUN_OK");
    return;
  }

  console.log("\napply:", {
    ingested: result.ingested,
    reused: result.reused,
    written: result.written,
    mapSize: Object.keys(result.map).length,
  });
  console.log("MIGRATE_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
