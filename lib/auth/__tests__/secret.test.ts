import { describe, expect, it } from "vitest";
import { secretMatches } from "@/lib/auth/secret";

describe("secretMatches", () => {
  it("refuses when the expected secret is unset or empty", () => {
    expect(secretMatches(undefined, "anything")).toBe(false);
    expect(secretMatches("", "")).toBe(false);
    expect(secretMatches("", "anything")).toBe(false);
  });

  it("refuses a missing presented value", () => {
    expect(secretMatches("s3cret", null)).toBe(false);
  });

  it("refuses a different-length value without throwing", () => {
    expect(secretMatches("s3cret", "s3cret-longer")).toBe(false);
    expect(secretMatches("s3cret", "s3")).toBe(false);
  });

  it("refuses a wrong value of the same length", () => {
    expect(secretMatches("s3cret", "s3creT")).toBe(false);
  });

  it("accepts an exact match", () => {
    expect(secretMatches("s3cret", "s3cret")).toBe(true);
  });
});
