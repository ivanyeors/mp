/**
 * Run: npx tsx lib/site-url.check.ts
 *
 * Note: `.check.ts` files are not part of `vitest --include`, so this script is
 * a developer aid, not a CI gate. The deployment-host rules it exercises are
 * enforced for real in `lib/__tests__/site-url.test.ts`.
 */
import assert from "node:assert/strict";
import {
  authCallbackUrl,
  getClientSiteOrigin,
  getPublicOrigin,
  getRequestOrigin,
  getSiteOrigin,
} from "./site-url";

process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com/";
delete process.env.VERCEL_URL;
assert.equal(getSiteOrigin(), "https://custom.mpillow.com");
assert.equal(
  authCallbackUrl("/en-US/settings"),
  "https://custom.mpillow.com/auth/callback?next=%2Fen-US%2Fsettings",
);

process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";
const localCallback = new Request(
  "http://localhost:3000/auth/callback?code=x&next=%2Fen-US%2Fsettings",
);
assert.equal(getRequestOrigin(localCallback), "http://localhost:3000");

// getPublicOrigin: a customer-facing link must never carry a *.vercel.app
// deployment host — Deployment Protection turns one into a vercel.com/login wall.
// Mirrored, with the getSiteOrigin cases, in lib/__tests__/site-url.test.ts.
const CRON_URL = "https://mp-15j5vdlfc-ivanyeors-projects.vercel.app/api/cron/results-sla";
// NODE_ENV is typed readonly; the check needs the production branch.
const env = process.env as Record<string, string | undefined>;
const savedNodeEnv = env.NODE_ENV;
env.NODE_ENV = "production";

process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";
delete process.env.VERCEL_ENV;
assert.equal(getPublicOrigin(new Request(CRON_URL)), "https://custom.mpillow.com");

// Unconfigured production still refuses the deployment host.
delete process.env.NEXT_PUBLIC_SITE_URL;
assert.equal(getPublicOrigin(new Request(CRON_URL)), "https://custom.mpillow.com");

// A real custom domain on x-forwarded-host wins over the fallback.
assert.equal(
  getPublicOrigin(
    new Request(CRON_URL, { headers: { "x-forwarded-host": "custom.mpillow.com" } }),
  ),
  "https://custom.mpillow.com",
);

// A forwarded deployment host is ignored, not trusted.
assert.equal(
  getPublicOrigin(
    new Request(CRON_URL, {
      headers: { "x-forwarded-host": "mp-15j5vdlfc-ivanyeors-projects.vercel.app" },
    }),
  ),
  "https://custom.mpillow.com",
);

// Previews stay self-referential: a preview must not mint production links.
process.env.VERCEL_ENV = "preview";
assert.equal(
  getPublicOrigin(new Request(CRON_URL)),
  "https://mp-15j5vdlfc-ivanyeors-projects.vercel.app",
);
delete process.env.VERCEL_ENV;

// Plain assignment would write the literal string "undefined" when NODE_ENV
// was unset, which is how this script is normally run.
if (savedNodeEnv === undefined) delete env.NODE_ENV;
else env.NODE_ENV = savedNodeEnv;
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

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
assert.equal(getClientSiteOrigin(), "http://localhost:3001");

console.log("site-url.check.ts ok");
console.log(
  "Supabase Auth > URL Configuration > Redirect URLs should include:",
  "https://custom.mpillow.com/**",
  "http://localhost:3000/**",
  "http://localhost:3001/**",
  "http://127.0.0.1:3000/**",
);
