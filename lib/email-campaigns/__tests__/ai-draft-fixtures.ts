import type { DraftRequest } from "@/lib/email-campaigns/ai-draft-shape";
import type { DraftBrief } from "@/lib/email-campaigns/ai-draft";

/** ✨ Generate's fixtures (PRD-campaign-email-editor slice 09): a brief, and Claude's answers as JSON. */

export const COVER_ID = "0b6c1f2e-6a1d-4c55-9a77-2f0b9d3c1a10";

export const REQUEST: DraftRequest = {
  campaignId: null,
  scope: "email",
  subject: "Sleep cooler this December: FibreCool covers are back",
  name: "December cooling launch",
  about: "The FibreCool cover is back in all sizes; it keeps the pillow cool on warm nights",
  goal: "announce",
  products: [],
  existing: [],
};

export const BRIEF: DraftBrief = { request: REQUEST, products: [], pointsLive: false };

export const GOOD_BLOCKS = [
  { type: "heading", level: 1, text: "Sleep cooler this December" },
  {
    type: "text",
    paragraphs: [
      { kind: "p", runs: [{ text: "Warm nights are back, and so is the FibreCool cover, " }, { var: "first_name" }, { text: "." }] },
      { kind: "p", runs: [{ text: "It keeps the pillow cool, in all sizes.", bold: true }] },
      { kind: "bullets", items: [[{ text: "Cool on warm nights" }], [{ text: "Washable" }]] },
    ],
  },
  { type: "buttons", buttons: [{ label: "Shop the covers", target: "shop", style: "primary" }] },
];

/** Claude's answer: three subjects, two preview lines, the blocks, the notes. */
export function draftAnswer(over: { subjects?: string[]; preheaders?: string[]; blocks?: unknown[]; reviewerNotes?: string[] } = {}): string {
  return JSON.stringify({
    subjects: over.subjects ?? ["Sleep cooler this December", "FibreCool covers are back", "Cool nights, all sizes"],
    preheaders: over.preheaders ?? ["The FibreCool cover keeps your pillow cool on warm nights.", "Back in all sizes, for warm December nights."],
    blocks: over.blocks ?? GOOD_BLOCKS,
    reviewerNotes: over.reviewerNotes ?? ["Add the photo of the cover if you have one."],
  });
}
