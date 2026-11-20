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
  about: 500,
  products: 3,
  subjects: 3,
  preheaders: 2,
  existing: 20_000,
} as const;

export const DRAFT_ABOUT_PLACEHOLDER = "e.g. The FibreCool cover is back in all sizes; it keeps the pillow cool on warm nights";
