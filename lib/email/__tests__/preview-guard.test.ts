import { afterEach, describe, expect, it } from "vitest";
import { isEmailPreviewAllowed } from "../preview-guard";

const ORIGINAL = {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
  ALLOW_EMAIL_PREVIEW: process.env.ALLOW_EMAIL_PREVIEW,
};

function setEnv(env: {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  ALLOW_EMAIL_PREVIEW?: string;
}) {
  Object.assign(process.env, {
    NODE_ENV: env.NODE_ENV,
    VERCEL_ENV: env.VERCEL_ENV,
    ALLOW_EMAIL_PREVIEW: env.ALLOW_EMAIL_PREVIEW,
  });
}

afterEach(() => {
  Object.assign(process.env, ORIGINAL);
});

describe("isEmailPreviewAllowed", () => {
  it("allows local development", () => {
    setEnv({ NODE_ENV: "development" });
    expect(isEmailPreviewAllowed()).toBe(true);
  });

  it("allows the test environment", () => {
    setEnv({ NODE_ENV: "test" });
    expect(isEmailPreviewAllowed()).toBe(true);
  });

  it("blocks production", () => {
    setEnv({ NODE_ENV: "production" });
    expect(isEmailPreviewAllowed()).toBe(false);
  });

  it("blocks a production Vercel deployment even with the opt-in flag", () => {
    setEnv({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      ALLOW_EMAIL_PREVIEW: "1",
    });
    expect(isEmailPreviewAllowed()).toBe(false);
  });

  it("blocks a Vercel preview deployment without the opt-in flag", () => {
    setEnv({ NODE_ENV: "production", VERCEL_ENV: "preview" });
    expect(isEmailPreviewAllowed()).toBe(false);
  });

  it("allows a Vercel preview deployment with the opt-in flag", () => {
    setEnv({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      ALLOW_EMAIL_PREVIEW: "1",
    });
    expect(isEmailPreviewAllowed()).toBe(true);
  });
});
