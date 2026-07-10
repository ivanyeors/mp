/**
 * Migrate known `/public` marketing images into Media Assets (slice 16).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/migrate-public-images.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/migrate-public-images.ts --apply
 *   npx tsx --env-file=.env.local scripts/migrate-public-images.ts --apply --landing-only
 */
import {
  applyPublicMigration,
  formatPlanReport,
} from "../lib/media/migrate-public-apply";

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run") || !args.has("--apply");
  const landingOnly = args.has("--landing-only");

  if (!args.has("--dry-run") && !args.has("--apply")) {
    console.log("No --apply flag: defaulting to --dry-run\n");
  }

  const result = await applyPublicMigration({ dryRun, landingOnly });
  console.log(formatPlanReport(result.plan));
  if (dryRun) {
    console.log("\nDRY_RUN_OK");
    return;
  }

  console.log("\napply:", {
    ingested: result.ingested,
    reused: result.reused,
    landingWritten: result.landingWritten,
    blogsWritten: result.blogsWritten,
  });
  console.log("MIGRATE_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
