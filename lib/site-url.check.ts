/**
 * Run: npx tsx lib/site-url.check.ts
 */
import assert from "node:assert/strict";
import {
  authCallbackUrl,
  getClientSiteOrigin,
  getRequestOrigin,
  getSiteOrigin,
} from "./site-url";

process.env.NEXT_PUBLIC_SITE_URL = "https://mpillow.com/";
delete process.env.VERCEL_URL;
assert.equal(getSiteOrigin(), "https://mpillow.com");
assert.equal(
  authCallbackUrl("/en-US/settings"),
  "https://mpillow.com/auth/callback?next=%2Fen-US%2Fsettings",
);

process.env.NEXT_PUBLIC_SITE_URL = "https://work.mpillow.com";
const localCallback = new Request(
  "http://localhost:3000/auth/callback?code=x&next=%2Fen-US%2Fsettings",
);
assert.equal(getRequestOrigin(localCallback), "http://localhost:3000");

// ponytail: minimal window shim — getClientSiteOrigin reads hostname/origin only
Object.defineProperty(globalThis, "window", {
  value: { location: { hostname: "localhost", origin: "http://localhost:3000" } },
  configurable: true,
});
assert.equal(getClientSiteOrigin(), "http://localhost:3000");

Object.defineProperty(globalThis, "window", {
  value: { location: { hostname: "localhost", origin: "http://localhost:3001" } },
  configurable: true,
});
process.env.NODE_ENV = "development";
assert.equal(getClientSiteOrigin(), "http://localhost:3001");

console.log("site-url.check.ts ok");
console.log(
  "Supabase Auth > URL Configuration > Redirect URLs should include:",
  "http://localhost:3000/**",
  "http://localhost:3001/**",
  "http://127.0.0.1:3000/**",
);
