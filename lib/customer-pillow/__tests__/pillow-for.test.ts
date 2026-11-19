import { describe, expect, it } from "vitest";
import { draftAnswersFrom } from "@/lib/configurator/continue-draft";
import { nameForPillowFor, pillowForOf } from "../pillow-for";

describe("who a pillow is for", () => {
  it("reads only the two answers", () => {
    expect(pillowForOf({ pillowFor: "other" })).toBe("other");
    expect(pillowForOf({ pillowFor: "self" })).toBe("self");
    expect(pillowForOf({ pillowFor: "everyone" })).toBeNull();
    expect(pillowForOf({})).toBeNull();
    expect(pillowForOf(null)).toBeNull();
  });

  it("for me fills an empty name with the account's and keeps a typed one", () => {
    expect(nameForPillowFor("self", "", "Jamie Tan")).toBe("Jamie Tan");
    expect(nameForPillowFor("self", "JT", "Jamie Tan")).toBe("JT");
  });

  it("for someone else clears the account's name and keeps a typed one", () => {
    expect(nameForPillowFor("other", "Jamie Tan", "Jamie Tan")).toBe("");
    expect(nameForPillowFor("other", "Robin", "Jamie Tan")).toBe("Robin");
    expect(nameForPillowFor("other", "Robin", "")).toBe("Robin");
  });

  it("survives a reopened Draft", () => {
    expect(draftAnswersFrom({ name: "Robin", pillowFor: "other" })).toEqual({ name: "Robin", pillowFor: "other" });
    expect(draftAnswersFrom({ name: "Robin", pillowFor: 1 })).toEqual({ name: "Robin" });
  });
});
