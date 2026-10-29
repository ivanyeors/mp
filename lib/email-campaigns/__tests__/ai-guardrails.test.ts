import { describe, expect, it } from "vitest";
import {
  blockProblems,
  chineseWordsProblems,
  previewLineProblems,
  rewriteProblems,
  subjectProblems,
  wordsProblems,
  type GuardrailContext,
} from "@/lib/email-campaigns/ai-guardrails";
import { BANNED_CLINICAL_ZH, checkBannedClinicalZh } from "@/lib/i18n/copy-bands";
import type { RewritableBlock } from "@/lib/email-campaigns/ai-refine-brief";
import type { Run } from "@/lib/email-campaigns/content";

/**
 * What Claude may write in a campaign, checked in code (PRD-campaign-email-
 * editor *AI guardrails*, slice 09): only the facts and what Staff typed.
 */

const ctx: GuardrailContext = { staffText: "Sleep cooler this December\nThe FibreCool cover is back in all sizes", pointsLive: false };
const typed = (staffText: string): GuardrailContext => ({ ...ctx, staffText: `${ctx.staffText}\n${staffText}` });

describe("wordsProblems", () => {
  it("passes words about comfort, fit and sleep, and the facts", () => {
    expect(wordsProblems("The FibreCool cover keeps your pillow cool on warm nights, this December.", ctx)).toEqual([]);
    expect(wordsProblems("Every pillow is fitted to you, and the stuffing has a 10-year warranty.", ctx)).toEqual([]);
    expect(wordsProblems("Book a fitting and we'll tune it to how you sleep.", ctx)).toEqual([]);
  });

  it.each([
    ["a price", "Now only S$59."],
    ["a percentage", "Save 20% on every cover."],
    ["a discount", "Our biggest sale of the year."],
    ["a code", "Use COOL20 at checkout."],
    ["a number nobody gave", "Choose from 5 sizes."],
    ["a date", "Back on Friday."],
    ["a guarantee", "Better sleep, guaranteed."],
    ["false urgency", "Hurry, they won't last."],
    ["a deadline", "Last chance to get yours."],
  ])("refuses %s nobody typed", (_, text) => {
    expect(wordsProblems(text, ctx)).not.toEqual([]);
  });

  it("takes a price, a percentage or an offer Staff typed word for word", () => {
    const brief = typed("20% off every cover until Sunday, with code COOL20. Covers from S$59.");
    expect(wordsProblems("Take 20% off every cover until Sunday with code COOL20.", brief)).toEqual([]);
    expect(wordsProblems("Covers from S$59.", brief)).toEqual([]);
    // Only what was typed: a different number is still Claude's own.
    expect(wordsProblems("Take 25% off.", brief)).toEqual(['has a percentage ("25%") nobody typed', 'has a number ("25") nobody gave']);
    // A number counts whole: "1" is not in "10-year".
    expect(wordsProblems("1 pillow for life.", ctx)).toEqual(['has a number ("1") nobody gave']);
  });

  it.each([
    ["a health claim", "Relieve neck pain while you sleep.", true],
    ["the landing page's banned verbs", "Treat yourself to a cooler night.", true],
    ["clinical words", "Clinically designed, doctor-recommended comfort.", true],
    ["a review request", "Loved it? Leave us a Google review.", true],
    ["a rating request", "Rate us five stars.", true],
    ["Shopify", "We left Shopify for our own shop.", true],
    ["a link", "See mpillow.com/shop for more.", true],
    ["an email address", "Write to hello@mpillow.com.", true],
    ["a Variable that is Staff's to place", "You have {points_balance} points.", true],
  ])("refuses %s, even when Staff typed it", (_, text) => {
    expect(wordsProblems(text, typed(text))).not.toEqual([]);
  });

  it("allows points only while they are live, and only when the brief mentions them", () => {
    expect(wordsProblems("Sign in to collect your points.", ctx)).toEqual(["mentions points, and points aren't live"]);
    expect(wordsProblems("Sign in to collect your points.", { ...ctx, pointsLive: true })).toEqual(["mentions points, which the brief didn't"]);
    expect(wordsProblems("Sign in to collect your points.", { ...typed("Remind them about points"), pointsLive: true })).toEqual([]);
  });

  it("mentions a move only when Staff did", () => {
    expect(wordsProblems("Our new website is here.", ctx)).not.toEqual([]);
    expect(wordsProblems("Our new website is here.", typed("Tell them about the new website"))).toEqual([]);
  });
});

describe("subjectProblems", () => {
  it("refuses Re:, Fwd: and capitals", () => {
    expect(subjectProblems("Sleep cooler this December", ctx)).toEqual([]);
    expect(subjectProblems("Re: your pillow", ctx)).toContain('starts like a reply or a forward ("Re:", "Fwd:")');
    expect(subjectProblems("Fwd: sleep cooler", ctx)).toContain('starts like a reply or a forward ("Re:", "Fwd:")');
    expect(subjectProblems("SLEEP COOLER THIS DECEMBER", ctx)).toContain("is in capitals");
    expect(subjectProblems("{first_name}, sleep cooler", ctx)).toEqual([]);
  });
});

describe("blockProblems", () => {
  it("reads every word a customer reads in the block, its button labels included", () => {
    expect(blockProblems({ id: "b", type: "buttons", buttons: [{ label: "Get 20% off", target: "shop", style: "primary" }] }, ctx)).not.toEqual([]);
    expect(blockProblems({ id: "b", type: "heading", level: 1, text: "Sleep cooler this December" }, ctx)).toEqual([]);
  });
});

describe("previewLineProblems (slice 10)", () => {
  it("passes a line that follows the subject, and refuses one that repeats it", () => {
    expect(previewLineProblems("The FibreCool cover keeps your pillow cool on warm nights.", "Sleep cooler this December", ctx)).toEqual([]);
    expect(previewLineProblems("Sleep cooler this December, with the FibreCool cover.", "Sleep cooler this December", ctx)).toEqual([
      "repeats the subject instead of following it",
    ]);
    expect(previewLineProblems("Save 20% on every cover.", "Sleep cooler this December", ctx)).not.toEqual([]);
    // Whole words: a short subject inside a longer word is no repeat.
    expect(previewLineProblems("This cover keeps your pillow cool.", "Hi", ctx)).toEqual([]);
  });
});

describe("rewriteProblems (slice 10)", () => {
  const URL = "https://mpillow.com/book";
  const original: RewritableBlock = {
    id: "t",
    type: "text",
    paragraphs: [{ kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", warm nights are back. " }, { text: "Book a fitting", href: URL }] }],
  };
  const words = (...runs: Run[]): RewritableBlock => ({ id: "t", type: "text", paragraphs: [{ kind: "p", runs }] });

  it("passes a rewrite that keeps every link and Variable of the original", () => {
    expect(rewriteProblems(original, words({ text: "Hi " }, { var: "first_name" }, { text: ". " }, { text: "Book now", href: URL }), ctx)).toEqual([]);
  });

  it("names a dropped link and a dropped or added Variable", () => {
    expect(rewriteProblems(original, words({ text: "Warm nights are back." }), ctx)).toEqual(['drops the link on "Book a fitting"', "drops the Variable {first_name}"]);
    expect(rewriteProblems(original, words({ var: "first_name" }, { var: "last_name" }, { text: "Book", href: URL }), ctx)).toEqual([
      "adds the Variable {last_name}, which the original doesn't have",
    ]);
    expect(rewriteProblems(original, words({ var: "first_name" }, { text: "Book", href: "https://evil.example" }), ctx)).toContain("adds a link, which is Staff's to add");
  });

  it("holds the rewritten words to the guardrails, and a heading's Variables count as kept", () => {
    expect(rewriteProblems(original, words({ var: "first_name" }, { text: " relieves neck pain. " }, { text: "Book", href: URL }), ctx)).not.toEqual([]);
    const title: RewritableBlock = { id: "h", type: "heading", level: 1, text: "{first_name}, sleep cooler" };
    expect(rewriteProblems(title, { ...title, text: "Sleep cooler, {first_name}" }, ctx)).toEqual([]);
    expect(rewriteProblems(title, { ...title, text: "Sleep cooler" }, ctx)).toEqual(["drops the Variable {first_name}"]);
  });
});

describe("chineseWordsProblems (slice 17): a translation says what its English says, in Chinese", () => {
  const english = "Sleep cooler this December\nThe FibreCool cover is back in all sizes, from SGD 39, with 20% off this week with code COOL20.";

  it("passes a faithful translation, its numbers, price, offer and code the English's own", () => {
    expect(chineseWordsProblems("这个十二月睡得更清凉。FibreCool 枕套各种尺寸都回来了，SGD 39 起，本周八折优惠，优惠码 COOL20。", english)).toEqual([]);
    expect(chineseWordsProblems("{first_name}，填充物享有 10 年保修。", "Sleep cooler")).toEqual([]);
  });

  it("refuses the Chinese health words, whatever the English says", () => {
    for (const w of ["治疗", "治愈", "疗效", "缓解", "康复", "处方", "临床", "医生推荐"]) {
      expect(BANNED_CLINICAL_ZH.test(w)).toBe(true);
      expect(chineseWordsProblems(`枕头可以${w}`, "relieve")).toEqual([`makes a health claim ("${w}"): write about comfort, fit and sleep`]);
    }
    expect(chineseWordsProblems("减少颈部疼痛", english)).toEqual(['makes a health claim ("疼痛"): write about comfort, fit and sleep']);
    expect(checkBannedClinicalZh("The heading", "临床证明")).toBe('The heading contains "临床", which we cannot claim.');
  });

  it("refuses a price, a number or an offer the English doesn't have", () => {
    expect(chineseWordsProblems("现在只要 SGD 29", "Sleep cooler")).toEqual(['names a price ("SGD 29") nobody typed: prices come from a products block', 'has a number ("29") nobody gave']);
    expect(chineseWordsProblems("全场八折", "Sleep cooler")).toEqual(['offers "八折", which the English doesn\'t']);
    expect(chineseWordsProblems("包邮", "Free shipping on every cover")).toEqual([]);
    expect(chineseWordsProblems("限时抢购", "Sleep cooler")).toEqual(['rushes the reader ("限时"), which the English doesn\'t']);
  });

  it("refuses a review request, Shopify, a move, and points the English doesn't mention", () => {
    expect(chineseWordsProblems("请给我们五星好评", english)).toEqual(["asks for a review or a rating, which a campaign never does"]);
    expect(chineseWordsProblems("我们从 Shopify 搬到了新网站", "We moved")).toEqual(["names Shopify"]);
    expect(chineseWordsProblems("欢迎来到我们的新网站", "Sleep cooler")).toEqual(['mentions a move ("新网站"), which the English doesn\'t']);
    expect(chineseWordsProblems("登录领取积分", "Sign in")).toEqual(["mentions points, which the English doesn't"]);
    expect(chineseWordsProblems("登录领取积分", "Sign in for points")).toEqual([]);
  });

  it("reads a Variable as a space, and refuses a {name} that isn't one", () => {
    expect(chineseWordsProblems("{points_balance} 积分", "Your {points_balance} points")).toEqual([]);
    expect(chineseWordsProblems("{nickname}，您好", "Hello")).toEqual(["uses {nickname}: only {first_name} is Claude's to place"]);
  });
});
