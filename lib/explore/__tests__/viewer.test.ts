import { describe, expect, it } from "vitest";
import { giftsFromEntries } from "@/lib/explore/viewer";

describe("giftsFromEntries", () => {
  it("adds up each kind, in the order the page names them, and leaves out the rest", () => {
    expect(
      giftsFromEntries([
        { kind: "explore_flower", points: 3 },
        { kind: "past_purchases", points: 458 },
        { kind: "claim_bonus", points: 1000 },
        { kind: "explore_flower", points: 5 },
        { kind: "earn", points: 120 },
      ]),
    ).toEqual([
      { kind: "claim_bonus", points: 1000 },
      { kind: "past_purchases", points: 458 },
      { kind: "explore_flower", points: 8 },
    ]);
  });

  it("is empty for a customer who was given nothing", () => {
    expect(giftsFromEntries([])).toEqual([]);
    expect(giftsFromEntries([{ kind: "spend", points: -500 }])).toEqual([]);
  });
});
