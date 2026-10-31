// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { CHINESE_SAMPLE_CONTENT, CHINESE_SAMPLE_LINES, CHINESE_SAMPLE_PRODUCTS, EMAIL_BLOCK_SAMPLE_IMAGES } from "../__fixtures__/samples";
import { CAMPAIGN_OWN_WORDS, productPriceText, renderCampaignBlocksEmail, type CampaignBlocksEmailData } from "../campaign-blocks";
import { money } from "../format";
import { EMAIL_FONT_STACK } from "@/lib/font-stack";
import { withoutChineseVersion } from "@/lib/email-campaigns/chinese-version";

/**
 * The renderer in Chinese (PRD-campaign-email-editor slice 17): for `zh-CN`,
 * the 中文 version's words in the English layout, its subject and preview
 * line, and the email's own words from the Chinese set; English for anyone
 * else, and for a campaign with no 中文 version.
 */

const UNSUBSCRIBE = "https://custom.mpillow.com/zh-CN/unsubscribe?u=x&t=y";
const data = (over: Partial<CampaignBlocksEmailData> = {}): CampaignBlocksEmailData => ({
  subject: CHINESE_SAMPLE_LINES.subject,
  preheader: CHINESE_SAMPLE_LINES.preheader,
  content: CHINESE_SAMPLE_CONTENT,
  greeting: true,
  values: { first_name: "美玲", last_name: "陈", points_balance: "", your_pillow: "Premium Mpillow, size M" },
  buttonHref: (b) => ("target" in b && b.target === "url" ? (b.url ?? null) : `https://custom.mpillow.com/zh-CN/${b.target}`),
  images: EMAIL_BLOCK_SAMPLE_IMAGES,
  products: CHINESE_SAMPLE_PRODUCTS,
  unsubscribeUrl: UNSUBSCRIBE,
  language: "zh-CN",
  ...over,
});

describe("renderCampaignBlocksEmail in 中文", () => {
  it("draws the 中文 words, subject and preview line, in a document that says it is Chinese", () => {
    const r = renderCampaignBlocksEmail(data());
    expect(r.subject).toBe("美玲，这个十二月睡得更清凉");
    expect(r.html).toContain('<html lang="zh-CN"');
    expect(r.html).toContain("FibreCool 枕套回来了，各种尺寸都有。");
    expect(r.html).toContain(">这个十二月，睡得更清凉</h1>");
    expect(r.html).not.toContain("Sleep cooler this December");
    expect(r.text).toContain("美玲，您好！");
  });

  it("writes the shell's own words in Chinese: the note, the footer links, the unsubscribe line and the copyright", () => {
    const r = renderCampaignBlocksEmail(data());
    for (const words of [CAMPAIGN_OWN_WORDS.zh.note, "隐私政策", "常见问题", "不想再收到这些邮件？", "取消订阅</a>", "保留所有权利。"]) expect(r.html).toContain(words);
    expect(r.html).not.toContain("Unsubscribe</a>");
    expect(r.text.split("\n").slice(-2)).toEqual([CAMPAIGN_OWN_WORDS.zh.note, `取消订阅：${UNSUBSCRIBE}`]);
  });

  it("says a polite hello alone for a reader with no name, whose first name is 您", () => {
    const r = renderCampaignBlocksEmail(data({ values: { first_name: "您", last_name: "", points_balance: "", your_pillow: "Premium Mpillow, size M" } }));
    expect(r.text).toContain("\n您好！\n");
    expect(r.text).not.toContain("您，您好");
  });

  it("writes a product's price as the 中文 shop does", () => {
    const p = { price: 39, compareAt: 49, from: true, currency: "SGD" };
    expect(productPriceText(p, { chinese: true })).toBe(`${money(39, "SGD")} 起（原价 ${money(49, "SGD")}）`);
    expect(productPriceText(p)).toBe(`from ${money(39, "SGD")} (was ${money(49, "SGD")})`);
    expect(renderCampaignBlocksEmail(data()).text).toContain(`FibreCool 凉感枕套\n${money(39, "SGD")} 起`);
  });

  it("is the English email for a reader of English, and for a campaign with no 中文 version", () => {
    const english = renderCampaignBlocksEmail(data({ language: "en-US", values: { first_name: "Bea", last_name: "", points_balance: "", your_pillow: "Premium Mpillow, size M" } }));
    expect(english.subject).toBe("Bea, sleep cooler this December");
    expect(english.html).toContain('<html lang="en"');
    expect(english.html).toContain("Unsubscribe</a>");
    const none = renderCampaignBlocksEmail(data({ content: withoutChineseVersion(CHINESE_SAMPLE_CONTENT) }));
    expect(none.html).toContain('<html lang="en"');
    expect(none.subject).toBe("美玲, sleep cooler this December");
  });

  it("names the Chinese system fonts after the Latin ones in every email's font stack", () => {
    expect(EMAIL_FONT_STACK).toBe("'Figtree','Segoe UI',Roboto,Helvetica,Arial,'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif");
    expect(renderCampaignBlocksEmail(data()).html).toContain(`font-family:${EMAIL_FONT_STACK}`);
  });
});
