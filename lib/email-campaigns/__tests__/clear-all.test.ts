import { describe, expect, it } from "vitest";
import {
  campaignWordsEmpty,
  campaignWordsOf,
  clearAllBlocker,
  clearCampaignWords,
  CLEAR_ALL_BLOCKER_TEXT,
  CLEAR_ALL_UNDO_MS,
  EMPTY_CAMPAIGN_WORDS,
} from "../clear-all";
import { EMPTY_CAMPAIGN_DRAFT, FIRST_CAMPAIGN_DRAFT } from "../rules";

const TYPED = campaignWordsOf({
  name: "December cooling launch",
  subject: "Sleep cooler this December",
  preheader: "Our FibreCool covers are back",
  body: "Our covers are back.\n\n- Every size",
  button: { target: "url", label: "Shop the covers", url: "https://mpillow.com/shop" },
  content: null,
});

const BLOCKS = campaignWordsOf({
  name: "December cooling launch",
  subject: "Sleep cooler this December",
  preheader: "",
  body: "",
  button: null,
  content: {
    v: 1,
    blocks: [
      { id: "h", type: "heading", level: 1, text: "Sleep cooler" },
      { id: "b", type: "buttons", buttons: [{ label: "Shop", target: "shop", style: "primary" }] },
    ],
    fallbacks: { first_name: "friend" },
  },
});

describe("campaignWordsOf", () => {
  it("reads a draft's words as the editor holds them", () => {
    expect(TYPED).toEqual({
      name: "December cooling launch",
      subject: "Sleep cooler this December",
      preheader: "Our FibreCool covers are back",
      body: "Our covers are back.\n\n- Every size",
      button: { choice: "url", label: "Shop the covers", url: "https://mpillow.com/shop" },
      content: null,
    });
    expect(campaignWordsOf(FIRST_CAMPAIGN_DRAFT).button).toEqual({ choice: "sign_in", label: "Sign in and collect your points", url: "" });
  });

  it("reads an empty draft as every field on its placeholder", () => {
    expect(campaignWordsOf(EMPTY_CAMPAIGN_DRAFT)).toEqual(EMPTY_CAMPAIGN_WORDS);
    expect(campaignWordsEmpty(campaignWordsOf(EMPTY_CAMPAIGN_DRAFT))).toBe(true);
  });
});

describe("campaignWordsEmpty", () => {
  it("is false while any field shows words, or a button is chosen", () => {
    for (const over of [{ name: "x" }, { subject: "x" }, { preheader: "x" }, { body: "x" }, { subject: " " }]) {
      expect(campaignWordsEmpty({ ...EMPTY_CAMPAIGN_WORDS, ...over }), JSON.stringify(over)).toBe(false);
    }
    expect(campaignWordsEmpty({ ...EMPTY_CAMPAIGN_WORDS, button: { choice: "sign_in", label: "", url: "" } })).toBe(false);
  });

  it("is false while any block is there, even one with its fields empty", () => {
    const one = { v: 1 as const, blocks: [{ id: "d", type: "divider" as const }], fallbacks: {} };
    expect(campaignWordsEmpty({ ...EMPTY_CAMPAIGN_WORDS, content: one })).toBe(false);
    expect(campaignWordsEmpty({ ...EMPTY_CAMPAIGN_WORDS, content: null })).toBe(true);
  });

  it("ignores a hidden label or link when there is no button", () => {
    expect(campaignWordsEmpty({ ...EMPTY_CAMPAIGN_WORDS, button: { choice: "none", label: "Shop", url: "https://x.test" } })).toBe(true);
  });
});

describe("clearCampaignWords", () => {
  it("returns every field to its placeholder and the button to No button", () => {
    const { words } = clearCampaignWords(TYPED);
    expect(words).toEqual({ name: "", subject: "", preheader: "", body: "", button: { choice: "none", label: "", url: "" }, content: null });
    expect(campaignWordsEmpty(words)).toBe(true);
  });

  it("empties a block campaign of its blocks, and it stays a block campaign", () => {
    const { words, snapshot } = clearCampaignWords(BLOCKS);
    expect(words).toEqual(EMPTY_CAMPAIGN_WORDS);
    expect(words.content).toEqual({ v: 1, blocks: [], fallbacks: {} });
    expect(campaignWordsEmpty(words)).toBe(true);
    expect(snapshot).toEqual(BLOCKS);
    (BLOCKS.content!.blocks[0] as { text: string }).text = "changed";
    expect((snapshot.content!.blocks[0] as { text: string }).text).toBe("Sleep cooler");
  });

  it("keeps a snapshot Undo puts back exactly, which later edits cannot reach", () => {
    const words = { ...TYPED, button: { ...TYPED.button } };
    const { snapshot } = clearCampaignWords(words);
    expect(snapshot).toEqual(TYPED);
    words.button.label = "changed";
    expect(snapshot.button.label).toBe("Shop the covers");
  });

  it("holds only words: the audience, Segment and greeting are settings it never touches", () => {
    const { words, snapshot } = clearCampaignWords(TYPED);
    for (const setting of ["audience", "segmentId", "greeting"]) {
      expect(words).not.toHaveProperty(setting);
      expect(snapshot).not.toHaveProperty(setting);
    }
  });

  it("offers Undo for 10 seconds", () => {
    expect(CLEAR_ALL_UNDO_MS).toBe(10_000);
  });
});

describe("clearAllBlocker", () => {
  it("is off once sending has started, while a wave sends, and with nothing to clear, saying why", () => {
    expect(clearAllBlocker({ locked: true, sending: false, words: TYPED })).toBe("locked");
    expect(clearAllBlocker({ locked: false, sending: true, words: TYPED })).toBe("sending");
    expect(clearAllBlocker({ locked: false, sending: false, words: EMPTY_CAMPAIGN_WORDS })).toBe("empty");
    expect(clearAllBlocker({ locked: true, sending: true, words: EMPTY_CAMPAIGN_WORDS })).toBe("locked");
    expect(CLEAR_ALL_BLOCKER_TEXT.locked).toBe("Sending has started, so the email is fixed. Duplicate it to write a new one.");
  });

  it("is on for a draft with words", () => {
    expect(clearAllBlocker({ locked: false, sending: false, words: TYPED })).toBeNull();
  });
});
