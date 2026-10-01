import type { GuideTopic } from "@/lib/seo/guides-content";

/**
 * Real customer voices on editorial pages (PRD-search-visibility slice 12).
 * Approved store reviews and Google reviews, matched to a guide's topic by
 * keywords in the review text. Rendered as quotes only — never as Review
 * JSON-LD: self-serving and third-party review markup is against Google's
 * structured-data policy.
 */

export type TopicReview = {
  quote: string;
  /** "Jun T." — never a full name. */
  name: string;
  rating: number | null;
  date: string | null;
  source: "store" | "google";
};

export type RawReview = {
  body: string | null;
  title?: string | null;
  authorName: string | null;
  rating: number | null;
  date: string | null;
  source: "store" | "google";
};

const TOPIC_KEYWORDS: Record<GuideTopic, RegExp[]> = {
  "neck-pain": [/neck/i, /shoulder/i, /\bpain/i, /\bache/i, /stiff/i, /migraine/i, /headache/i, /sore/i],
  "cervical-pillow": [/cervical/i, /neck support/i, /alignment/i, /posture/i, /spine/i, /chiropract/i, /physio/i, /neck/i],
  "custom-pillow": [/custom/i, /tailor/i, /\bfit/i, /measur/i, /adjust/i, /height/i, /personali[sz]/i, /made for me/i],
};

const MIN_RATING = 4;
const MAX_QUOTE = 280;

export function shortName(full: string | null | undefined): string {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Verified customer";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function trimQuote(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_QUOTE) return t;
  const cut = t.slice(0, MAX_QUOTE);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), MAX_QUOTE - 40)).replace(/[,;:\s]+$/, "")}…`;
}

/** Best on-topic reviews: most keyword hits, then rating, then recency. Off-topic reviews never fill in. */
export function selectTopicReviews(reviews: RawReview[], topic: GuideTopic, limit = 4): TopicReview[] {
  const keywords = TOPIC_KEYWORDS[topic];
  return reviews
    .filter((r) => (r.body?.trim().length ?? 0) >= 20 && (r.rating ?? 0) >= MIN_RATING)
    .map((r) => {
      const text = `${r.title ?? ""} ${r.body ?? ""}`;
      return { r, hits: keywords.filter((k) => k.test(text)).length };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || (b.r.rating ?? 0) - (a.r.rating ?? 0) || (b.r.date ?? "").localeCompare(a.r.date ?? ""))
    .slice(0, limit)
    .map(({ r }) => ({
      quote: trimQuote(r.body!),
      name: shortName(r.authorName),
      rating: r.rating,
      date: r.date,
      source: r.source,
    }));
}
