/**
 * Converts the Sizing photos stored before they were kept as WebP (ADR 0047).
 * Photos uploaded since are converted by app/api/mp-config/photos; this does
 * the rows already in `mp_config_response_photos`, once.
 *
 *   npx tsx --env-file=.env.local scripts/sizing-photos-to-webp.ts --dry-run   # count and size them, change nothing
 *   npx tsx --env-file=.env.local scripts/sizing-photos-to-webp.ts             # convert them
 *
 * Needs Supabase (the service role). Only rows that aren't WebP yet are read,
 * ten at a time. A row is rewritten only when its WebP is smaller; its
 * screening status is left as it is. Safe to run again.
 */
import { screenableImage } from "../lib/ai/photo-screening";
import { sizingPhotoAsWebp } from "../lib/results/sizing-photo-webp";
import { supabaseAdmin } from "../lib/supabase/server";

const PAGE = 10;
const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const admin = supabaseAdmin();

  let lastId = "00000000-0000-0000-0000-000000000000";
  let converted = 0;
  let skipped = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (;;) {
    const { data, error } = await admin
      .from("mp_config_response_photos")
      .select("id,data_url")
      .not("data_url", "like", "data:image/webp%")
      .gt("id", lastId)
      .order("id")
      .limit(PAGE);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data as { id: string; data_url: string }[]) {
      lastId = row.id;
      const image = screenableImage(row.data_url);
      const stored = image ? await sizingPhotoAsWebp(image) : null;
      const before = image ? Buffer.byteLength(image.base64, "base64") : 0;
      if (!image || !stored || stored.byteSize >= before) {
        skipped++;
        console.log(`skip ${row.id}: ${!image ? "not a JPEG, PNG, WebP or GIF" : !stored ? "sharp can't read it" : "the WebP isn't smaller"}`);
        continue;
      }
      converted++;
      bytesBefore += before;
      bytesAfter += stored.byteSize;
      if (dryRun) continue;
      const { error: updateError } = await admin.from("mp_config_response_photos").update({ data_url: stored.dataUrl }).eq("id", row.id);
      if (updateError) throw new Error(`${row.id}: ${updateError.message}`);
    }
  }

  console.log(
    `${dryRun ? "Would convert" : "Converted"} ${converted} photo(s): ${mb(bytesBefore)} → ${mb(bytesAfter)}. Skipped ${skipped}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
