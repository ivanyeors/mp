import { describe, expect, it } from "vitest";
import { CHINESE_SAMPLE_CONTENT, CHINESE_SAMPLE_LINES, CHINESE_SAMPLE_WORDS } from "@/lib/email/__fixtures__/samples";
import {
  chineseBlock,
  chineseBlockStatus,
  chineseContent,
  chineseGaps,
  chineseLinesStatus,
  chineseVersionOf,
  chineseWords,
  englishWords,
  keepChineseBlock,
  keepChineseLines,
  withChineseBlocks,
  withChineseLines,
  withChineseTranslation,
  withoutChineseVersion,
  withoutGoneChinese,
  wordsFingerprint,
} from "../chinese-version";
import { CampaignContentPreviewSchema, CampaignContentSchema, CHINESE, CONTENT_LIMITS, type CampaignContent, type EmailBlock } from "../content";
import { CampaignDraftSchema, EMPTY_CAMPAIGN_DRAFT, mentionsPoints, variablesInEmail } from "../rules";

/**
 * The 中文 version (PRD-campaign-email-editor slice 17): one layout, two sets
 * of words. Only words are kept for 中文; the layout, links, images and
 * products are the English's, read through; a word changed in English leaves
 * its block out of date until it is translated again or kept.
 */

const content = CHINESE_SAMPLE_CONTENT;
const version = chineseVersionOf(content)!;
const block = <T extends EmailBlock["type"]>(c: CampaignContent, id: string) => c.blocks.find((b) => b.id === id) as Extract<EmailBlock, { type: T }>;
/** The content with one English block changed. */
const englishEdit = (c: CampaignContent, id: string, edit: (b: EmailBlock) => EmailBlock): CampaignContent => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? edit(b) : b)) });

describe("the content schema holds the 中文 version", () => {
  it("saves a campaign with its 中文 version, every word checked as English words are", () => {
    expect(CampaignContentSchema.safeParse(content).success).toBe(true);
    expect(version.blocks.intro).toMatchObject({ type: "text", from: wordsFingerprint(block(content, "intro")) });
  });

  it("refuses markup, an unknown Variable, an address in place of a link, or an empty label on Save", () => {
    const with_ = (words: unknown) => ({ ...content, translations: { [CHINESE]: { ...version, blocks: { ...version.blocks, why: words } } } });
    const fails = (words: unknown) => CampaignContentSchema.safeParse(with_(words));
    expect(fails({ type: "heading", from: "x1", text: "<b>为什么</b>" }).success).toBe(false);
    expect(fails({ type: "heading", from: "x1", text: "{frist_name}，你好" }).success).toBe(false);
    expect(fails({ type: "text", from: "x1", paragraphs: [{ kind: "p", runs: [{ text: "看看", href: "https://evil.example" }] }] }).success).toBe(false);
    const empty = with_({ type: "buttons", from: "x1", labels: [""] });
    expect(CampaignContentSchema.safeParse(empty).success).toBe(false);
    // The preview takes empty words, as it does in English.
    expect(CampaignContentPreviewSchema.safeParse(empty).success).toBe(true);
  });

  it("counts the 中文 version in the size check", () => {
    const long = "长".repeat(CONTENT_LIMITS.text);
    const blocks = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`t${i}`, { type: "text", from: "x1", paragraphs: [{ kind: "p", runs: [{ text: long }] }] }]));
    const big = { ...content, translations: { [CHINESE]: { ...version, blocks } } };
    const parsed = CampaignContentPreviewSchema.safeParse(big);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((i) => i.message === "The email is too long: make it shorter.")).toBe(true);
  });
});

describe("the 中文 email: English layout, 中文 words", () => {
  it("swaps every word, and keeps the order, images, products, targets, links and options", () => {
    const zh = chineseContent(content);
    expect(zh.blocks.map((b) => b.id)).toEqual(content.blocks.map((b) => b.id));
    expect(zh.fallbacks).toEqual({ first_name: "您" });
    const hero = block<"hero">(zh, "hero");
    expect(hero).toMatchObject({ heading: "这个十二月，睡得更清凉", image: { asset: block<"hero">(content, "hero").image.asset }, button: { label: "选购枕套", target: "shop" } });
    expect(block<"buttons">(zh, "pair").buttons).toEqual([
      { label: "定制您的 Mpillow", target: "customise_mpillow", style: "primary" },
      { label: "阅读保养指南", target: "url", url: "https://custom.mpillow.com/en-US/faq", style: "secondary" },
    ]);
    expect(block<"products">(zh, "products")).toMatchObject({ products: block<"products">(content, "products").products, buttonLabel: "立即选购" });
    expect(block<"split">(zh, "split")).toMatchObject({ side: "right", heading: "按您的尺寸定制", image: { alt: "Mpillow Premium 侧面" } });
  });

  it("links each 中文 link to its English address, by its place, and follows the English when it changes", () => {
    const runs = (c: CampaignContent) => (block<"text">(chineseContent(c), "intro").paragraphs[0] as { runs: { text?: string; href?: string }[] }).runs;
    expect(runs(content).filter((r) => r.href)).toEqual([
      { text: "保养指南", href: "https://custom.mpillow.com/en-US/faq" },
      { text: "预约量身", href: "https://custom.mpillow.com/en-US/appointments", bold: true },
    ]);
    const moved = englishEdit(content, "intro", (b) => ({
      ...b,
      paragraphs: (b as Extract<EmailBlock, { type: "text" }>).paragraphs.map((p) =>
        p.kind === "p" ? { ...p, runs: p.runs.map((r) => ("href" in r && r.href?.endsWith("/faq") ? { ...r, href: "https://custom.mpillow.com/en-US/care" } : r)) } : p,
      ),
    }));
    expect(runs(moved).find((r) => r.text === "保养指南")?.href).toBe("https://custom.mpillow.com/en-US/care");
    // A new address is not a change of words: the block stays current.
    expect(chineseBlockStatus(block(moved, "intro"), chineseVersionOf(moved))).toBe("current");
  });

  it("changes the 中文 email's layout when the English layout changes", () => {
    const reordered: CampaignContent = { ...content, blocks: [...content.blocks].reverse() };
    expect(chineseContent(reordered).blocks.map((b) => b.id)).toEqual(reordered.blocks.map((b) => b.id));
    const retargeted = englishEdit(content, "hero", (b) => ({ ...b, button: { label: "Shop the covers", target: "book_fitting", style: "secondary" } }) as EmailBlock);
    expect(block<"hero">(chineseContent(retargeted), "hero").button).toEqual({ label: "选购枕套", target: "book_fitting", style: "secondary" });
    expect(chineseGaps(retargeted)).toEqual([]);
  });

  it("is the English content itself when there is no 中文 version", () => {
    const english = withoutChineseVersion(content);
    expect(english.translations).toBeUndefined();
    expect(chineseContent(english)).toBe(english);
    expect(chineseWords(english)).toEqual([]);
  });
});

describe("what is out of date in 中文", () => {
  it("marks a block whose English words changed, and only that block", () => {
    const changed = englishEdit(content, "why", (b) => ({ ...b, text: "Why FibreCool keeps you cool" }) as EmailBlock);
    expect(chineseGaps(changed)).toEqual([{ id: "why", n: 3, type: "heading", status: "changed" }]);
  });

  it("does not mark a block for bold or italic, which say nothing new", () => {
    const bolded = englishEdit(content, "split", (b) => ({ ...b, paragraphs: [{ kind: "p", runs: [{ text: "Your fitting sets its height.", bold: true }] }] }) as EmailBlock);
    expect(chineseGaps(bolded)).toEqual([]);
  });

  it("shows a block added in English as not translated yet; a divider or spacer never needs words", () => {
    const added: CampaignContent = {
      ...content,
      blocks: [...content.blocks, { id: "more", type: "heading", level: 2, text: "Care" }, { id: "gap", type: "spacer", size: "m" }],
    };
    expect(chineseGaps(added)).toEqual([{ id: "more", n: 9, type: "heading", status: "untranslated" }]);
    expect(chineseBlock(block(added, "more"), undefined)).toEqual({ id: "more", type: "heading", level: 2, text: "" });
  });

  it("drops the 中文 words of a block deleted in English", () => {
    const deleted: CampaignContent = { ...content, blocks: content.blocks.filter((b) => b.id !== "why") };
    expect(Object.keys(chineseVersionOf(withoutGoneChinese(deleted))!.blocks)).not.toContain("why");
    expect(withoutGoneChinese(content)).toBe(content);
  });

  it("marks the subject and preview line out of date when the English ones change", () => {
    expect(chineseLinesStatus(version, CHINESE_SAMPLE_LINES.subject, CHINESE_SAMPLE_LINES.preheader)).toBe("current");
    expect(chineseLinesStatus(version, "Sleep cooler tonight", CHINESE_SAMPLE_LINES.preheader)).toBe("changed");
    const kept = chineseVersionOf(keepChineseLines(content, "Sleep cooler tonight", CHINESE_SAMPLE_LINES.preheader));
    expect(chineseLinesStatus(kept, "Sleep cooler tonight", CHINESE_SAMPLE_LINES.preheader)).toBe("current");
    expect(chineseLinesStatus(null, "S", null)).toBe("untranslated");
  });

  it("*Keep* makes a block current, a part the English gained empty for Staff to write", () => {
    const gained = englishEdit(content, "pair", () => ({ id: "pair", type: "buttons", buttons: [{ label: "Shop", target: "shop", style: "primary" }, { label: "Book", target: "book_fitting", style: "secondary" }] }));
    // Two buttons still, but different words: out of date.
    expect(chineseGaps(gained).map((g) => g.status)).toEqual(["changed"]);
    const kept = keepChineseBlock(gained, "pair");
    expect(chineseGaps(kept)).toEqual([]);
    expect(chineseVersionOf(kept)!.blocks.pair).toMatchObject({ labels: ["定制您的 Mpillow", "阅读保养指南"] });
    const grown = englishEdit(content, "hero", (b) => ({ ...b, line: undefined, button: undefined }) as EmailBlock);
    const shrunk = keepChineseBlock(grown, "hero");
    expect(chineseVersionOf(shrunk)!.blocks.hero).toEqual({ type: "hero", from: wordsFingerprint(block(grown, "hero")), alt: "铺好的床上的白色 FibreCool 枕套", heading: "这个十二月，睡得更清凉" });
  });
});

describe("editing the 中文 words", () => {
  it("keeps a 中文 edit as words alone, with the fingerprint it was made from", () => {
    const zh = chineseContent(content).blocks;
    const edited = zh.map((b) => (b.id === "why" ? { ...b, text: "为什么选 FibreCool？" } : b));
    const next = withChineseBlocks(content, edited);
    expect(chineseVersionOf(next)!.blocks.why).toEqual({ type: "heading", from: version.blocks.why.from, text: "为什么选 FibreCool？" });
    expect(next.blocks).toBe(content.blocks);
  });

  it("never changes the layout from 中文: a target or an image changed there is ignored", () => {
    const zh = chineseContent(content).blocks;
    const edited = zh.map((b) =>
      b.id === "hero" && b.type === "hero" ? { ...b, image: { ...b.image, asset: "00000000-0000-4000-8000-000000000000" }, button: { label: "去看看", target: "url" as const, url: "https://evil.example", style: "secondary" as const } } : b,
    );
    const next = withChineseBlocks(content, edited);
    expect(next.blocks).toEqual(content.blocks);
    expect(block<"hero">(chineseContent(next), "hero").button).toEqual({ label: "去看看", target: "shop", style: "primary" });
  });

  it("translates a block by hand: typed into, it is current; emptied again, it is not translated", () => {
    const added: CampaignContent = { ...content, blocks: [...content.blocks, { id: "more", type: "heading", level: 2, text: "Care" }] };
    const typed = withChineseBlocks(added, chineseContent(added).blocks.map((b) => (b.id === "more" ? { ...b, text: "保养" } : b)));
    expect(chineseGaps(typed)).toEqual([]);
    const emptied = withChineseBlocks(typed, chineseContent(typed).blocks.map((b) => (b.id === "more" ? { ...b, text: "" } : b)));
    expect(chineseGaps(emptied)).toEqual([{ id: "more", n: 9, type: "heading", status: "untranslated" }]);
  });

  it("keeps a 中文 link only where it is one of the English block's", () => {
    const zh = chineseContent(content).blocks;
    const edited = zh.map((b) =>
      b.id === "split" && b.type === "split" ? { ...b, paragraphs: [{ kind: "p" as const, runs: [{ text: "看看", href: "https://evil.example" }] }] } : b,
    );
    const words = chineseVersionOf(withChineseBlocks(content, edited))!.blocks.split;
    expect(words).toMatchObject({ paragraphs: [{ kind: "p", runs: [{ text: "看看" }] }] });
  });

  it("changes the 中文 subject, preview line and fallbacks", () => {
    const next = withChineseLines(content, { subject: "清凉十二月", fallbacks: { first_name: "亲爱的顾客" } });
    expect(chineseVersionOf(next)).toMatchObject({ subject: "清凉十二月", preheader: CHINESE_SAMPLE_LINES.chinesePreheader, fallbacks: { first_name: "亲爱的顾客" } });
  });
});

describe("a translation put in", () => {
  it("makes the 中文 version, and replaces only what it brings", () => {
    const english = withoutChineseVersion(content);
    const why = block(english, "why");
    const made = withChineseTranslation(english, { subject: "清凉", preheader: "", from: "x1", blocks: { why: { type: "heading", from: wordsFingerprint(why), text: "为什么" } } });
    expect(chineseVersionOf(made)).toMatchObject({ subject: "清凉", blocks: { why: { text: "为什么" } } });
    expect(chineseGaps(made).map((g) => g.id)).toEqual(["hero", "intro", "split", "products", "photo", "pair"]);
    const again = withChineseTranslation(made, { blocks: { hero: { type: "hero", from: "x1", heading: "清凉" } } });
    expect(chineseVersionOf(again)).toMatchObject({ subject: "清凉", blocks: { why: { text: "为什么" }, hero: { heading: "清凉" } } });
  });

  it("reads the English as the 中文 shape keeps it: links by place, a decorative image with nothing to say", () => {
    expect(englishWords(block(content, "intro"))).toMatchObject({ paragraphs: [{ runs: [{ var: "first_name" }, {}, { text: "care guide", link: 0 }, {}, { text: "book a fitting", link: 1, bold: true }, {}] }, {}] });
    expect(englishWords({ id: "x", type: "image", image: { asset: "", alt: "", decorative: true }, width: "full" })).toBeNull();
    expect(englishWords({ id: "x", type: "divider" })).toBeNull();
    expect(Object.keys(CHINESE_SAMPLE_WORDS).sort()).toEqual(content.blocks.filter((b) => englishWords(b)).map((b) => b.id).sort());
  });
});

describe("the 中文 version in the campaign's rules", () => {
  const draft = { ...EMPTY_CAMPAIGN_DRAFT, name: "December", subject: CHINESE_SAMPLE_LINES.subject, preheader: CHINESE_SAMPLE_LINES.preheader, content };

  it("needs 中文 fallback words for every Variable the email uses, as English does", () => {
    expect(CampaignDraftSchema.safeParse(draft).success).toBe(true);
    const lastName = withChineseLines(content, { subject: "{last_name}，你好" });
    const parsed = CampaignDraftSchema.safeParse({ ...draft, content: { ...lastName, fallbacks: { ...lastName.fallbacks, last_name: "customer" } } });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path.join("."))).toEqual(["content.translations.zh-CN.fallbacks.last_name"]);
    expect(parsed.error?.issues[0].message).toBe("Write what to say to a customer with no last name, in Chinese.");
    expect(variablesInEmail({ ...draft, content: lastName })).toEqual(["first_name", "last_name"]);
  });

  it("counts 积分 in the 中文 version as a mention of points", () => {
    expect(mentionsPoints(draft)).toBe(false);
    expect(mentionsPoints({ ...draft, content: withChineseLines(content, { preheader: "登录领取积分" }) })).toBe(true);
  });
});
