import { describe, expect, it } from "vitest";
import {
  firstQuestionEmailCheck,
  isPlausibleEmail,
  withFirstQuestion,
} from "@/lib/configurator/first-question-email";

describe("isPlausibleEmail", () => {
  it.each(["ada@example.com", " ada@example.com ", "a.b+tag@mail.example.sg"])("accepts %s", (v) => {
    expect(isPlausibleEmail(v)).toBe(true);
  });

  it.each(["", "ada", "ada@", "ada@example", "ada @example.com", "@example.com"])("refuses %j", (v) => {
    expect(isPlausibleEmail(v)).toBe(false);
  });
});

describe("firstQuestionEmailCheck", () => {
  it("asks for an email when the box is empty", () => {
    expect(firstQuestionEmailCheck("  ")).toMatchObject({ touched: false, valid: false, message: "Enter your email" });
  });

  it("asks for a valid one when it is not shaped like an address", () => {
    expect(firstQuestionEmailCheck("ada@")).toMatchObject({
      touched: true,
      valid: false,
      message: "Enter a valid email address",
    });
  });

  it("passes an address", () => {
    expect(firstQuestionEmailCheck("ada@example.com")).toMatchObject({ key: "email", valid: true });
  });
});

describe("withFirstQuestion", () => {
  const handoff = ["age", "health", "shoulder-length", "photos"] as const;

  it("puts the first question in front of a guest's hand-off", () => {
    expect(withFirstQuestion(handoff, true)).toEqual(["name", ...handoff]);
  });

  it("leaves a Staff device's hand-off as it was", () => {
    expect(withFirstQuestion(handoff, false)).toEqual([...handoff]);
  });

  it("does not ask twice, or invent steps for a hand-off that needs none", () => {
    expect(withFirstQuestion(["name", "age"], true)).toEqual(["name", "age"]);
    expect(withFirstQuestion([], true)).toEqual([]);
  });
});
