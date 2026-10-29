/**
 * What Claude may write in a campaign, checked in code as well as asked for
 * in the prompt (PRD-campaign-email-editor *AI guardrails*, slice 09), as
 * `checkReplyText` checks a review reply. Pure. Slices 10 and 17 check their
 * subject ideas, rewrites and translations here too.
 *
 * A draft may say only what the facts (lib/ai/mpillow-facts.ts) and the
 * staff member's own words say. So a price, a percentage, an offer, a code, a
 * date, a number, a guarantee or a deadline counts only when it appears word
 * for word in what Staff typed (or in the facts). Some things are never
 * Claude's to write, whatever the brief says: a link or an address, a health
 * claim, a request for a review, and Shopify.
 */
import { MPILLOW_ABOUT, MPILLOW_FACTS } from "@/lib/ai/mpillow-facts";
import { checkBannedClinical } from "@/lib/i18n/copy-bands";
import { contentWords, type EmailBlock } from "./content";

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
  {
    pattern:
      /\b(?:discount(?:s|ed)?|on sale|sale|vouchers?|coupons?|promo(?:tion)?s?|promo codes?|cashback|rebates?|deals?|free (?:shipping|delivery|gifts?)|half off|buy one)\b/gi,
    unlessTyped: true,
    why: (m) => `offers "${m}", which nobody typed`,
  },
  { pattern: /\b[A-Z]{2,}\d+[A-Z\d]*\b|\b\d+[A-Z]{3,}\b/g, unlessTyped: true, why: (m) => `has a code ("${m}") nobody typed` },
  { pattern: /\b\d+(?:[.,:/-]\d+)*\b/g, unlessTyped: true, why: (m) => `has a number ("${m}") nobody gave` },
  { pattern: new RegExp(`\\b(?:${MONTHS}|${DAYS})\\b`, "gi"), unlessTyped: true, why: (m) => `names a date ("${m}") nobody gave` },
  {
    pattern: /\bguarantee(?:s|d)?\b|\brisk[- ]free\b|\bmoney[- ]back\b|\bno[- ]risk\b/gi,
    unlessTyped: true,
    why: (m) => `promises "${m}", which nobody typed`,
  },
  {
    pattern:
      /\b(?:hurry|last chance|final (?:hours|days|call)|ends? (?:soon|tonight|today|tomorrow|this week)|today only|limited[- ]time|act (?:now|fast)|don'?t miss(?: out)?|while stocks? lasts?|selling (?:fast|out)|almost gone|running out|before it'?s gone|expir(?:es|ing)|only \w+ left)\b/gi,
    unlessTyped: true,
    why: (m) => `rushes the reader ("${m}"), which the brief didn't`,
  },
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
  {
    pattern: /\b(?:our|the) (?:move|migration|switch)\b|\bmigrat(?:e|ed|ing|ion)\b|\bnew (?:website|site|platform|online store)\b|\bwe(?:'ve| have)? moved\b/gi,
    unlessTyped: true,
    why: (m) => `mentions a move ("${m}")`,
  },
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
