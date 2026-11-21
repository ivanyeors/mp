import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getClientPublicOrigin,
  getClientSiteOrigin,
  getPublicOrigin,
  getRequestOrigin,
  getSiteOrigin,
} from "../site-url";

const FALLBACK = "https://custom.mpillow.com";
const CONFIGURED = "https://configured.mpillow.com";
const FORWARDED_HOST = "forwarded.mpillow.com";
const HOSTILE_HOST = "attacker.example.com";
const DEPLOYMENT_HOST = "mp-15j5vdlfc-ivanyeors-projects.vercel.app";
const DEPLOYMENT_ORIGIN = `https://${DEPLOYMENT_HOST}`;

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
    expect(getPublicOrigin(request(`https://${HOSTILE_HOST}/api/results/hold`))).toBe(
      FALLBACK,
    );
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
