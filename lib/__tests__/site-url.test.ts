// Deliberately does NOT pin NEXT_PUBLIC_SITE_URL at module scope.
//
// Every other suite that touches email or SEO sets it on line 1, which is why
// no test could see the Vercel-host bug: the payment-due reminder shipped a
// `mp-<hash>-ivanyeors-projects.vercel.app` link for months while the suite was
// green. These cases exist to fail when the env var is the thing that is
// missing.
//
// Every expected origin below is distinct from PROD_FALLBACK_ORIGIN on purpose.
// An earlier draft reused the fallback string as the configured value, which
// made the configured / forwarded / request-origin branches pass whether or not
// the code consulted them at all.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getClientPublicOrigin,
  getClientSiteOrigin,
  getPublicOrigin,
  getRequestOrigin,
  getSiteOrigin,
} from "../site-url";

/** Matches PROD_FALLBACK_ORIGIN — only ever asserted as a *fallback*. */
const FALLBACK = "https://custom.mpillow.com";
/** Allowlisted, and distinct from the fallback, so "configured wins" can fail. */
const CONFIGURED = "https://configured.mpillow.com";
const FORWARDED_HOST = "forwarded.mpillow.com";
/** Off-domain: a forged Host header must never become a public link. */
const HOSTILE_HOST = "attacker.example.com";
const DEPLOYMENT_HOST = "mp-15j5vdlfc-ivanyeors-projects.vercel.app";
const DEPLOYMENT_ORIGIN = `https://${DEPLOYMENT_HOST}`;

/** NODE_ENV is typed readonly; these cases need the production branch. */
const env = process.env as Record<string, string | undefined>;

const KEYS = ["NEXT_PUBLIC_SITE_URL", "VERCEL_URL", "VERCEL_ENV", "NODE_ENV"] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, env[k]]));
  for (const k of KEYS) delete env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
  Reflect.deleteProperty(globalThis, "window");
});

function setWindow(origin: string) {
  Object.defineProperty(globalThis, "window", {
    value: { location: { hostname: new URL(origin).hostname, origin } },
    configurable: true,
  });
}

describe("getSiteOrigin", () => {
  it("prefers the configured public origin over the deployment host", () => {
    env.NODE_ENV = "production";
    env.NEXT_PUBLIC_SITE_URL = `${CONFIGURED}/`;
    env.VERCEL_ENV = "production";
    env.VERCEL_URL = DEPLOYMENT_HOST;
    expect(getSiteOrigin()).toBe(CONFIGURED);
  });

  it("never falls back to the deployment host in production", () => {
    env.NODE_ENV = "production";
    env.VERCEL_ENV = "production";
    env.VERCEL_URL = DEPLOYMENT_HOST;
    expect(getSiteOrigin()).toBe(FALLBACK);
  });

  it("still self-references on a preview deployment", () => {
    env.NODE_ENV = "production";
    env.VERCEL_ENV = "preview";
    env.VERCEL_URL = DEPLOYMENT_HOST;
    expect(getSiteOrigin()).toBe(DEPLOYMENT_ORIGIN);
  });

  it("falls back to localhost outside production", () => {
    expect(getSiteOrigin()).toBe("http://localhost:3000");
  });
});

describe("getPublicOrigin", () => {
  const request = (url: string, headers?: Record<string, string>) =>
    new Request(url, { headers });
  const cron = (headers?: Record<string, string>) =>
    request(`${DEPLOYMENT_ORIGIN}/api/cron/results-sla`, headers);

  it("rewrites a cron invocation to the configured origin", () => {
    env.NODE_ENV = "production";
    env.NEXT_PUBLIC_SITE_URL = CONFIGURED;
    expect(getPublicOrigin(cron())).toBe(CONFIGURED);
  });

  it("refuses the deployment host even with no configured origin", () => {
    env.NODE_ENV = "production";
    expect(getPublicOrigin(cron())).toBe(FALLBACK);
  });

  it("trusts a forwarded host on our own domain", () => {
    env.NODE_ENV = "production";
    expect(getPublicOrigin(cron({ "x-forwarded-host": FORWARDED_HOST }))).toBe(
      `https://${FORWARDED_HOST}`,
    );
  });

  it("ignores a forwarded deployment host", () => {
    env.NODE_ENV = "production";
    expect(getPublicOrigin(cron({ "x-forwarded-host": DEPLOYMENT_HOST }))).toBe(
      FALLBACK,
    );
  });

  it("ignores a forged off-domain Host so links cannot be poisoned", () => {
    env.NODE_ENV = "production";
    expect(getPublicOrigin(cron({ "x-forwarded-host": HOSTILE_HOST }))).toBe(
      FALLBACK,
    );
    // Same for a request that arrived addressed to the attacker's host.
    expect(getPublicOrigin(request(`https://${HOSTILE_HOST}/api/results/hold`))).toBe(
      FALLBACK,
    );
    // ...and the lookalike suffix trick.
    expect(
      getPublicOrigin(cron({ "x-forwarded-host": "evil-mpillow.com" })),
    ).toBe(FALLBACK);
  });

  it("keeps the request origin when it is already on our domain", () => {
    env.NODE_ENV = "production";
    expect(getPublicOrigin(request(`https://${FORWARDED_HOST}/api/results/hold`))).toBe(
      `https://${FORWARDED_HOST}`,
    );
  });

  it("keeps a preview self-referential so it cannot mint production links", () => {
    env.NODE_ENV = "production";
    env.VERCEL_ENV = "preview";
    env.NEXT_PUBLIC_SITE_URL = CONFIGURED;
    expect(getPublicOrigin(cron())).toBe(DEPLOYMENT_ORIGIN);
  });

  it("uses the live origin in local development", () => {
    expect(getPublicOrigin(request("http://localhost:3000/api/cron/results-sla"))).toBe(
      "http://localhost:3000",
    );
  });
});

describe("getClientPublicOrigin", () => {
  it("does not hand out a deployment host as a shareable origin", () => {
    env.NODE_ENV = "production";
    setWindow(DEPLOYMENT_ORIGIN);
    expect(getClientPublicOrigin()).toBe(FALLBACK);
  });

  it("prefers the configured origin over the live tab", () => {
    env.NODE_ENV = "production";
    env.NEXT_PUBLIC_SITE_URL = CONFIGURED;
    setWindow(DEPLOYMENT_ORIGIN);
    expect(getClientPublicOrigin()).toBe(CONFIGURED);
  });

  it("uses the live origin on a real domain", () => {
    env.NODE_ENV = "production";
    setWindow(`https://${FORWARDED_HOST}`);
    expect(getClientPublicOrigin()).toBe(`https://${FORWARDED_HOST}`);
  });
});

describe("auth-round-trip helpers keep the browser's own origin", () => {
  // Both are intentionally NOT hardened against the deployment host. They feed
  // authCallbackUrl / the Supabase redirectTo, and bouncing a half-finished PKCE
  // exchange onto another domain would strand the verifier cookie — sign-in on a
  // preview would break. NEXT_PUBLIC_SITE_URL is what keeps them canonical in
  // production.
  it("getClientSiteOrigin stays on a preview deployment", () => {
    env.NODE_ENV = "production";
    setWindow(DEPLOYMENT_ORIGIN);
    expect(getClientSiteOrigin()).toBe(DEPLOYMENT_ORIGIN);
  });

  it("getRequestOrigin prefers the configured origin in production", () => {
    env.NODE_ENV = "production";
    env.NEXT_PUBLIC_SITE_URL = CONFIGURED;
    expect(
      getRequestOrigin(new Request(`${DEPLOYMENT_ORIGIN}/auth/callback?code=x`)),
    ).toBe(CONFIGURED);
  });
});
