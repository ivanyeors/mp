/**
 * ✨ Generate's brief (PRD-campaign-email-editor slice 09): what Staff may tell
 * Claude in the popover, all of it optional. Pure and tiny: the popover loads
 * it after the page, and the route's schema (ai-draft-shape.ts) holds the
 * same limits.
 */

/** What the email is for, in ✨ Generate's brief. Optional; it steers the shape, never the facts. */
export const DRAFT_GOALS = ["announce", "promotion", "bring_back", "care_tips", "event"] as const;
export type DraftGoal = (typeof DRAFT_GOALS)[number];

export const DRAFT_GOAL_LABEL: Record<DraftGoal, string> = {
  announce: "Announce",
  promotion: "Promotion",
  bring_back: "Bring them back",
  care_tips: "Care tips",
  event: "Event",
};

export const DRAFT_LIMITS = {
  /** *What's it about?* */
  about: 500,
  products: 3,
  subjects: 3,
  preheaders: 2,
  /** The email's words sent along for context (Add below, one text block), in characters. */
  existing: 20_000,
} as const;

export const DRAFT_ABOUT_PLACEHOLDER = "e.g. The FibreCool cover is back in all sizes; it keeps the pillow cool on warm nights";
