import { describe, expect, it } from "vitest";
import { withoutChineseVersion } from "../chinese-version";
import type { CampaignContent, EmailBlock } from "../content";
import {
  campaignFitChecks,
  fitUnreadCheck,
  latestPillows,
  productClasses,
  RECENT_PURCHASE_DAYS,
  RECIPIENT_FACT_COLUMNS,
  PILLOW_LINE_COLUMNS,
  recipientFactsFromRow,
  type FitEmail,
  type RecipientFacts,
} from "../fit-checks";
import { CHINESE_SAMPLE_CONTENT } from "@/lib/email/__fixtures__/samples";

/**
 * Fit checks (PRD-campaign-audiences slice 09): pure functions over a list of
 * recipient facts, tested case by case. Each is advice that names a filter or
 * a Segment to leave out, listed only when it has something to say.
 */

const ORIGIN = "https://custom.mpillow.com";
const NOW = new Date("2026-10-31T04:00:00Z");
const MBOLSTER = "7c0b0b0b-0000-4000-8000-000000000001";
const PREMIUM = "7c0b0b0b-0000-4000-8000-000000000002";
const CASE = "7c0b0b0b-0000-4000-8000-000000000003";

const facts = { origin: ORIGIN, productClasses: { [MBOLSTER]: ["mbolster" as const], [PREMIUM]: ["premium" as const], [CASE]: ["accessory" as const] }, now: NOW };

const text = (id: string, words: string): EmailBlock => ({ id, type: "text", paragraphs: [{ kind: "p", runs: [{ text: words }] }] });

const content = (...blocks: EmailBlock[]): CampaignContent => ({ v: 1, blocks, fallbacks: {} });

const email = (c: CampaignContent | null, over: Partial<FitEmail> = {}): FitEmail => ({
  subject: "Sleep cooler",
  preheader: "New covers",
  body: "",
  content: c,
  greeting: false,
  button: null,
  audience: "segment",
  ...over,
});

let seq = 0;
/** One planned recipient in Singapore, reading English, with every detail and nothing bought lately. */
const person = (over: Partial<RecipientFacts> = {}): RecipientFacts => ({
  customerId: `c${++seq}`,
  firstName: "Ann",
  lastName: "Tan",
  pointsBalance: 100,
  pillow: { tier: "premium", size: "M" },
  locale: "en-US",
  shipCountry: "SG",
  bought: [],
  lastPurchaseAt: null,
  ...over,
});
const people = (n: number, over: Partial<RecipientFacts> = {}) => Array.from({ length: n }, () => person(over));

const keys = (checks: ReturnType<typeof campaignFitChecks>) => checks.map((c) => c.key);
const only = (checks: ReturnType<typeof campaignFitChecks>, key: string) => {
  const c = checks.find((x) => x.key === key);
  if (!c) throw new Error(`no ${key} in ${keys(checks).join(", ")}`);
  return c;
};

describe("the fit checks", () => {
  it("say nothing when the email and its people match, and nothing for nobody", () => {
    const plain = email(content(text("t", "New covers are in the shop.")));
    expect(campaignFitChecks(plain, people(60), facts)).toEqual([]);
    expect(campaignFitChecks(plain, [], facts)).toEqual([]);
  });

  it("are advice: none holds the wave", () => {
    const all = campaignFitChecks(
      email(content(text("t", "Visit the studio."), { id: "p", type: "products", products: [MBOLSTER], layout: "rows", buttonLabel: "Shop" }), { greeting: true }),
      [...people(2, { locale: "zh-CN", firstName: null, shipCountry: null, bought: ["mbolster"], lastPurchaseAt: "2026-10-30T00:00:00Z" }), ...people(2)],
      facts,
    );
    expect(keys(all)).toEqual(["fit_chinese", "fit_fallbacks", "fit_in_store", "fit_already_own", "fit_recent"]);
    for (const c of all) expect(c).toMatchObject({ ok: false, advisory: true });
  });

  describe("readers of Chinese", () => {
    const zh = [...people(14, { locale: "zh-CN" }), ...people(46)];

    it("count them when the email has no 中文 version, and say what would fix it", () => {
      const c = only(campaignFitChecks(email(withoutChineseVersion(CHINESE_SAMPLE_CONTENT)), zh, facts), "fit_chinese");
      expect(c.detail).toBe(
        "14 of 60 read Chinese and this email has no 中文 version, so they get English: translate it, or filter its Segment to “Reads English”, or leave out a Segment of “Reads Chinese”",
      );
      expect(c.issues).toEqual([{ blockId: null, text: c.detail, what: c.detail }]);
    });

    it("say nothing when it has one, or when nobody reads Chinese", () => {
      expect(keys(campaignFitChecks(email(CHINESE_SAMPLE_CONTENT), zh, facts))).not.toContain("fit_chinese");
      expect(keys(campaignFitChecks(email(content(text("t", "Hi"))), people(60), facts))).not.toContain("fit_chinese");
    });

    it("offer a Segment to send it to instead when it goes to everyone subscribed, or the imported", () => {
      for (const audience of ["subscribed", "imported_not_signed_in"] as const) {
        expect(only(campaignFitChecks(email(content(text("t", "Hi")), { audience }), zh, facts), "fit_chinese").detail).toMatch(
          /so they get English: translate it, or send it to a Segment of “Reads English”, or leave out a Segment of “Reads Chinese”$/,
        );
      }
    });

    it("offer no translation for a campaign written before blocks, which cannot have one", () => {
      const c = only(campaignFitChecks(email(null, { body: "New covers are in." }), zh, facts), "fit_chinese");
      expect(c.detail).toMatch(/so they get English: filter its Segment to “Reads English”/);
    });
  });

  describe("fallback words", () => {
    const withVars = content({
      id: "t",
      type: "text",
      paragraphs: [{ kind: "p", runs: [{ text: "How is " }, { var: "your_pillow" }, { text: ", " }, { var: "last_name" }, { text: "?" }] }],
    });

    it("count, for each Variable the email uses in its order, who reads its fallback, with the filter that keeps only those with the detail", () => {
      const list = [...people(23, { pillow: null }), ...people(2, { lastName: null }), ...people(35)];
      const c = only(campaignFitChecks(email({ ...withVars, fallbacks: { last_name: "friend" } }), list, facts), "fit_fallbacks");
      expect(c.issues.map((i) => i.text)).toEqual([
        "Your pillow: 23 of 60 have no pillow bought here and read “your pillow” instead: filter its Segment to “Bought Premium Mpillow or Basic Mpillow”",
        "Last name: 2 of 60 have no last name and read “friend” instead: check the fallback words read well to them",
      ]);
    });

    it("count the greeting's first name, and the points balance with the Points filter", () => {
      const points = content({ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ var: "points_balance" }, { text: " points" }] }] });
      const list = [person({ firstName: " " }), person({ pointsBalance: 0 }), person()];
      const c = only(campaignFitChecks(email({ ...points, fallbacks: { points_balance: "some" } }, { greeting: true }), list, facts), "fit_fallbacks");
      expect(c.issues.map((i) => i.text)).toEqual([
        "First name: 1 of 3 have no first name and read “there” instead: check the fallback words read well to them",
        "Points balance: 1 of 3 have no points to spend and read “some” instead: filter its Segment to “Has points”, or leave out a Segment of “No points”",
      ]);
    });

    it("say nothing when everyone has every detail the email uses, or it uses none", () => {
      expect(keys(campaignFitChecks(email(withVars), people(5), facts))).not.toContain("fit_fallbacks");
      expect(keys(campaignFitChecks(email(content(text("t", "Hi"))), people(5, { firstName: null }), facts))).not.toContain("fit_fallbacks");
    });
  });

  describe("an in-store visit", () => {
    const abroad = [...people(9, { shipCountry: "MY" }), ...people(4, { shipCountry: null }), ...people(47)];

    it("counts who ships outside Singapore, and to an unknown country, when a block links to the appointments page", () => {
      const book: EmailBlock = { id: "b", type: "buttons", buttons: [{ label: "Book a fitting", target: "book_fitting", style: "primary" }] };
      const c = only(campaignFitChecks(email(content(text("t", "Sleep cooler."), book)), abroad, facts), "fit_in_store");
      expect(c.issues).toEqual([
        {
          blockId: "b",
          text: "9 of 60 ship outside Singapore, and 4 more ship to an unknown country, and Block 2, Buttons offers an in-store visit: filter its Segment to “Ships to Singapore”, or leave out Segments of “Ships outside Singapore” and “Ships to an unknown country”",
          what: expect.any(String),
        },
      ]);
    });

    it("finds a typed link to the appointments page, in any language", () => {
      const link: EmailBlock = { id: "l", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Come in", href: `${ORIGIN}/zh-CN/appointments` }] }] };
      expect(only(campaignFitChecks(email(content(link)), abroad, facts), "fit_in_store").issues[0].blockId).toBe("l");
    });

    it("finds the words studio, in-store, fitting and re-adjustment, in a block, the subject or the preview line", () => {
      for (const words of ["Visit our studio", "An in-store fitting", "Book your fitting", "Free re-adjustment", "Come for a readjustment"]) {
        expect(only(campaignFitChecks(email(content(text("t", words))), abroad, facts), "fit_in_store").issues[0].blockId).toBe("t");
      }
      expect(only(campaignFitChecks(email(content(text("t", "Hi")), { subject: "See us in store" }), abroad, facts), "fit_in_store").detail).toContain(
        "the subject offers an in-store visit",
      );
      expect(only(campaignFitChecks(email(content(text("t", "Hi")), { preheader: "Studio hours" }), abroad, facts), "fit_in_store").detail).toContain(
        "the preview line offers",
      );
    });

    it("reads a well-fitting pillow as no visit", () => {
      expect(keys(campaignFitChecks(email(content(text("t", "A well-fitting, better-fitting pillow."))), abroad, facts))).not.toContain("fit_in_store");
    });

    it("names only who is outside, or only who is unknown", () => {
      const outside = only(campaignFitChecks(email(content(text("t", "Visit the studio"))), [...people(3, { shipCountry: "AU" }), person()], facts), "fit_in_store");
      expect(outside.detail).toMatch(/^3 of 4 ship outside Singapore, and Block 1, Text offers an in-store visit: .* leave out a Segment of “Ships outside Singapore”$/);
      const unknown = only(campaignFitChecks(email(content(text("t", "Visit the studio"))), [person({ shipCountry: null }), person()], facts), "fit_in_store");
      expect(unknown.detail).toMatch(/^1 of 2 ship to an unknown country, and .* leave out a Segment of “Ships to an unknown country”$/);
    });

    it("says nothing when everyone ships to Singapore, or the email offers no visit", () => {
      expect(keys(campaignFitChecks(email(content(text("t", "Visit the studio"))), people(5), facts))).not.toContain("fit_in_store");
      expect(keys(campaignFitChecks(email(content(text("t", "New covers"))), abroad, facts))).not.toContain("fit_in_store");
    });

    it("reads a campaign written before blocks by its words", () => {
      const c = only(campaignFitChecks(email(null, { body: "Book a fitting at the studio." }), abroad, facts), "fit_in_store");
      expect(c.issues[0]).toMatchObject({ blockId: null, text: expect.stringContaining("the email offers an in-store visit") });
    });
  });

  describe("what they already own", () => {
    const shelf = (...ids: string[]): EmailBlock => ({ id: "shelf", type: "products", products: ids, layout: "rows", buttonLabel: "Shop" });

    it("counts who already bought each class a products block shows, once a class, with the filter that leaves them out", () => {
      const list = [...people(12, { bought: ["mbolster"] }), ...people(3, { bought: ["premium", "mbolster"] }), ...people(45)];
      const c = only(campaignFitChecks(email(content(text("t", "Hi"), shelf(MBOLSTER, PREMIUM), shelf(MBOLSTER))), list, facts), "fit_already_own");
      expect(c.issues.map((i) => [i.blockId, i.text])).toEqual([
        ["shelf", "15 of 60 already own an Mbolster, which Block 2, Products offers: filter its Segment to “Didn't buy Mbolster”, or leave out a Segment of “Bought Mbolster”"],
        ["shelf", "3 of 60 already own a Premium Mpillow, which Block 2, Products offers: filter its Segment to “Didn't buy Premium Mpillow”, or leave out a Segment of “Bought Premium Mpillow”"],
      ]);
    });

    it("counts who already owns what a Customise button offers: an Mbolster, or an Mpillow of either Tier", () => {
      const customise: EmailBlock = {
        id: "b",
        type: "buttons",
        buttons: [
          { label: "Pair it with an Mbolster", target: "customise_mbolster", style: "primary" },
          { label: "One for your partner", target: "customise_mpillow", style: "secondary" },
        ],
      };
      const list = [...people(12, { bought: ["premium", "mbolster"] }), ...people(5, { bought: ["basic"] }), ...people(43)];
      const c = only(campaignFitChecks(email(content(text("t", "Hi"), customise)), list, facts), "fit_already_own");
      expect(c.issues.map((i) => [i.blockId, i.text])).toEqual([
        ["b", "12 of 60 already own an Mbolster, which Block 2, Buttons offers: filter its Segment to “Didn't buy Mbolster”, or leave out a Segment of “Bought Mbolster”"],
        [
          "b",
          "17 of 60 already own an Mpillow, which Block 2, Buttons offers: filter its Segment to “Didn't buy Premium Mpillow or Basic Mpillow”, or leave out a Segment of “Bought Premium Mpillow or Basic Mpillow”",
        ],
      ]);
      // A hero's button too.
      const hero: EmailBlock = {
        id: "hero",
        type: "hero",
        image: { asset: "", alt: "" },
        heading: "Pair it",
        line: "",
        button: { label: "Customise", target: "customise_mbolster", style: "primary" },
      } as EmailBlock;
      expect(only(campaignFitChecks(email(content(hero)), list, facts), "fit_already_own").issues[0].blockId).toBe("hero");
    });

    it("leaves accessories alone: one is not another", () => {
      expect(keys(campaignFitChecks(email(content(shelf(CASE))), people(5, { bought: ["accessory"] }), facts))).not.toContain("fit_already_own");
    });

    it("says nothing when nobody owns one, or a product's class is not known", () => {
      expect(keys(campaignFitChecks(email(content(shelf(MBOLSTER))), people(5, { bought: ["premium"] }), facts))).not.toContain("fit_already_own");
      expect(keys(campaignFitChecks(email(content(shelf("unknown-product"))), people(5, { bought: ["mbolster"] }), facts))).not.toContain("fit_already_own");
    });
  });

  describe("recent buyers", () => {
    it(`counts who bought in the last ${RECENT_PURCHASE_DAYS} days, and not a day more`, () => {
      const list = [
        person({ lastPurchaseAt: "2026-10-30T00:00:00Z" }),
        person({ lastPurchaseAt: "2026-10-17T05:00:00Z" }), // 13 days 23 hours ago
        person({ lastPurchaseAt: "2026-10-17T04:00:00Z" }), // exactly 14 days ago: not within
        person({ lastPurchaseAt: "2026-09-01T00:00:00Z" }),
        person(),
      ];
      expect(only(campaignFitChecks(email(content(text("t", "Hi"))), list, facts), "fit_recent").detail).toBe(
        "2 of 5 bought in the last 14 days: leave out a Segment of “Last order within a month”",
      );
    });
  });

  it("say so in one line of advice when who it goes to could not be read", () => {
    expect(fitUnreadCheck("Could not read who it goes to: timeout")).toEqual({
      key: "fit_unread",
      ok: false,
      advisory: true,
      detail: "Who it goes to wasn't checked against the email: Could not read who it goes to: timeout",
      issues: [{ blockId: null, text: expect.any(String), what: expect.any(String) }],
    });
  });
});

describe("what the fit checks read", () => {
  it("never a review, a rating or a note", () => {
    for (const columns of [RECIPIENT_FACT_COLUMNS, PILLOW_LINE_COLUMNS]) expect(columns).not.toMatch(/review|rating|note/i);
    const row = { id: "c1", first_name: "Ann", review_rating: 1, google_review_rating: 1, notes: "angry", locale: "en-US" };
    const facts = recipientFactsFromRow(row, null)!;
    expect(Object.keys(facts).sort()).toEqual(
      ["bought", "customerId", "firstName", "lastName", "lastPurchaseAt", "locale", "pillow", "pointsBalance", "shipCountry"].sort(),
    );
  });

  it("parse an overview row: an unknown country is null, never Singapore, and only the known classes", () => {
    expect(
      recipientFactsFromRow(
        { id: "c1", first_name: " Ann ", last_name: null, locale: "zh-CN", ship_country: "sg", bought: ["mbolster", "gift"], last_purchase_at: "2026-10-30T00:00:00Z", points_available: 1250 },
        { tier: "basic", size: "L" },
      ),
    ).toEqual({
      customerId: "c1",
      firstName: "Ann",
      lastName: null,
      pointsBalance: 1250,
      pillow: { tier: "basic", size: "L" },
      locale: "zh-CN",
      shipCountry: "SG",
      bought: ["mbolster"],
      lastPurchaseAt: "2026-10-30T00:00:00Z",
    });
    expect(recipientFactsFromRow({ id: "c2", ship_country: "Singapore" }, null)).toMatchObject({ shipCountry: null, locale: "en-US", bought: [], pointsBalance: null });
    expect(recipientFactsFromRow({ first_name: "No id" }, null)).toBeNull();
  });

  it("take each customer's latest pillow line, the later line of one Order breaking a tie", () => {
    const pillows = latestPillows([
      { customer_id: "a", tier: "basic", size: "S", paid_at: "2026-01-01T00:00:00Z", order_item_id: "i1" },
      { customer_id: "a", tier: "premium", size: "M", paid_at: "2026-06-01T00:00:00Z", order_item_id: "i2" },
      { customer_id: "b", tier: "premium", size: "L", paid_at: "2026-06-01T00:00:00Z", order_item_id: "i3" },
      { customer_id: "b", tier: "unknown", size: null, paid_at: "2026-06-01T00:00:00Z", order_item_id: "i4" },
      { customer_id: "c", tier: "basic", size: "S", paid_at: null, order_item_id: "i5" },
    ]);
    expect(Object.fromEntries(pillows)).toEqual({ a: { tier: "premium", size: "M" }, b: { tier: null, size: null } });
  });

  it("class each product as the purchase lines do: a bolster an Mbolster, a pillow its Tiers, the rest an accessory", () => {
    const kinds = new Map([
      ["1", "premium"],
      ["2", "basic"],
    ]);
    expect(
      productClasses(
        [
          { id: "bolster", product_type: "bolster", product_variants: [] },
          { id: "premium", product_type: "pillow", product_variants: [{ pillow_product_id: 1 }] },
          { id: "both", product_type: "pillow", product_variants: [{ pillow_product_id: 1 }, { pillow_product_id: 2 }] },
          { id: "bridged", product_type: "other", product_variants: [{ pillow_product_id: "2" }] },
          { id: "untiered", product_type: "pillow", product_variants: [{ pillow_product_id: 9 }] },
          { id: "case", product_type: "accessory", product_variants: [{ pillow_product_id: null }] },
        ],
        kinds,
      ),
    ).toEqual({ bolster: ["mbolster"], premium: ["premium"], both: ["premium", "basic"], bridged: ["basic"], untiered: [], case: ["accessory"] });
  });
});
