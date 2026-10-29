// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignBlockProduct } from "@/lib/email/campaign-blocks";
import type { EmailTransport } from "@/lib/email/types";
import type { EmailRendition } from "@/lib/media-assets/email-renditions";
import { PROBE_CUSTOMER_ID, verifyUnsubscribeToken } from "@/lib/marketing-consent/unsubscribe";
import type { CampaignContent, EmailBlock } from "../content";
import type { ContentCheck, EmailFacts, EmailVersion, LinkAnswer } from "../content-checks";
import type { LinkRequest } from "../link-check";
import type { Campaign } from "../rules";
import { emptyWorld, fakeCampaignsClient, type FakeWorld } from "./fake-db";

/**
 * The email's own checks before a wave (PRD-campaign-email-editor slice 11):
 * each one, passing and failing, against fixture content, then through the
 * checks a wave runs, with a fake for the links. A check that holds the wave
 * names the block it is in; advice says *Recommended:* and never holds one.
 */

const h = vi.hoisted(() => ({ failed: new Map<string, string>() }));
vi.mock("@/lib/media-assets/email-renditions", () => ({
  ensureEmailRenditions: vi.fn(async (_admin: unknown, ids: string[]) => {
    const renditions = new Map<string, EmailRendition>();
    for (const id of ids) {
      if (!h.failed.has(id)) renditions.set(id, { assetId: id, url: renditionUrl(id), width: 1200, height: 800, bytes: 80_000, hasAlpha: false });
    }
    return { renditions, failed: new Map([...h.failed].filter(([id]) => ids.includes(id))) };
  }),
}));

const { addressesToAsk, campaignContentChecks, EMAIL_SIZE_ADVICE, EMAIL_SIZE_LIMIT, emailLinks, joinVersionChecks, placeholdersCheck } = await import("../content-checks");
const { EMPTY_CAMPAIGN_DRAFT } = await import("../rules");
const { campaignEmailChecks, planWave, readCampaignRenderData, renderCampaignAsSent, renderCampaignPreview } = await import("../sender");
const { CHECK_LABEL, sendSteps } = await import("../send-flow");
const { INVITATION_STARTER, LAYOUT_STARTERS, starterContent } = await import("../starters");

const ORIGIN = "https://custom.mpillow.com";
const SECRET = "campaign-test-secret";
const CAMPAIGN = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const BEA = "00000000-0000-4000-8000-000000000002";
const PHOTO = "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f";
const COVER = "3b7e1f2a-9c4d-4a6b-8e1f-5d2c3b4a6e7f";
const COVER_PHOTO = "8a2d3c4b-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const PRESS = "https://press.example.com/fibrecool";

function renditionUrl(id: string) {
  return `https://mpillow.supabase.co/storage/v1/object/public/media/email/${id}.jpg`;
}

const ANSWERED: LinkAnswer = { ok: true, reason: "answered 200" };
const run = (text: string, more: Record<string, unknown> = {}) => ({ text, ...more });

/** Enough words that images off still say something: over 300 characters. */
const WORDS =
  "Our FibreCool covers are back in every size. They are woven to stay cool against your skin on warm nights, " +
  "they wash at forty degrees and dry in an afternoon, and they fit every Mpillow we make. Pick the size of your " +
  "pillow, and we will send it within two working days. Questions about the fit? Reply to this email.";

/** A well-made email: a title, a photo, words with a link to the site and one to the press, a product, a button. */
const GOOD: CampaignContent = {
  v: 1,
  blocks: [
    { id: "title", type: "heading", level: 1, text: "Sleep cooler this December" },
    { id: "photo", type: "image", image: { asset: PHOTO, alt: "The FibreCool cover on a pillow" }, width: "full" },
    {
      id: "intro",
      type: "text",
      paragraphs: [
        { kind: "p", runs: [run("Hello "), { var: "first_name" }, run(`, ${WORDS} Read `), run("the care guide", { href: `${ORIGIN}/en-US/faq` }), run(" or "), run("the review", { href: PRESS }), run(".")] },
      ],
    },
    { id: "grid", type: "products", products: [COVER], layout: "rows", buttonLabel: "Shop now" },
    { id: "cta", type: "buttons", buttons: [{ label: "Shop the covers", target: "shop", style: "primary" }] },
  ],
  fallbacks: {},
};

const COVER_CARD: CampaignBlockProduct = { title: "FibreCool Cover", slug: "fibrecool-cover", image: { asset: COVER_PHOTO }, price: 39, compareAt: null, from: true, currency: "SGD" };

const version = (over: Partial<EmailVersion> = {}): EmailVersion => ({
  language: "en-US",
  subject: "Sleep cooler this December",
  preheader: "Our FibreCool covers are back, in every size",
  greeting: true,
  content: GOOD,
  rendered: { html: "<html><body>The email</body></html>" },
  ...over,
});
const facts = (over: Partial<EmailFacts> = {}): EmailFacts => ({
  origin: ORIGIN,
  images: {
    [PHOTO]: { url: renditionUrl(PHOTO), width: 1200, height: 800, hasAlpha: false },
    [COVER_PHOTO]: { url: renditionUrl(COVER_PHOTO), width: 1200, height: 1200, hasAlpha: false },
  },
  imageFailures: [],
  products: { [COVER]: COVER_CARD },
  unlisted: [],
  productsError: null,
  points: null,
  answers: { [PRESS]: ANSWERED, [renditionUrl(PHOTO)]: ANSWERED, [renditionUrl(COVER_PHOTO)]: ANSWERED },
  ...over,
});
/** GOOD with block `id` changed. */
const withBlock = (id: string, block: Partial<EmailBlock>): CampaignContent => ({
  ...GOOD,
  blocks: GOOD.blocks.map((b) => (b.id === id ? ({ ...b, ...block } as EmailBlock) : b)),
});
const checksOf = (v: Partial<EmailVersion> = {}, f: Partial<EmailFacts> = {}) => campaignContentChecks(version(v), facts(f));
const row = (key: string, v: Partial<EmailVersion> = {}, f: Partial<EmailFacts> = {}) => checksOf(v, f).find((c) => c.key === key);
const texts = (c: ContentCheck | undefined) => c?.issues.map((i) => i.text);

describe("a well-made email", () => {
  it("passes every check that holds a wave, in order, and has nothing to recommend", () => {
    const all = checksOf();
    expect(all.map((c) => [c.key, c.ok, c.advisory])).toEqual([
      ["placeholders", true, false],
      ["links", true, false],
      ["alt", true, false],
      ["images", true, false],
      ["products", true, false],
      ["fallbacks", true, false],
      ["clinical", true, false],
      ["size", true, false],
    ]);
    expect(all.every((c) => c.issues.length === 0)).toBe(true);
    for (const c of all) expect(CHECK_LABEL[c.key], c.key).toBeTruthy();
  });
});

describe("every block is written (slice 08)", () => {
  /** A short note, written but for its heading. */
  const NOTE: CampaignContent = {
    v: 1,
    blocks: [
      { id: "title", type: "heading", level: 1, text: "Sleep cooler" },
      { id: "head", type: "heading", level: 2, text: "" },
      { id: "intro", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Our covers are back." }] }] },
      { id: "cta", type: "buttons", buttons: [{ label: "Shop the covers", target: "shop", style: "primary" }] },
    ],
    fallbacks: {},
  };

  it("passes an email with every word written", () => {
    expect(placeholdersCheck(starterContent(INVITATION_STARTER))).toEqual({
      key: "placeholders",
      ok: true,
      advisory: false,
      issues: [],
      detail: "every block's words are written",
    });
  });

  it("names the block still empty, by its place and its kind", () => {
    expect(placeholdersCheck(NOTE)).toEqual({
      key: "placeholders",
      ok: false,
      advisory: false,
      issues: [{ blockId: "head", text: "Block 2, Heading: still empty", what: "still empty" }],
      detail: "Block 2, Heading: still empty",
    });
  });

  it("names three of a Starter left as it landed, and counts the rest", () => {
    const check = placeholdersCheck(starterContent(LAYOUT_STARTERS[0]))!;
    expect(check.ok).toBe(false);
    expect(check.detail).toBe("Block 1, Hero: still empty; Block 2, Heading: still empty; Block 3, Text: still empty; and 2 more");
  });

  it("says what else Save would refuse, and leaves alt text and links to their own checks", () => {
    const long = withBlock("title", { text: "x".repeat(130) } as Partial<EmailBlock>);
    expect(placeholdersCheck(long)?.detail).toBe("Block 1, Heading: At most 120 characters.");
    const unsaid = withBlock("photo", { image: { asset: PHOTO, alt: "" } } as Partial<EmailBlock>);
    const http = withBlock("cta", { buttons: [{ label: "Read it", target: "url", url: "http://mpillow.com", style: "primary" }] } as Partial<EmailBlock>);
    expect(placeholdersCheck(unsaid)?.ok).toBe(true);
    expect(placeholdersCheck(http)?.ok).toBe(true);
  });

  it("asks for a block in an email with none, and is no check at all for one written before blocks", () => {
    expect(placeholdersCheck({ v: 1, blocks: [], fallbacks: {} })).toMatchObject({ key: "placeholders", ok: false, detail: "the email has no blocks yet" });
    expect(placeholdersCheck(null)).toBeNull();
    expect(CHECK_LABEL.placeholders).toBe("Every block is written");
  });
});

describe("every link is a full https:// address that answers", () => {
  it("names a link that is not https, one that does not answer, and one to a page the site does not have", () => {
    const content: CampaignContent = {
      ...GOOD,
      blocks: [
        GOOD.blocks[0],
        { id: "words", type: "text", paragraphs: [{ kind: "p", runs: [run("Read "), run("the old review", { href: "https://old.example.com/review" }), run(".")] }] },
        {
          id: "cta",
          type: "buttons",
          buttons: [
            { label: "Read it", target: "url", url: "http://mpillow.com/care", style: "primary" },
            { label: "Our story", target: "url", url: `${ORIGIN}/en-US/our-story`, style: "secondary" },
          ],
        },
      ],
    };
    const links = row("links", { content }, { answers: { "https://old.example.com/review": { ok: false, reason: "answered 404" } } })!;
    expect(links.ok).toBe(false);
    expect(texts(links)).toEqual([
      'Block 2, Text: the link "the old review" to old.example.com/review answered 404',
      "Block 3, Buttons: button 1 goes to http://mpillow.com/care, which is not a full https:// address",
      "Block 3, Buttons: button 2 goes to custom.mpillow.com/en-US/our-story, which is not a page of the site",
    ]);
    expect(links.issues.map((i) => i.blockId)).toEqual(["words", "cta", "cta"]);
    expect(links.issues[0].what).toBe('the link "the old review" to old.example.com/review answered 404');
  });

  it("passes the site's own pages without asking them, and a link button with no link is named", () => {
    const own = withBlock("cta", { buttons: [{ label: "Book", target: "book_fitting", style: "primary" }] } as Partial<EmailBlock>);
    expect(row("links", { content: own })).toMatchObject({ ok: true, detail: "all 3 links answer" });
    expect(addressesToAsk(own, { origin: ORIGIN, images: facts().images })).toEqual([PRESS, renditionUrl(PHOTO), renditionUrl(COVER_PHOTO)]);
    const unlinked = withBlock("cta", { buttons: [{ label: "Read it", target: "url", url: "", style: "primary" }] } as Partial<EmailBlock>);
    expect(texts(row("links", { content: unlinked }))).toEqual(["Block 5, Buttons: the button has no link yet"]);
    // A target's page is the site's on any origin, a local one too: the site check is what holds the origin to https.
    const local = withBlock("intro", { paragraphs: [{ kind: "p", runs: [run(WORDS)] }] } as Partial<EmailBlock>);
    expect(emailLinks(local, "http://localhost:3000").map((l) => l.url)).toEqual(["http://localhost:3000/en-US/shop"]);
    expect(row("links", { content: local }, { origin: "http://localhost:3000" })).toMatchObject({ ok: true, detail: "the link answers" });
  });

  it("finds every link: text, buttons of every block, and an image's", () => {
    const content: CampaignContent = {
      v: 1,
      blocks: [
        { id: "pic", type: "image", image: { asset: PHOTO, alt: "A pillow" }, width: "full", link: { target: "url", url: "https://a.example.com/" } },
        { id: "hero", type: "hero", image: { asset: PHOTO, alt: "A pillow" }, heading: "Hi", button: { label: "Sign in", target: "sign_in", style: "primary" } },
        { id: "split", type: "split", image: { asset: PHOTO, alt: "A pillow" }, side: "left", heading: "Why", paragraphs: [{ kind: "p", runs: [run("b", { href: "https://b.example.com/" })] }] },
        { id: "go", type: "buttons", buttons: [{ label: "Product", target: "product", product: COVER, style: "primary" }] },
      ],
      fallbacks: {},
    };
    expect(emailLinks(content, ORIGIN).map((l) => [l.blockId, l.url, l.typed])).toEqual([
      ["pic", "https://a.example.com/", true],
      ["hero", `${ORIGIN}/en-US/account`, false],
      ["split", "https://b.example.com/", true],
    ]);
  });

  it("says a link it did not ask about was not checked, as advice: it holds nothing", () => {
    const all = checksOf({}, { answers: {} });
    expect(all.find((c) => c.key === "links")).toMatchObject({ ok: true, detail: "2 links checked, and they answer; 1 link not checked" });
    expect(all.find((c) => c.key === "images")).toMatchObject({ ok: true, detail: "every image is an email copy at an https address; 2 copies not checked" });
    const unchecked = all.find((c) => c.key === "links_unchecked")!;
    expect(unchecked).toMatchObject({ ok: false, advisory: true });
    expect(texts(unchecked)).toEqual([
      'Recommended: Block 3, Text: the link "the review" to press.example.com/fibrecool was not checked: open it yourself',
      "Recommended: Block 2, Image: the image's email copy was not checked",
      "Recommended: Block 4, Products: the photo of FibreCool Cover's email copy was not checked",
    ]);
  });
});

describe("every image has alt text", () => {
  it("names an image with none, and a linked image marked decorative", () => {
    const unsaid = withBlock("photo", { image: { asset: PHOTO, alt: " " } } as Partial<EmailBlock>);
    expect(row("alt", { content: unsaid })).toMatchObject({
      ok: false,
      issues: [{ blockId: "photo", text: "Block 2, Image: no alt text: describe what the image shows", what: "no alt text: describe what the image shows" }],
    });
    const linked = withBlock("photo", { image: { asset: PHOTO, alt: "", decorative: true }, link: { target: "shop" } } as Partial<EmailBlock>);
    expect(texts(row("alt", { content: linked }))).toEqual(["Block 2, Image: a linked image needs alt text: it is what the link says"]);
    const split: CampaignContent = { ...GOOD, blocks: [{ id: "s", type: "split", image: { asset: PHOTO, alt: "" }, side: "right", heading: "Why", paragraphs: [] }] };
    expect(texts(row("alt", { content: split }))).toEqual(["Block 1, Image + text: no alt text: describe what the image shows"]);
  });

  it("passes a decorative image, and asks nothing of an image not chosen yet (that one is still empty)", () => {
    const decorative = withBlock("photo", { image: { asset: PHOTO, alt: "", decorative: true } } as Partial<EmailBlock>);
    expect(row("alt", { content: decorative })).toMatchObject({ ok: true, detail: "the image has alt text" });
    const unchosen = withBlock("photo", { image: { asset: "", alt: "" } } as Partial<EmailBlock>);
    expect(row("alt", { content: unchosen })).toBeUndefined();
    expect(texts(row("placeholders", { content: unchosen }))).toEqual(["Block 2, Image: still empty"]);
  });
});

describe("every image is an email copy an inbox can show", () => {
  it("names an image with no copy, a WebP one, one not on https, one that does not answer, and a product's photo", () => {
    const broken = (url: string) => ({ url, width: 1200, height: 800, hasAlpha: false });
    expect(texts(row("images", {}, { imageFailures: [{ assetId: PHOTO, reason: "The image couldn't be read." }] }))).toEqual([
      "Block 2, Image: the image has no copy an inbox can show: The image couldn't be read.",
    ]);
    expect(texts(row("images", {}, { images: { ...facts().images, [PHOTO]: broken("https://x.test/master.webp") } }))).toEqual([
      "Block 2, Image: the image's email copy is WebP, which classic Outlook can't show",
    ]);
    expect(texts(row("images", {}, { images: { ...facts().images, [PHOTO]: broken("http://x.test/a.jpg") } }))).toEqual([
      "Block 2, Image: the image's email copy is not at an https address",
    ]);
    expect(texts(row("images", {}, { answers: { ...facts().answers, [renditionUrl(COVER_PHOTO)]: { ok: false, reason: "answered 403" } } }))).toEqual([
      "Block 4, Products: the photo of FibreCool Cover's email copy answered 403",
    ]);
  });

  it("passes copies that answer, and is no check for an email with no image", () => {
    expect(row("images")).toMatchObject({ ok: true, detail: "all 2 images are email copies that answer" });
    const plain: CampaignContent = { ...GOOD, blocks: [GOOD.blocks[0], GOOD.blocks[2]] };
    expect(row("images", { content: plain })).toBeUndefined();
    expect(row("alt", { content: plain })).toBeUndefined();
  });
});

describe("every product is still Listed", () => {
  it("names the block a product no longer in the shop is in, a product button's too", () => {
    const problem = "FibreCool Cover is no longer in the shop: remove it or list it again";
    const content = withBlock("cta", { buttons: [{ label: "See it", target: "product", product: COVER, style: "primary" }] } as Partial<EmailBlock>);
    const products = row("products", { content }, { products: {}, unlisted: [{ productId: COVER, problem }] })!;
    expect(products.ok).toBe(false);
    expect(texts(products)).toEqual([`Block 4, Products: ${problem}`, `Block 5, Buttons: ${problem}`]);
    expect(texts(row("products", {}, { productsError: "The shop's products couldn't be read: timeout" }))).toEqual(["The shop's products couldn't be read: timeout"]);
  });

  it("passes products in the shop, and is no check for an email with none", () => {
    expect(row("products")).toMatchObject({ ok: true, detail: "the product in the email is in the shop" });
    expect(row("products", { content: { ...GOOD, blocks: GOOD.blocks.filter((b) => b.id !== "grid") } })).toBeUndefined();
  });
});

describe("points only while points are live", () => {
  const off = { key: "points", ok: false, detail: "this email mentions points, and points are off: turn points on in Discounts → Points before sending it" };

  it("holds an email that mentions points, naming where it says them, with today's rule's words", () => {
    const content = withBlock("title", { text: "1,000 points are waiting" } as Partial<EmailBlock>);
    const points = row("points", { content, subject: "Your points are here" }, { points: off })!;
    expect(points).toMatchObject({ ok: false, advisory: false, detail: off.detail });
    expect(texts(points)).toEqual([
      "The subject: mentions points, which it can't promise until points are live",
      "Block 1, Heading: mentions points, which it can't promise until points are live",
    ]);
    expect(points.issues.map((i) => i.blockId)).toEqual([null, "title"]);
  });

  it("passes while points are live, and is no check for an email that does not mention them", () => {
    const live = { key: "points", ok: true, detail: "points are live: a sign-in within 3 months grants 1000 (S$10)" };
    expect(row("points", {}, { points: live })).toMatchObject({ ok: true, detail: live.detail, issues: [] });
    expect(row("points")).toBeUndefined();
  });
});

describe("every Variable has fallback words", () => {
  it("names a Variable the email uses with none", () => {
    const content = withBlock("title", { text: "Sleep cooler, {last_name}" } as Partial<EmailBlock>);
    expect(texts(row("fallbacks", { content }))).toEqual(["Last name has no fallback words: write what to say to a customer with no last name"]);
    expect(row("fallbacks", { content: { ...content, fallbacks: { last_name: "friend" } } })).toMatchObject({
      ok: true,
      detail: "every Variable has fallback words: First name, Last name",
    });
  });

  it("is no check for an email with no Variable and no greeting", () => {
    const content: CampaignContent = { ...GOOD, blocks: GOOD.blocks.filter((b) => b.id !== "intro") };
    expect(row("fallbacks", { content, greeting: false })).toBeUndefined();
  });
});

describe("no health claims", () => {
  it("names the block, the subject or the preview line that makes one", () => {
    const content = withBlock("title", { text: "Pillows that treat neck pain" } as Partial<EmailBlock>);
    const clinical = row("clinical", { content, preheader: "A cure for bad nights" })!;
    expect(clinical.ok).toBe(false);
    expect(texts(clinical)).toEqual([
      'The preview line contains "cure", which we cannot claim.',
      'Block 1, Heading contains "treat", which we cannot claim.',
    ]);
    expect(clinical.issues[1]).toMatchObject({ blockId: "title", what: 'contains "treat", which we cannot claim.' });
  });

  it("passes comfort, fit and sleep", () => {
    expect(row("clinical")).toMatchObject({ ok: true, detail: "no health claims: comfort, fit and sleep only" });
  });
});

describe("under Gmail's clip, as sent", () => {
  const html = (bytes: number) => ({ html: "x".repeat(bytes) });

  it("refuses an email of 100 KB or more, and advises from 85 KB", () => {
    expect(row("size", { rendered: html(EMAIL_SIZE_LIMIT) })).toMatchObject({
      ok: false,
      detail: "100.0 KB as sent: Gmail clips an email over 102 KB and hides its unsubscribe link, so make it shorter",
    });
    const close = checksOf({ rendered: html(91_200) });
    expect(close.find((c) => c.key === "size")).toMatchObject({ ok: true, detail: "91.2 KB as sent, under Gmail's 102 KB clip" });
    expect(close.find((c) => c.key === "size_close")).toMatchObject({
      ok: false,
      advisory: true,
      detail: "Recommended: make it shorter: at 91.2 KB as sent, it is close to Gmail's 102 KB clip",
    });
    expect(checksOf({ rendered: html(EMAIL_SIZE_ADVICE - 1) }).find((c) => c.key === "size_close")).toBeUndefined();
  });

  it("counts bytes, not characters, and fails an email that could not be rendered, saying why, unless a check above says so", () => {
    expect(row("size", { rendered: { html: "睡".repeat(34_000) } })?.ok).toBe(false); // 3 bytes each
    const unrendered = { error: "an image in the email has no copy an inbox can show" };
    expect(row("size", { rendered: unrendered })).toMatchObject({
      ok: false,
      detail: "it can't be measured until it renders as sent: an image in the email has no copy an inbox can show",
    });
    expect(row("size", { rendered: unrendered }, { imageFailures: [{ assetId: PHOTO, reason: "The image couldn't be read." }] })).toBeUndefined();
  });
});

describe("advice, which says Recommended: and never holds a wave", () => {
  it("a subject longer than a phone shows, counted as the customer reads it", () => {
    const subject = "{first_name}, our FibreCool covers are back for warm December nights";
    expect(row("subject_length", { subject })).toMatchObject({
      advisory: true,
      detail: "Recommended: a shorter subject: phones cut it off after about 60 characters, and it has 64",
    });
    // 69 characters as written, 57 as Mei Ling Tan reads it.
    expect(row("subject_length", { subject: "{first_name} {last_name}, our FibreCool covers are back this December" })).toBeUndefined();
    expect(row("subject_length", { subject: "{first_name}, sleep cooler" })).toBeUndefined();
  });

  it("no preview line", () => {
    expect(texts(row("preview_line", { preheader: null }))).toEqual(["Recommended: write a preview line: without one, the inbox shows the start of the email instead"]);
    expect(row("preview_line", { preheader: "  " })).toBeDefined();
    expect(row("preview_line")).toBeUndefined();
  });

  it("images with under 300 characters of words, alt text not counted", () => {
    const pictured: CampaignContent = { ...GOOD, blocks: [GOOD.blocks[0], GOOD.blocks[1], GOOD.blocks[4]] };
    expect(texts(row("image_words", { content: pictured }))).toEqual([
      "Recommended: more words: with images off, this email says only 42 characters, and an email of images alone reads as spam",
    ]);
    expect(row("image_words")).toBeUndefined();
    expect(row("image_words", { content: { ...GOOD, blocks: [GOOD.blocks[0]] } })).toBeUndefined();
  });

  it("blocks still marked Drafted with AI (slice 09)", () => {
    expect(row("ai_drafted", {}, { aiDrafted: ["intro", "gone"] })).toMatchObject({
      advisory: true,
      issues: [{ blockId: "intro", text: "Recommended: Block 3, Text: still marked Drafted with AI: read it, then press Keep" }],
    });
    expect(row("ai_drafted")).toBeUndefined();
  });

  it("is listed only when it recommends something, and every line says Recommended:", () => {
    const all = checksOf(
      { subject: "x".repeat(70), preheader: null, rendered: html(90_000), content: { ...GOOD, blocks: [GOOD.blocks[1]] } },
      { aiDrafted: ["photo"], answers: {} },
    );
    const advice = all.filter((c) => c.advisory);
    expect(advice.map((c) => c.key)).toEqual(["size_close", "subject_length", "preview_line", "image_words", "ai_drafted", "links_unchecked"]);
    for (const c of advice) {
      expect(c.ok).toBe(false);
      for (const i of c.issues) expect(i.text.startsWith("Recommended: ")).toBe(true);
    }
    expect(all.filter((c) => !c.advisory).every((c) => c.ok)).toBe(true);
  });

  function html(bytes: number) {
    return { html: "x".repeat(bytes) };
  }
});

describe("one version at a time (slice 17's 中文 is another)", () => {
  it("names a version that is not the English, and joins the two as one list", () => {
    const zh = version({ language: "zh-CN", subject: "", content: withBlock("title", { text: "" } as Partial<EmailBlock>) });
    const chinese = campaignContentChecks(zh, facts());
    expect(texts(chinese.find((c) => c.key === "placeholders"))).toEqual(["中文, Block 1, Heading: still empty"]);

    const joined = joinVersionChecks(checksOf(), chinese);
    expect(joined.map((c) => c.key)).toEqual(checksOf().map((c) => c.key));
    expect(joined.find((c) => c.key === "placeholders")).toMatchObject({ ok: false, detail: "中文, Block 1, Heading: still empty" });
    expect(joined.find((c) => c.key === "links")).toMatchObject({ ok: true, detail: "all 3 links answer" });
  });
});

describe("before a wave", () => {
  let world: FakeWorld;
  const campaign = (content: CampaignContent, over: Partial<Campaign> = {}): Campaign => ({
    ...EMPTY_CAMPAIGN_DRAFT,
    name: "December",
    subject: "Sleep cooler",
    preheader: "Our FibreCool covers are back, in every size",
    content,
    audience: "subscribed",
    id: CAMPAIGN,
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
    lockedAt: null,
    archivedAt: null,
    createdBy: null,
    ...over,
  });
  const setup = (linkRequest?: LinkRequest) => {
    const transport: EmailTransport = { name: "resend", send: async () => ({ id: "re_1" }) };
    return {
      admin: fakeCampaignsClient(world) as unknown as SupabaseClient,
      transport,
      campaignFrom: "Mpillow <hello@hello.mpillow.com>",
      campaignDomain: "hello.mpillow.com",
      orderFrom: "orders@mpillow.com",
      replyTo: "Mpillow Support <support@mpillow.com>",
      origin: ORIGIN,
      unsubscribeSecret: SECRET,
      // The site answers one-click unsubscribe for links signed here.
      fetchImpl: vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.pathname !== "/api/email/unsubscribe") return new Response("not found", { status: 404 });
        if (!verifyUnsubscribeToken(url.searchParams.get("u"), url.searchParams.get("t"), SECRET)) {
          return Response.json({ ok: false, error: "invalid_link" }, { status: 400 });
        }
        return Response.json({ ok: true });
      }) as unknown as typeof fetch,
      sleep: vi.fn(async () => undefined),
      linkRequest,
    };
  };
  /** A fake web: each address answers what `status` says now. */
  const web = (status: Record<string, number>) => {
    const asked: string[] = [];
    const request: LinkRequest = async (url, { method }) => {
      asked.push(`${method} ${url}`);
      return { status: status[url] ?? 404 };
    };
    return { request, asked, status };
  };

  /** A short note, written but for its heading. */
  const NOTE: CampaignContent = {
    v: 1,
    blocks: [
      { id: "title", type: "heading", level: 1, text: "Sleep cooler" },
      { id: "head", type: "heading", level: 2, text: "" },
      { id: "intro", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Our covers are back." }] }] },
      { id: "cta", type: "buttons", buttons: [{ label: "Shop the covers", target: "shop", style: "primary" }] },
    ],
    fallbacks: {},
  };

  beforeEach(() => {
    world = emptyWorld();
    world.customers.push({ id: BEA, email: "bea@x.test", first_name: "Bea", marketing_email: "subscribed" });
    world.campaigns.push({ id: CAMPAIGN, audience: "subscribed" });
    h.failed.clear();
  });

  it("holds the wave while a field is still on its placeholder, naming the block", async () => {
    const held = await planWave(campaign(NOTE), { size: 10 }, setup());
    expect(held.readiness.checks.find((c) => c.key === "placeholders")).toMatchObject({ ok: false, detail: "Block 2, Heading: still empty" });
    expect(held.readiness.ready).toBe(false);

    const written = await planWave(campaign({ ...NOTE, blocks: NOTE.blocks.filter((b) => b.id !== "head") }), { size: 10 }, setup());
    expect(written.readiness.checks.find((c) => c.key === "placeholders")?.ok).toBe(true);
    expect(written.readiness.ready).toBe(true);
  });

  it("shows an image missing its alt text and a link to http:// as two things to fix in The email, each naming its block", async () => {
    const content: CampaignContent = {
      v: 1,
      blocks: [
        { id: "title", type: "heading", level: 1, text: "Sleep cooler" },
        { id: "photo", type: "image", image: { asset: PHOTO, alt: "" }, width: "full" },
        { id: "cta", type: "buttons", buttons: [{ label: "Read the care guide", target: "url", url: "http://mpillow.com/care", style: "primary" }] },
      ],
      fallbacks: {},
    };
    const { request } = web({ [renditionUrl(PHOTO)]: 200 });
    const { readiness } = await planWave(campaign(content), { size: 10 }, setup(request));
    expect(readiness.ready).toBe(false);
    const failing = readiness.checks.filter((c) => !c.ok);
    expect(failing.map((c) => c.key)).toEqual(["links", "alt"]);
    const email = sendSteps({ dirty: false, locked: false, lastTest: null, checks: readiness.checks, advice: readiness.advice, allowance: readiness.allowance, resume: false }).find(
      (s) => s.key === "email",
    )!;
    expect(email.done).toBe(false);
    expect(email.items?.filter((i) => !i.advisory)).toEqual([
      { text: "Block 3, Buttons: the button goes to http://mpillow.com/care, which is not a full https:// address", blockId: "cta", advisory: false },
      { text: "Block 2, Image: no alt text: describe what the image shows", blockId: "photo", advisory: false },
    ]);
  });

  it("asks each link once in ten minutes, and again at the wave, so a link that died since is caught", async () => {
    const dying = "https://dying.example.com/offer";
    const content: CampaignContent = {
      ...NOTE,
      blocks: [NOTE.blocks[0], { id: "intro", type: "text", paragraphs: [{ kind: "p", runs: [run("See "), run("the offer", { href: dying }), run(".")] }] }],
    };
    const fake = web({ [dying]: 200 });
    const saved = await planWave(campaign(content), { size: 10 }, setup(fake.request));
    expect(saved.readiness.checks.find((c) => c.key === "links")).toMatchObject({ ok: true });
    expect(fake.asked).toEqual([`HEAD ${dying}`]);

    fake.status[dying] = 404;
    const again = await planWave(campaign(content), { size: 10 }, setup(fake.request));
    expect(again.readiness.checks.find((c) => c.key === "links")?.ok).toBe(true);
    expect(fake.asked).toHaveLength(1);

    const wave = await planWave(campaign(content), { size: 10, freshLinks: true }, setup(fake.request));
    expect(fake.asked).toEqual([`HEAD ${dying}`, `HEAD ${dying}`, `GET ${dying}`]);
    expect(wave.readiness.ready).toBe(false);
    expect(wave.readiness.checks.find((c) => c.key === "links")).toMatchObject({
      ok: false,
      issues: [{ blockId: "intro", text: 'Block 2, Text: the link "the offer" to dying.example.com/offer answered 404' }],
    });
  });

  it("measures the HTML a wave sends, not the preview, and holds an email over Gmail's clip", async () => {
    const s = setup();
    const c = campaign(NOTE);
    const shown = await readCampaignRenderData(s.admin, c.content);
    const sent = renderCampaignAsSent(c, { origin: ORIGIN, unsubscribeSecret: SECRET, ...shown }).html;
    const preview = renderCampaignPreview(c, { origin: ORIGIN, firstName: "Mei Ling", ...shown }).html;
    // As sent: the recipient's signed unsubscribe link, and no placeholder drawn for the empty heading.
    expect(sent).toContain(`u=${PROBE_CUSTOMER_ID}&amp;t=`);
    expect(sent).not.toContain("dashed");
    expect(preview).toContain("dashed");
    const kb = (html: string) => `${(new TextEncoder().encode(html).length / 1000).toFixed(1)} KB`;
    expect(kb(sent)).not.toBe(kb(preview));
    const size = (await campaignEmailChecks(s, c)).find((r) => r.key === "size")!;
    expect(size).toMatchObject({ ok: true, detail: `${kb(sent)} as sent, under Gmail's 102 KB clip` });

    // Twelve long text blocks: over the clip once rendered.
    const long: CampaignContent = {
      v: 1,
      blocks: Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, type: "text" as const, paragraphs: [{ kind: "p" as const, runs: [{ text: "Sleep cooler tonight. ".repeat(400) }] }] })),
      fallbacks: {},
    };
    const held = await planWave(campaign(long), { size: 10 }, s);
    expect(held.readiness.checks.find((r) => r.key === "size")).toMatchObject({ ok: false, detail: expect.stringMatching(/KB as sent: Gmail clips an email over 102 KB/) });
    expect(held.readiness.ready).toBe(false);
  });

  it("keeps advice out of the checks that hold a wave", async () => {
    const r = await planWave(campaign({ ...NOTE, blocks: NOTE.blocks.filter((b) => b.id !== "head") }, { preheader: null }), { size: 10 }, setup());
    expect(r.readiness.ready).toBe(true);
    expect(r.readiness.advice.map((c) => c.key)).toEqual(["preview_line"]);
    expect(r.readiness.checks.map((c) => c.key)).not.toContain("preview_line");
  });

  it("counts the blocks the editor still marks Drafted with AI as advice", async () => {
    const written = campaign({ ...NOTE, blocks: NOTE.blocks.filter((b) => b.id !== "head") });
    const advice = (await campaignEmailChecks(setup(), written, { aiDrafted: ["intro"] })).filter((c) => c.advisory);
    expect(advice).toEqual([
      expect.objectContaining({ key: "ai_drafted", issues: [expect.objectContaining({ blockId: "intro", text: "Recommended: Block 2, Text: still marked Drafted with AI: read it, then press Keep" })] }),
    ]);
  });

  it("names an image whose email copy could not be made", async () => {
    h.failed.set(PHOTO, "The image couldn't be read.");
    const content: CampaignContent = { ...NOTE, blocks: [NOTE.blocks[0], { id: "photo", type: "image", image: { asset: PHOTO, alt: "A pillow" }, width: "full" }] };
    const { readiness } = await planWave(campaign(content), { size: 10 }, setup());
    expect(readiness.checks.find((c) => c.key === "images")).toMatchObject({
      ok: false,
      issues: [{ blockId: "photo", text: "Block 2, Image: the image has no copy an inbox can show: The image couldn't be read." }],
    });
    // It can't be measured either, and the images check already says why.
    expect(readiness.checks.find((c) => c.key === "size")).toBeUndefined();
    expect(readiness.ready).toBe(false);
  });
});
