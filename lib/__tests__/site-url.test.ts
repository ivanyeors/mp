// Deliberately does NOT pin NEXT_PUBLIC_SITE_URL at module scope.
//
// Every other suite that touches email or SEO sets it on line 1, which is why
// no test could see the Vercel-host bug: the payment-due reminder shipped a
// `mp-<hash>-ivanyeors-projects.vercel.app` link for months while the suite was
// green. These cases exist to fail when the env var is the thing that is
// missing.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getClientSiteOrigin,
  getPublicOrigin,
  getRequestOrigin,
  getSiteOrigin,
} from "../site-url";

const CANONICAL = "https://custom.mpillow.com";
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
  it("prefers the configured public origin", () => {
    env.NODE_ENV = "production";
    env.NEXT_PUBLIC_SITE_URL = `${CANONICAL}/`;
    env.VERCEL_ENV = "production";
    env.VERCEL_URL = DEPLOYMENT_HOST;
    expect(getSiteOrigin()).toBe(CANONICAL);
  });

  it("never falls back to the deployment host in production", () => {
    env.NODE_ENV = "production";
    env.VERCEL_ENV = "production";
    env.VERCEL_URL = DEPLOYMENT_HOST;
    expect(getSiteOrigin()).toBe(CANONICAL);
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
  const cronRequest = (headers?: Record<string, string>) =>
    new Request(`${DEPLOYMENT_ORIGIN}/api/cron/results-sla`, { headers });

  it("rewrites a cron invocation to the canonical origin", () => {
    env.NODE_ENV = "production";
    env.NEXT_PUBLIC_SITE_URL = CANONICAL;
    expect(getPublicOrigin(cronRequest())).toBe(CANONICAL);
  });

  it("refuses the deployment host even with no configured origin", () => {
    env.NODE_ENV = "production";
    expect(getPublicOrigin(cronRequest())).toBe(CANONICAL);
  });

  it("ignores a forwarded deployment host but trusts a real domain", () => {
    env.NODE_ENV = "production";
    expect(
      getPublicOrigin(cronRequest({ "x-forwarded-host": DEPLOYMENT_HOST })),
    ).toBe(CANONICAL);
    expect(
      getPublicOrigin(cronRequest({ "x-forwarded-host": "custom.mpillow.com" })),
    ).toBe(CANONICAL);
  });

  it("keeps a preview self-referential so it cannot mint production links", () => {
    env.NODE_ENV = "production";
    env.VERCEL_ENV = "preview";
    env.NEXT_PUBLIC_SITE_URL = CANONICAL;
    expect(getPublicOrigin(cronRequest())).toBe(DEPLOYMENT_ORIGIN);
  });

  it("uses the live origin in local development", () => {
    expect(
      getPublicOrigin(new Request("http://localhost:3000/api/cron/results-sla")),
    ).toBe("http://localhost:3000");
  });
});

describe("getClientSiteOrigin", () => {
  it("does not hand out a deployment host as a shareable origin", () => {
    env.NODE_ENV = "production";
    setWindow(DEPLOYMENT_ORIGIN);
    expect(getClientSiteOrigin()).toBe(CANONICAL);
  });

  it("uses the live origin on a real domain", () => {
    env.NODE_ENV = "production";
    setWindow("https://custom.mpillow.com");
    expect(getClientSiteOrigin()).toBe(CANONICAL);
  });
});

describe("getRequestOrigin", () => {
  // Intentionally NOT hardened against the deployment host: this one answers
  // "where did this browser come from" for an auth round-trip, and bouncing a
  // half-finished PKCE exchange onto another domain would strand the verifier
  // cookie. NEXT_PUBLIC_SITE_URL is what keeps it canonical in production.
  it("prefers the configured origin in production", () => {
    env.NODE_ENV = "production";
    env.NEXT_PUBLIC_SITE_URL = CANONICAL;
    expect(
      getRequestOrigin(new Request(`${DEPLOYMENT_ORIGIN}/auth/callback?code=x`)),
    ).toBe(CANONICAL);
  });
});
