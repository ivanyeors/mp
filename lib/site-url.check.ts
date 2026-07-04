/**
 * Run: npx tsx lib/site-url.check.ts
 */
import assert from "node:assert/strict";
import { authCallbackUrl, getSiteOrigin } from "./site-url";

process.env.NEXT_PUBLIC_SITE_URL = "https://mpillow.com/";
delete process.env.VERCEL_URL;
assert.equal(getSiteOrigin(), "https://mpillow.com");
assert.equal(
  authCallbackUrl("/en-US/settings"),
  "https://mpillow.com/auth/callback?next=%2Fen-US%2Fsettings",
);

console.log("site-url.check.ts ok");
