import type { FaqItemContent, FaqLocalizedText } from "@/lib/faq/types";

export type { FaqItemContent, FaqLocalizedText };

export const FIXED_FAQ_SURFACES = ["home", "mp-config", "mbolster-config"] as const;
export type FixedFaqSurface = (typeof FIXED_FAQ_SURFACES)[number];

export type FaqSurfaceKey = FixedFaqSurface | `product:${string}`;

export type FaqPageSetRow = {
  id: string;
  surface_key: string;
  titles: FaqLocalizedText;
  visible: boolean;
  created_at: string;
  updated_at: string;
};

export type FaqPageItemRow = {
  id: string;
  set_id: string;
  slug: string;
  content: FaqItemContent;
  position: number;
  visible: boolean;
  created_at: string;
  updated_at: string;
};

export type FaqPageItem = FaqPageItemRow & {
  question: string;
  answer: string;
};

export type FaqPageSet = FaqPageSetRow & {
  title: string;
  items: FaqPageItem[];
};

export type PageFaqDefaultSet = {
  surfaceKey?: FixedFaqSurface;
  productSlug?: string;
  titles: FaqLocalizedText;
  items: Array<{
    slug: string;
    content: FaqItemContent;
  }>;
};
