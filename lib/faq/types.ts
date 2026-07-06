import type { Locale } from "@/lib/i18n/locales";

export type FaqLocalizedText = Record<Locale, string>;

export type FaqItemContent = Record<
  Locale,
  {
    question: string;
    answer: string;
  }
>;

export type FaqCategoryRow = {
  id: string;
  key: string;
  labels: FaqLocalizedText;
  position: number;
  visible: boolean;
  created_at: string;
  updated_at: string;
};

export type FaqItemRow = {
  id: string;
  category_id: string;
  slug: string;
  content: FaqItemContent;
  position: number;
  visible: boolean;
  created_at: string;
  updated_at: string;
};

export type FaqCategory = FaqCategoryRow & {
  label: string;
};

export type FaqItem = FaqItemRow & {
  question: string;
  answer: string;
};

export type FaqCategoryWithItems = FaqCategory & {
  items: FaqItem[];
};

export type FaqDefaultCategory = {
  key: string;
  labels: FaqLocalizedText;
  items: Array<{
    slug: string;
    content: FaqItemContent;
  }>;
};
