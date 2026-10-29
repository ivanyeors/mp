/**
 * What Claude may write in a campaign, checked in code as well as asked for
 * in the prompt (PRD-campaign-email-editor *AI guardrails*, slice 09), as
 * `checkReplyText` checks a review reply. Pure. Slice 10 checks its subject
 * and preview line ideas and its rewrites here, and slice 17 its translations.
 *
 * A draft may say only what the facts (lib/ai/mpillow-facts.ts) and the
 * staff member's own words say. So a price, a percentage, an offer, a code, a
 * date, a number, a guarantee or a deadline counts only when it appears word
 * for word in what Staff typed (or in the facts). Some things are never
 * Claude's to write, whatever the brief says: a link or an address, a health
 * claim, a request for a review, and Shopify.
 */
import { MPILLOW_ABOUT, MPILLOW_FACTS } from "@/lib/ai/mpillow-facts";
import { checkBannedClinical, checkBannedClinicalZh } from "@/lib/i18n/copy-bands";
import type { RewritableBlock } from "./ai-refine-brief";
import { blockLinks, blockVariables } from "./ai-refine-shape";
import { contentWords, paragraphRuns, type EmailBlock, type Run } from "./content";
import { isVariableKey } from "./variables";

export interface GuardrailContext {
  /** Everything Staff typed for this draft: the subject, the campaign name, the brief, the picked products' names, the email's own words. */
  staffText: string;
  /** Points are live: the email may mention them (`pointsCheck`'s rule). */
  pointsLive: boolean;
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** What a draft may repeat: Staff's words and the facts. */
const allowedText = (ctx: GuardrailContext) => squash([ctx.staffText, MPILLOW_ABOUT, ...MPILLOW_FACTS].join("\n"));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `words` appear in `allowed` whole: "10" is in "a 10-year warranty", "1" is not. */
function typedIn(allowed: string, words: string): boolean {
  const w = squash(words);
  const start = /^[\p{L}\p{N}]/u.test(w) ? "(?<![\\p{L}\\p{N}])" : "";
  const end = /[\p{L}\p{N}]$/u.test(w) ? "(?![\\p{L}\\p{N}])" : "";
  return new RegExp(start + escape(w) + end, "u").test(allowed);
}

interface Check {
  pattern: RegExp;
  /** Allowed when Staff typed the same words (or the facts say them). */
  unlessTyped: boolean;
  why: (match: string) => string;
}

const healthClaim = (m: string) => `makes a health claim ("${m}"): write about comfort, fit and sleep`;

const MONTHS = "january|february|march|april|june|july|august|september|october|november|december";
const DAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";

// Kinds of words a draft may use only when Staff did: what a translation may use only when its English does (slice 17).
const OFFER_WORDS =
  /\b(?:discount(?:s|ed)?|on sale|sale|vouchers?|coupons?|promo(?:tion)?s?|promo codes?|cashback|rebates?|deals?|free (?:shipping|delivery|gifts?)|half off|buy one)\b/gi;
const URGENT_WORDS =
  /\b(?:hurry|last chance|final (?:hours|days|call)|ends? (?:soon|tonight|today|tomorrow|this week)|today only|limited[- ]time|act (?:now|fast)|don'?t miss(?: out)?|while stocks? lasts?|selling (?:fast|out)|almost gone|running out|before it'?s gone|expir(?:es|ing)|only \w+ left)\b/gi;
const MOVE_WORDS = /\b(?:our|the) (?:move|migration|switch)\b|\bmigrat(?:e|ed|ing|ion)\b|\bnew (?:website|site|platform|online store)\b|\bwe(?:'ve| have)? moved\b/gi;

const CHECKS: Check[] = [
  {
    pattern: /https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|sg|net|org|co|io|my)\b/gi,
    unlessTyped: false,
    why: (m) => `has a web address ("${m}"): links are Staff's to add`,
  },
  { pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g, unlessTyped: false, why: (m) => `has an email address ("${m}")` },
  {
    pattern: /(?:S\$|SGD|US\$|\$|€|£)\s?\d+(?:[.,]\d+)*|\b\d+(?:[.,]\d+)*\s?(?:dollars|SGD)\b/gi,
    unlessTyped: true,
    why: (m) => `names a price ("${m}") nobody typed: prices come from a products block`,
  },
  { pattern: /\b\d+(?:\.\d+)?\s?(?:%|per ?cent\b)/gi, unlessTyped: true, why: (m) => `has a percentage ("${m}") nobody typed` },
  { pattern: OFFER_WORDS, unlessTyped: true, why: (m) => `offers "${m}", which nobody typed` },
  { pattern: /\b[A-Z]{2,}\d+[A-Z\d]*\b|\b\d+[A-Z]{3,}\b/g, unlessTyped: true, why: (m) => `has a code ("${m}") nobody typed` },
  { pattern: /\b\d+(?:[.,:/-]\d+)*\b/g, unlessTyped: true, why: (m) => `has a number ("${m}") nobody gave` },
  { pattern: new RegExp(`\\b(?:${MONTHS}|${DAYS})\\b`, "gi"), unlessTyped: true, why: (m) => `names a date ("${m}") nobody gave` },
  {
    pattern: /\bguarantee(?:s|d)?\b|\brisk[- ]free\b|\bmoney[- ]back\b|\bno[- ]risk\b/gi,
    unlessTyped: true,
    why: (m) => `promises "${m}", which nobody typed`,
  },
  { pattern: URGENT_WORDS, unlessTyped: true, why: (m) => `rushes the reader ("${m}"), which the brief didn't` },
  {
    // Beside `checkBannedClinical`'s verbs: comfort, fit and sleep, never health.
    pattern:
      /\b(?:reliev(?:e|es|ed|ing)|relief|pains?|aches?|therap(?:y|ies|eutic|ist)|clinical(?:ly)?|doctor[- ]recommended|medical(?:ly)?|heal(?:s|ed|ing)?|treat(?:s|ed|ing|ment|ments)?|cur(?:e|es|ed|ing)|rehab(?:ilitation)?|prescri\w*)\b/gi,
    unlessTyped: false,
    why: healthClaim,
  },
  {
    pattern: /\b(?:leave|write|post|give|drop|share)\b(?:\s+[\w']+){0,3}?\s+(?:reviews?|ratings?|stars?)\b|\brate us\b|\breview us\b|\b(?:google|5[- ]star|five[- ]star) reviews?\b/gi,
    unlessTyped: false,
    why: () => "asks for a review or a rating, which a campaign never does",
  },
  { pattern: /\bshopify\b/gi, unlessTyped: false, why: () => "names Shopify" },
  { pattern: MOVE_WORDS, unlessTyped: true, why: (m) => `mentions a move ("${m}")` },
  { pattern: /\{(?!first_name\})[^{}]*\}/g, unlessTyped: false, why: (m) => `uses ${m}: only {first_name} is Claude's to place` },
];

/** At most this many reasons per piece of words: enough to fix, short enough to read. */
const MAX_REASONS = 3;

/** Pure — what is wrong with some words Claude wrote, as reasons; none when they pass. */
export function wordsProblems(text: string, ctx: GuardrailContext): string[] {
  const allowed = allowedText(ctx);
  const out = new Set<string>();
  // The landing page's check first; the list below adds the words it doesn't hold.
  const clinical = checkBannedClinical("The words", text);
  if (clinical) out.add(healthClaim(/"([^"]+)"/.exec(clinical)?.[1] ?? clinical));
  for (const check of CHECKS) {
    for (const m of text.matchAll(check.pattern)) {
      if (check.unlessTyped && typedIn(allowed, m[0])) continue;
      out.add(check.why(m[0]));
    }
  }
  if (/\bpoints?\b/i.test(text)) {
    if (!ctx.pointsLive) out.add("mentions points, and points aren't live");
    else if (!/\bpoints?\b/i.test(ctx.staffText)) out.add("mentions points, which the brief didn't");
  }
  return [...out].slice(0, MAX_REASONS);
}

/** Pure — a subject line's problems: the words', and how it is written (no `Re:`, no capitals). */
export function subjectProblems(subject: string, ctx: GuardrailContext): string[] {
  const out = wordsProblems(subject, ctx);
  if (/^\s*(?:re|fwd?|fw)\s*:/i.test(subject)) out.push('starts like a reply or a forward ("Re:", "Fwd:")');
  const letters = subject.replace(/\{[^{}]*\}/g, "").replace(/[^\p{L}]/gu, "");
  if (letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) out.push("is in capitals");
  return out.slice(0, MAX_REASONS);
}

/** Pure — one block's problems: every word a customer reads in it, its button labels included. */
export function blockProblems(block: EmailBlock, ctx: GuardrailContext): string[] {
  return wordsProblems(contentWords({ v: 1, blocks: [block], fallbacks: {} }).join("\n"), ctx);
}

/** Pure — a preview line's problems (slice 10): the words', and repeating the subject it follows. */
export function previewLineProblems(line: string, subject: string, ctx: GuardrailContext): string[] {
  const out = wordsProblems(line, ctx);
  // Whole words only, punctuation aside: "Sleep cooler" is in "Sleep cooler, tonight", "hi" is not in "this".
  const words = (t: string) => ` ${squash(t.replace(/[^\p{L}\p{N}{}_]+/gu, " "))} `;
  if (words(subject).trim() && words(line).includes(words(subject))) out.push("repeats the subject instead of following it");
  return out.slice(0, MAX_REASONS);
}

/** A run's words, or a space for a Variable or for the original's own link words (Staff's: `mpillow.com/shop`). */
function rewriteText(block: RewritableBlock, linkWords: ReadonlySet<string>): string {
  if (block.type === "heading") return block.text.replace(/\{([a-z_]+)\}/g, (m, k: string) => (isVariableKey(k) ? " " : m));
  const line = (runs: readonly Run[]) => runs.map((r) => ("var" in r ? " " : r.href && linkWords.has(squash(r.text)) ? " " : r.text)).join("");
  return block.paragraphs.map((p) => (p.kind === "p" ? line(p.runs) : p.items.map(line).join("\n"))).join("\n");
}

/** The words each address in a text block links, as they read: what a reason names it by. */
function linkWordsOf(block: RewritableBlock): Map<string, string> {
  const out = new Map<string, string>();
  if (block.type === "text") for (const r of paragraphRuns(block.paragraphs)) if ("href" in r && r.href && !out.has(r.href)) out.set(r.href, r.text.trim());
  return out;
}

/**
 * Pure — what is wrong with Claude's rewrite of `original` (slice 10): it
 * keeps every link and every Variable of the original and adds none, and its
 * words pass the checks any words Claude writes pass. The original's own
 * link words are Staff's, so they may stay as they were.
 */
export function rewriteProblems(original: RewritableBlock, rewrite: RewritableBlock, ctx: GuardrailContext): string[] {
  const out: string[] = [];
  const before = linkWordsOf(original);
  const after = new Set(blockLinks(rewrite));
  for (const [href, words] of before) if (!after.has(href)) out.push(`drops the link on "${words}"`);
  if ([...after].some((href) => !before.has(href))) out.push("adds a link, which is Staff's to add");
  const varsBefore = blockVariables(original);
  const varsAfter = blockVariables(rewrite);
  for (const k of varsBefore) if (!varsAfter.includes(k)) out.push(`drops the Variable {${k}}`);
  for (const k of varsAfter) if (!varsBefore.includes(k)) out.push(`adds the Variable {${k}}, which the original doesn't have`);
  out.push(...wordsProblems(rewriteText(rewrite, new Set([...before.values()].map(squash))), ctx));
  return out.slice(0, MAX_REASONS);
}

// ---------------------------------------------------------------------------
// A translation (slice 17)
// ---------------------------------------------------------------------------

/**
 * What a 中文 translation may not say that its English does not, in Chinese:
 * each kind is refused unless the English has its kind too (`english`). A
 * health claim or a request for a review is refused whatever the English says.
 */
const CHINESE_CHECKS: { pattern: RegExp; english?: RegExp; why: (match: string) => string }[] = [
  { pattern: /疼痛|止痛|医疗|理疗|疗愈/g, why: healthClaim },
  {
    pattern: /折扣|打折|折价|优惠|促销|特价|特惠|减价|降价|免运费|免邮|包邮|免费送货|赠品|优惠券|代金券|优惠码|折扣码|返现|买一送一|[一二三四五六七八九两\d]折/g,
    // An English offer is its words, a percentage or a code.
    english: new RegExp(`${OFFER_WORDS.source}|\\b\\d+(?:\\.\\d+)?\\s?(?:%|per ?cent\\b)|\\b(?:promo )?codes?\\b`, "gi"),
    why: (m) => `offers "${m}", which the English doesn't`,
  },
  { pattern: /最后机会|限时|赶快|抓紧|售完即止|仅剩|不要错过|别错过|倒计时|即将结束|马上抢/g, english: URGENT_WORDS, why: (m) => `rushes the reader ("${m}"), which the English doesn't` },
  {
    pattern: /(?:留下|写下?|给|发表|分享|帮我们|请)[^。！？\n]{0,6}?(?:评价|评论|评分|好评|五星|星级)|给我们(?:打分|评分)|五星好评/g,
    why: () => "asks for a review or a rating, which a campaign never does",
  },
  { pattern: /新网站|新网店|新平台|迁移|搬迁|我们搬/g, english: MOVE_WORDS, why: (m) => `mentions a move ("${m}"), which the English doesn't` },
  { pattern: /积分/g, english: /\bpoints?\b/gi, why: () => "mentions points, which the English doesn't" },
];

/**
 * Pure — what is wrong with some 中文 words Claude translated from `english`
 * (slice 17), as reasons; none when they pass. The Chinese health words
 * (`checkBannedClinicalZh`, beside the landing page's list) and the kinds
 * above, then every check any words Claude writes pass, with the English as
 * what was typed: a number, a price or a code counts only when the English
 * has it, so a translation adds no price or offer. The Variables are checked
 * apart (`translationProblems`): here they read as spaces.
 */
export function chineseWordsProblems(text: string, english: string): string[] {
  const words = text.replace(/\{([a-z_]+)\}/g, (m, k: string) => (isVariableKey(k) ? " " : m));
  const out = new Set<string>();
  const clinical = checkBannedClinicalZh("The words", words);
  if (clinical) out.add(healthClaim(/"([^"]+)"/.exec(clinical)?.[1] ?? clinical));
  for (const check of CHINESE_CHECKS) {
    if (check.english && english.search(check.english) !== -1) continue;
    for (const m of words.matchAll(check.pattern)) out.add(check.why(m[0]));
  }
  for (const reason of wordsProblems(words, { staffText: english, pointsLive: true })) out.add(reason);
  return [...out].slice(0, MAX_REASONS);
}
