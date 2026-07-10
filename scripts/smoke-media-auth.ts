/**
 * Live smoke for slice 18 — admin-only media APIs (no public Asset list).
 * Usage: npx tsx --env-file=.env.local scripts/smoke-media-auth.ts
 *
 * BASE_URL defaults to NEXT_PUBLIC_SITE_URL or http://localhost:3000
 */
const BASE =
  process.env.MEDIA_SMOKE_BASE_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

const PATHS = [
  "/api/media",
  "/api/media/usage",
  "/api/media-assets",
  "/api/media-folders",
  "/api/media/drive/browse",
  "/api/media/drive/resolve?url=https://drive.google.com/file/d/x/view",
];

async function main() {
  console.log("base:", BASE);
  for (const path of PATHS) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json" },
      redirect: "manual",
    });
    const body = await res.text();
    if (res.status !== 401 && res.status !== 403) {
      throw new Error(`${path} expected 401/403, got ${res.status}: ${body.slice(0, 120)}`);
    }
    console.log("denied:", path, res.status);
  }
  console.log("SMOKE_OK");
}

main().catch((err) => {
  console.error("SMOKE_FAIL", err instanceof Error ? err.message : err);
  process.exit(1);
});
