/**
 * Slice 18 — run automated staging E2E proofs and print pass/fail matrix.
 * Usage: npx tsx --env-file=.env.local scripts/smoke-staging-e2e-signoff.ts
 *
 * Optional: MEDIA_SMOKE_BASE_URL=https://… for auth checks against a host.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Checklist id → smoke script (relative to repo root). */
const CHECKS: Array<{ id: string; label: string; script: string }> = [
  { id: "upload", label: "Direct image upload → optimized Asset", script: "scripts/smoke-direct-upload.ts" },
  { id: "auth", label: "Admin-only API auth (no public Asset list)", script: "scripts/smoke-media-auth.ts" },
  { id: "drive_paste", label: "Paste Drive link → import image", script: "scripts/smoke-drive-import.ts" },
  { id: "drive_browse", label: "Select from Drive → browse → import", script: "scripts/smoke-drive-browse-import.ts" },
  { id: "video_pdf", label: "Video/PDF link import + preview", script: "scripts/smoke-drive-video-pdf.ts" },
  { id: "detail", label: "Rename, alt, re-import, delete guard", script: "scripts/smoke-drive-asset-detail.ts" },
  { id: "usage", label: "Used/unused + attachment list", script: "scripts/smoke-usage-resolver.ts" },
  { id: "picker_products", label: "Asset picker on products", script: "scripts/smoke-asset-picker-products.ts" },
  { id: "picker_rollout", label: "Picker roll-out (blog/landing consumers)", script: "scripts/smoke-asset-picker-rollout.ts" },
  { id: "folders", label: "Folder assign + filter", script: "scripts/smoke-media-folders.ts" },
  { id: "tags_kind", label: "Tag + kind filter", script: "scripts/smoke-media-tags-kind.ts" },
  { id: "replace", label: "Replace-everywhere", script: "scripts/smoke-replace-everywhere.ts" },
  { id: "migrate_public", label: "Migrated /public paths", script: "scripts/smoke-migrate-public-images.ts" },
  { id: "slide_media", label: "Slide config Asset adoption", script: "scripts/smoke-migrate-slide-images.ts" },
];

function run(script: string): { ok: boolean; detail: string } {
  const r = spawnSync(
    "npx",
    ["tsx", "--env-file=.env.local", script],
    { cwd: ROOT, encoding: "utf8", env: process.env, maxBuffer: 4 * 1024 * 1024 },
  );
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  const ok = r.status === 0 && /\bSMOKE_OK\b/.test(out);
  const last = out.split("\n").filter(Boolean).slice(-3).join(" | ");
  return { ok, detail: last || `exit ${r.status}` };
}

async function main() {
  const rows: Array<{ id: string; label: string; status: "PASS" | "FAIL"; detail: string }> = [];

  for (const c of CHECKS) {
    process.stdout.write(`… ${c.id} `);
    const { ok, detail } = run(c.script);
    console.log(ok ? "PASS" : "FAIL");
    rows.push({ id: c.id, label: c.label, status: ok ? "PASS" : "FAIL", detail });
  }

  console.log("\n=== Slice 18 signoff matrix ===");
  for (const r of rows) {
    console.log(`${r.status}\t${r.id}\t${r.label}\t${r.detail.slice(0, 160)}`);
  }

  const failed = rows.filter((r) => r.status === "FAIL");
  if (failed.length) {
    console.error(`\nSMOKE_FAIL ${failed.length}/${rows.length}`);
    process.exit(1);
  }
  console.log(`\nSMOKE_OK ${rows.length}/${rows.length}`);
}

main().catch((err) => {
  console.error("SMOKE_FAIL", err instanceof Error ? err.message : err);
  process.exit(1);
});
