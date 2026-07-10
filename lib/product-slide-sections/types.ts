/** Serializable media props — live in section config, not i18n. */
export type ImageMediaConfig = {
  src: string;
  alt: string;
  /** Media Asset id when resolved via slide migrate (slice 17). */
  assetId?: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
};

export type SectionCtaConfig = {
  href: string;
  label?: string;
  /** Resolved from messages when label is omitted. */
  labelKey?: string;
  /** Resolve label from common messages instead of product messages. */
  labelScope?: "common";
  /** Wrap CTA link in SheetClose (overseas flow). */
  closeSheet?: boolean;
};

export type SectionButtonAction = "openCervical";

export type SizeTableContent = {
  sizeHeader: string;
  shoulderHeader: string;
  rows: Array<{ size: string; shoulder: string }>;
};

export type SplitHeroContent = {
  eyebrow?: string;
  title: string;
  paragraphs?: string[];
  listTitle?: string;
  listItems?: string[];
  table?: SizeTableContent;
  /** Stacked layout: paragraphs[0], image[0], paragraphs[1..], image[1..] */
  stackedParagraphs?: string[];
};

export type SplitHeroDualMediaContent = {
  subtitle: string;
  paragraphs: string[];
};

export type FullBleedMediaContent = {
  title?: string;
  description?: string;
};

export type MediaIntroContent = {
  eyebrow?: string;
  title: string;
  description: string;
};

export type TrustStripItem = { label: string; icon?: string };
export type TrustStripContent = { items: TrustStripItem[] };

export type IconListContent = {
  title: string;
  intro?: string;
  items: string[];
  conclusion?: string;
};

export type FeatureCarouselContent = {
  title?: string;
  intro?: string;
  features: Array<{ title: string; description: string }>;
};

export type FeatureCardGridContent = {
  title: string;
  cards: Array<{ title: string; description: string }>;
};

export type FirmnessScaleContent = {
  mode: "range" | "point";
  value: number | [number, number];
  title: string;
  label: string;
};

export type FirmnessCompareContent = {
  title: string;
  description?: string;
  scales: FirmnessScaleContent[];
};

export type SpecTableContent = {
  title: string;
  headers: [string, string];
  footnotes?: string[];
};

export type SpecTableRow = [string, string];

export type SizeGuideSplitContent = SplitHeroContent;

export type VideoSectionContent = {
  title: string;
  description?: string;
};

export type PackagingBlockContent = {
  title: string;
  items: string[];
  note?: string;
  callout?: { title: string; description: string; note?: string };
};

export type OutcomeGridContent = {
  title?: string;
  outcomes: Array<{ title: string; description: string }>;
};

export type TestimonialCardContent = {
  quote: string;
  attribution: string;
  ratingBreakdown?: Array<{ label: string; value: string }>;
};

export type TextCalloutBlockContent = {
  title?: string;
  paragraphs: string[];
  calloutTitle?: string;
  calloutItems: string[];
};

export type CommitmentCardsContent = {
  title: string;
  cards: Array<{ title: string; description: string }>;
};

export type HelpContactContent = {
  title: string;
  description: string;
};

/** v1 template IDs — renderer implements incrementally per slice. */
export const PRODUCT_SLIDE_SECTION_TYPES = [
  "split_hero",
  "split_hero_dual_media",
  "full_bleed_media",
  "media_intro",
  "trust_strip",
  "icon_list",
  "feature_carousel",
  "feature_card_grid",
  "firmness_compare",
  "spec_table",
  "size_guide_split",
  "video_section",
  "packaging_block",
  "outcome_grid",
  "testimonial_card",
  "text_callout_block",
  "commitment_cards",
  "help_contact",
  "purchase_panel",
  "measurement_grid",
] as const;

export type ProductSlideSectionType = (typeof PRODUCT_SLIDE_SECTION_TYPES)[number];

export type SectionContentByType = {
  split_hero: SplitHeroContent;
  split_hero_dual_media: SplitHeroDualMediaContent;
  full_bleed_media: FullBleedMediaContent;
  media_intro: MediaIntroContent;
  trust_strip: TrustStripContent;
  icon_list: IconListContent;
  feature_carousel: FeatureCarouselContent;
  feature_card_grid: FeatureCardGridContent;
  firmness_compare: FirmnessCompareContent;
  spec_table: SpecTableContent;
  size_guide_split: SizeGuideSplitContent;
  video_section: VideoSectionContent;
  packaging_block: PackagingBlockContent;
  outcome_grid: OutcomeGridContent;
  testimonial_card: TestimonialCardContent;
  text_callout_block: TextCalloutBlockContent;
  commitment_cards: CommitmentCardsContent;
  help_contact: HelpContactContent;
  purchase_panel: Record<string, never>;
  measurement_grid: Record<string, never>;
};
