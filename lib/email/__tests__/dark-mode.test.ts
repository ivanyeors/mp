// @vitest-environment jsdom
// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { darkRules, forceDarkMode, FORCED_DARK_STYLE_ID, renderEmailShell } from "../base";
import { AUTH_TEMPLATE_LABELS } from "../contact-sheet";
import { EMAIL_REGISTRY } from "../registry";
import { DARK, LIGHT } from "../theme";
import { CHINESE_SAMPLE_CONTENT, CHINESE_SAMPLE_PRODUCTS, EMAIL_BLOCK_SAMPLE_IMAGES, EMAIL_BLOCK_SAMPLE_PRODUCTS, EMAIL_BLOCK_SAMPLES } from "../__fixtures__/samples";
import { EMAIL_BLOCK_TYPES, emptyBlock, type CampaignContent } from "@/lib/email-campaigns/content";
import { EMPTY_CAMPAIGN_DRAFT, FIRST_CAMPAIGN_DRAFT, type CampaignDraft } from "@/lib/email-campaigns/rules";
import { renderCampaignPreview } from "@/lib/email-campaigns/sender";
import { STARTERS, starterDraft } from "@/lib/email-campaigns/starters";

/**
 * Light and dark, by themselves (PRD-campaign-email-editor decision 2, slice
 * 15). Every email there is (the registry, every Email block, legacy
 * campaigns and the Supabase auth templates) is checked against the shell's
 * one dark list, `darkRules()`:
 *
 *   - every `mp-*` class it draws has a rule there, or is on NO_DARK_CHANGE;
 *   - every colour or fill it sets inline is replaced by a rule in dark, so
 *     no light ink is left for the client to keep;
 *   - every word reads, 4.5:1 or more against what it sits on, in dark, and
 *     in light but for one pair the site itself draws (SITE_LIGHT_PAIRS).
 *
 * A new block or component meets the same three as it lands (slices 05, 06
 * and 07): its classes join darkRules() in lib/email/base.ts, never a style
 * of its own.
 */

type Rule = [selector: string, declarations: string];
type Mode = "light" | "dark";

/**
 * Classes with no dark rule, on purpose: none of them paints anything. A
 * class that sets a colour, a fill or a border belongs in darkRules().
 */
const NO_DARK_CHANGE: Record<string, string> = {
  "mp-container": "the 600px column, made full width on a phone",
  "mp-pad": "the card's padding, made smaller on a phone",
  "mp-btn-table": "a button's width on a phone; its fill is mp-btn-cell's",
  "mp-pill": "every status pill's hook; its colours are its tone's, mp-pill-<tone>, each with a rule",
};

const ORIGIN = "https://custom.mpillow.com";
const preview = (c: CampaignDraft) =>
  renderCampaignPreview(c, { origin: ORIGIN, firstName: "Ivan", images: EMAIL_BLOCK_SAMPLE_IMAGES, products: EMAIL_BLOCK_SAMPLE_PRODUCTS }).html;
const blocks = (content: CampaignContent): CampaignDraft => ({ ...EMPTY_CAMPAIGN_DRAFT, name: "Blocks", subject: "Sleep cooler", content });
const AUTH_DIR = join(process.cwd(), "supabase", "templates");

/** Every email there is, as [name, html]. */
const EMAILS: [name: string, html: string][] = [
  ...EMAIL_REGISTRY.flatMap((e) => (["happy", "hostile"] as const).map((f): [string, string] => [`${e.id} (${f})`, e.render(f).html])),
  ...EMAIL_BLOCK_TYPES.map((t): [string, string] => [`block: ${t}`, preview(blocks(EMAIL_BLOCK_SAMPLES[t]))]),
  ["blocks: every field on its placeholder", preview(blocks({ v: 1, blocks: EMAIL_BLOCK_TYPES.map((t) => emptyBlock(t, t)), fallbacks: {} }))],
  ["blocks: no block yet", preview(blocks({ v: 1, blocks: [], fallbacks: {} }))],
  [
    "blocks: the 中文 version",
    renderCampaignPreview(blocks(CHINESE_SAMPLE_CONTENT), { origin: ORIGIN, firstName: "美玲", images: EMAIL_BLOCK_SAMPLE_IMAGES, products: CHINESE_SAMPLE_PRODUCTS, locale: "zh-CN" }).html,
  ],
  // Each Starter as it lands, on its placeholders (slice 08).
  ...STARTERS.map((s): [string, string] => [`starter: ${s.label}`, preview(starterDraft(s))]),
  ["legacy: the sign-in invitation", preview(FIRST_CAMPAIGN_DRAFT)],
  ["legacy: every field on its placeholder", preview({ ...EMPTY_CAMPAIGN_DRAFT, content: null, button: { target: "sign_in", label: "", url: null } })],
  ...readdirSync(AUTH_DIR)
    .filter((f) => f in AUTH_TEMPLATE_LABELS)
    .map((f): [string, string] => [`supabase/templates/${f}`, readFileSync(join(AUTH_DIR, f), "utf8")]),
];

// ---------------------------------------------------------------------------
// The three checks
// ---------------------------------------------------------------------------

const classesIn = (html: string) => new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith("mp-")));

const ruledClasses = (rules: Rule[]) => new Set(rules.flatMap(([sel]) => sel.match(/\.mp-[a-z0-9-]+/g) ?? []).map((c) => c.slice(1)));

/** The `mp-*` classes `html` draws that have no dark rule and are not on NO_DARK_CHANGE. */
function unruledClasses(html: string, rules: Rule[] = darkRules()): string[] {
  const ruled = ruledClasses(rules);
  return [...classesIn(html)].filter((c) => !ruled.has(c) && !(c in NO_DARK_CHANGE));
}

/** `prop: value` pairs of a declaration list, `!important` dropped. */
function declarations(list: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of list.split(";")) {
    const at = d.indexOf(":");
    if (at > 0) out.set(d.slice(0, at).trim().toLowerCase(), d.slice(at + 1).replace("!important", "").trim());
  }
  return out;
}

/** A simple selector's weight: classes and attributes before element names. */
const specificity = (selector: string) =>
  selector.split(/\s+/).reduce((n, part) => n + (part.match(/[.[]/g)?.length ?? 0) * 100 + (/^[a-z]/i.test(part) ? 1 : 0), 0);

/** What the dark rules paint on `el`: each property's winning value, as a browser picks among `!important` rules. */
function darkPaint(el: Element, rules: Rule[]): { color?: string; background?: string } {
  const best: Record<"color" | "background", { weight: number; value: string } | undefined> = { color: undefined, background: undefined };
  for (const [selector, list] of rules) {
    const weights = selector.split(", ").filter((s) => el.matches(s)).map(specificity);
    if (!weights.length) continue;
    const weight = Math.max(...weights);
    const d = declarations(list);
    for (const [prop, value] of [
      ["color", d.get("color")],
      ["background", d.get("background") ?? d.get("background-color")],
    ] as const) {
      // A later rule of the same weight wins, as in the stylesheet.
      if (value && (!best[prop] || weight >= best[prop].weight)) best[prop] = { weight, value };
    }
  }
  return { color: best.color?.value, background: best.background?.value };
}

/** The colour and fill an element sets inline (its `bgcolor` too). */
function inlinePaint(el: Element): { color?: string; background?: string } {
  const d = declarations(el.getAttribute("style") ?? "");
  return { color: d.get("color"), background: d.get("background") ?? d.get("background-color") ?? el.getAttribute("bgcolor") ?? undefined };
}

/** An element's own colour and fill in `mode`; a dark rule beats the inline style, whose declarations are not `!important`. */
function paint(el: Element, mode: Mode, rules: Rule[]) {
  const inline = inlinePaint(el);
  if (mode === "light") return inline;
  const dark = darkPaint(el, rules);
  return { color: dark.color ?? inline.color, background: dark.background ?? inline.background };
}

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const describeEl = (el: Element) => `<${el.tagName.toLowerCase()}${el.className ? ` class="${el.className}"` : ""}>`;

/** Elements whose inline colour or fill no dark rule replaces: light ink left in a dark email. */
function unreachedInk(html: string, rules: Rule[] = darkRules()): string[] {
  const out: string[] = [];
  for (const el of parse(html).body.querySelectorAll("*")) {
    const inline = inlinePaint(el);
    const dark = darkPaint(el, rules);
    if (inline.color && !dark.color) out.push(`${describeEl(el)} keeps its colour ${inline.color}`);
    if (inline.background && !dark.background) out.push(`${describeEl(el)} keeps its fill ${inline.background}`);
  }
  return out;
}

function luminance(hex: string): number {
  const h = hex.replace(/^#/, "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast of two `#rgb` / `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const hidden = (el: Element | null): boolean =>
  Boolean(el) && (/display:\s*none/.test(el!.getAttribute("style") ?? "") || hidden(el!.parentElement));

/**
 * The one pair under 4.5:1, kept as the site draws it: small print in a
 * muted panel, light (the site's muted-foreground on muted, 4.35:1). Its dark
 * pair, DARK.mutedFg on DARK.mutedBg, reads at 5.6:1.
 */
const SITE_LIGHT_PAIRS: ReadonlyArray<readonly [ink: string, fill: string]> = [[LIGHT.mutedFg, LIGHT.mutedBg]];

/** Words in `mode` under 4.5:1 against what they sit on, or with no colour of their own. */
function unreadableWords(html: string, mode: Mode, rules: Rule[] = darkRules()): string[] {
  const accepted = (ink: string, fill: string) => mode === "light" && SITE_LIGHT_PAIRS.some(([i, f]) => i === ink && f === fill);
  const doc = parse(html);
  const out: string[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const words = node.textContent?.trim();
    const el = node.parentElement;
    if (!words || !el || hidden(el)) continue;
    let ink: string | undefined;
    let fill: string | undefined;
    for (let e: Element | null = el; e && !(ink && fill); e = e.parentElement) {
      const p = paint(e, mode, rules);
      ink ??= p.color;
      fill ??= p.background;
    }
    const quoted = `"${words.slice(0, 40)}"`;
    if (!ink || !fill) out.push(`${quoted} has no ${ink ? "fill" : "colour"} of its own: the client picks it`);
    else if (contrast(ink, fill) < 4.5 && !accepted(ink, fill)) out.push(`${quoted} is ${ink} on ${fill}, ${contrast(ink, fill).toFixed(2)}:1`);
  }
  return out;
}

/**
 * Links whose only sign is their colour. A client that inverts colours by
 * itself (Gmail on iOS) is reached by no rule; an underline survives it. A
 * button is its fill's shape, so it needs none, and a linked image (slice 05)
 * is its picture, with no words to underline.
 */
const bareLinks = (html: string) =>
  [...parse(html).body.querySelectorAll("a[href]:not(.mp-btn)")]
    .filter((a) => !(a.querySelector("img") && !a.textContent?.trim()))
    .filter((a) => !/text-decoration:\s*underline/.test(a.getAttribute("style") ?? ""))
    .map((a) => `"${a.textContent?.trim()}" is not underlined`);

/** Each email's findings, `name: finding`, for one failure message naming them all. */
const everywhere = (check: (html: string) => string[]) => EMAILS.flatMap(([name, html]) => [...new Set(check(html))].map((f) => `${name}: ${f}`));

// ---------------------------------------------------------------------------

describe("every email in light and dark (PRD-campaign-email-editor slice 15)", () => {
  it("renders every block type, legacy campaigns, every registered email and the auth templates", () => {
    expect(EMAILS.length).toBeGreaterThan(EMAIL_REGISTRY.length * 2 + EMAIL_BLOCK_TYPES.length);
    expect(EMAILS.filter(([name]) => name.startsWith("supabase/"))).toHaveLength(Object.keys(AUTH_TEMPLATE_LABELS).length);
  });

  it("has a dark rule for every mp-* class it draws, or the class paints nothing", () => {
    // Add the class's rule to darkRules() in lib/email/base.ts; only a class
    // with no colour, fill or border goes on NO_DARK_CHANGE, saying why.
    expect(everywhere(unruledClasses)).toEqual([]);
  });

  it("leaves no inline colour or fill for the client to keep in dark", () => {
    expect(everywhere(unreachedInk)).toEqual([]);
  });

  it("reads in dark: every word 4.5:1 or more against what it sits on", () => {
    expect(everywhere((html) => unreadableWords(html, "dark"))).toEqual([]);
  });

  it("underlines every link, so none is told by its colour alone", () => {
    expect(everywhere(bareLinks)).toEqual([]);
  });

  it("reads in light too, but for the site's own muted panel", () => {
    expect(everywhere((html) => unreadableWords(html, "light"))).toEqual([]);
    expect(contrast(DARK.mutedFg, DARK.mutedBg)).toBeGreaterThan(4.5);
  });

  it("keeps NO_DARK_CHANGE short and true: each is still drawn, and none has a rule", () => {
    const drawn = new Set(EMAILS.flatMap(([, html]) => [...classesIn(html)]));
    const ruled = ruledClasses(darkRules());
    for (const c of Object.keys(NO_DARK_CHANGE)) {
      expect(drawn.has(c), `${c} is drawn nowhere: take it off the list`).toBe(true);
      expect(ruled.has(c), `${c} has a dark rule: take it off the list`).toBe(false);
    }
  });
});

describe("the checks catch what they are for", () => {
  const shell = (bodyHtml: string) => renderEmailShell({ bodyHtml });

  it("a new class with no dark rule, and the colour and fill it paints", () => {
    const html = shell(`<p class="mp-callout" style="color:${LIGHT.fg};background:${LIGHT.mutedBg};">New</p>`);
    expect(unruledClasses(html)).toEqual(["mp-callout"]);
    expect(unreachedInk(html)).toEqual([
      `<p class="mp-callout"> keeps its colour ${LIGHT.fg}`,
      `<p class="mp-callout"> keeps its fill ${LIGHT.mutedBg}`,
    ]);
  });

  it("light ink left on the dark card", () => {
    const html = shell(`<p class="mp-fg" style="color:${LIGHT.fg};">Old</p><p style="color:${LIGHT.fg};">New</p>`);
    expect(unreadableWords(html, "light")).toEqual([]);
    expect(unreadableWords(html, "dark")).toEqual([`"New" is ${LIGHT.fg} on ${DARK.card}, ${contrast(LIGHT.fg, DARK.card).toFixed(2)}:1`]);
  });

  it("words with no colour of their own", () => {
    expect(unreadableWords(shell("<p>Bare</p>"), "dark")).toEqual(['"Bare" has no colour of its own: the client picks it']);
  });

  it("a button whose ink was flipped without its fill", () => {
    const flipped = darkRules().map(([s, d]): Rule => [s, s === ".mp-btn" ? `color: ${DARK.primary} !important;` : d]);
    const html = preview(blocks(EMAIL_BLOCK_SAMPLES.buttons));
    expect(unreadableWords(html, "dark")).toEqual([]);
    expect(unreadableWords(html, "dark", flipped)).toContain(`"Shop the covers" is ${DARK.primary} on ${DARK.primary}, 1.00:1`);
  });
});

describe("forceDarkMode: the preview's Dark", () => {
  const html = preview(blocks(EMAIL_BLOCK_SAMPLES.buttons));
  const forced = forceDarkMode(html);
  const FORCED = new RegExp(`<style type="text/css" id="${FORCED_DARK_STYLE_ID}">\\n([\\s\\S]*?)\\n  </style>\\n`);
  const lines = (css: string) => css.split("\n").map((l) => l.trim());

  it("applies the shell's own rule list, with no media query", () => {
    const media = /@media \(prefers-color-scheme: dark\) \{\n([\s\S]*?)\n {4}\}/.exec(html)![1];
    const own = FORCED.exec(forced)![1];
    expect(lines(own)).toEqual(lines(media));
    expect(own).not.toContain("@media");
    expect(lines(own)).toHaveLength(darkRules().length);
  });

  it("changes nothing else, so the preview is the email the shell sends", () => {
    expect(forced.replace(FORCED, "")).toBe(html);
    expect(forced.indexOf(`id="${FORCED_DARK_STYLE_ID}"`)).toBeLessThan(forced.indexOf("</head>"));
    expect(html).not.toContain(FORCED_DARK_STYLE_ID);
  });

  it("takes only a document from the shell", () => {
    expect(() => forceDarkMode("<p>Hi</p>")).toThrow(/renderEmailShell/);
  });
});
