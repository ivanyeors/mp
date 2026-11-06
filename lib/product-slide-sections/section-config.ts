import { PRODUCT_SLIDE_SECTION_TYPES } from "./types";
import type {
  ImageMediaConfig,
  ProductSlideSectionType,
  SectionButtonAction,
  SectionCtaConfig,
  SpecTableRow,
} from "./types";

type SectionDataAttrs = Record<`data-${string}`, string>;

type BaseSectionConfig = {
  /**
   * The section's stable name within its slide-in, e.g. `size-guide`. Staff overrides
   * (`slide_in_sections.slug`) are keyed on it, so renaming one orphans its edits —
   * treat it like a database key. Unique within one config.
   */
  key: string;
  borderTop?: boolean;
  sectionData?: SectionDataAttrs;
};

export type SplitHeroSectionConfig = BaseSectionConfig & {
  type: "split_hero";
  contentKey: string;
  flip?: boolean;
  image?: ImageMediaConfig;
  cta?: SectionCtaConfig;
  buttonAction?: { labelKey: string; action: SectionButtonAction };
  stacked?: boolean;
  stackedImages?: ImageMediaConfig[];
  /** Show the image at its own aspect ratio (a GIF or a tall chart) instead of cropping it. */
  naturalImage?: boolean;
  /** Put `listItems` behind a button labelled `listToggle`, open to start with. */
  collapsibleList?: boolean;
  titleAs?: "h1" | "h2" | "h3";
  titleClassName?: string;
  imageWrapperClassName?: string;
  gridClassName?: string;
  sectionData?: SectionDataAttrs;
  headerData?: Record<`data-${string}`, string>;
};

export type SplitHeroDualMediaSectionConfig = BaseSectionConfig & {
  type: "split_hero_dual_media";
  contentKey: string;
  heroImage: ImageMediaConfig;
  secondaryImage: ImageMediaConfig;
  scales: FirmnessScaleConfig[];
};

export type FullBleedMediaSectionConfig = BaseSectionConfig & {
  type: "full_bleed_media";
  contentKey?: string;
  image: ImageMediaConfig;
};

export type MediaIntroSectionConfig = BaseSectionConfig & {
  type: "media_intro";
  contentKey: string;
  image: ImageMediaConfig;
};

export type TrustStripSectionConfig = BaseSectionConfig & {
  type: "trust_strip";
  contentKey: string;
};

export type IconListSectionConfig = BaseSectionConfig & {
  type: "icon_list";
  contentKey: string;
};

export type FeatureCarouselSectionConfig = BaseSectionConfig & {
  type: "feature_carousel";
  contentKey: string;
  images: ImageMediaConfig[];
};

export type FeatureCardGridSectionConfig = BaseSectionConfig & {
  type: "feature_card_grid";
  contentKey: string;
  cardImages?: Array<ImageMediaConfig | undefined>;
};

export type RatingRowConfig = { starIndex: number; percent: string };

export type FirmnessScaleConfig = {
  mode: "range" | "point";
  value: number | [number, number];
  label: string;
  titleKey?: string;
  title?: string;
};

export type FirmnessCompareSectionConfig = BaseSectionConfig & {
  type: "firmness_compare";
  contentKey: string;
  scales: FirmnessScaleConfig[];
};

export type SpecTableSectionConfig = BaseSectionConfig & {
  type: "spec_table";
  contentKey: string;
  rows: SpecTableRow[];
};

export type SizeGuideSplitSectionConfig = BaseSectionConfig & {
  type: "size_guide_split";
  contentKey: string;
  flip?: boolean;
  image: ImageMediaConfig;
  imageWrapperClassName?: string;
  titleAs?: "h1" | "h2" | "h3";
  titleClassName?: string;
  gridClassName?: string;
  sectionData?: SectionDataAttrs;
  headerData?: Record<`data-${string}`, string>;
};

export type VideoSectionConfig = BaseSectionConfig & {
  type: "video_section";
  contentKey: string;
  videoId: string;
  /** `split` puts the title and description beside the video on wider screens. */
  layout?: "stacked" | "split";
};

export type PackagingBlockSectionConfig = BaseSectionConfig & {
  type: "packaging_block";
  contentKey: string;
  image?: ImageMediaConfig;
};

export type OutcomeGridSectionConfig = BaseSectionConfig & {
  type: "outcome_grid";
  contentKey: string;
};

export type TestimonialCardSectionConfig = BaseSectionConfig & {
  type: "testimonial_card";
  contentKey: string;
  image?: ImageMediaConfig;
  ratingRows: RatingRowConfig[];
};

export type TextCalloutBlockSectionConfig = BaseSectionConfig & {
  type: "text_callout_block";
  contentKey: string;
};

export type CommitmentCardsSectionConfig = BaseSectionConfig & {
  type: "commitment_cards";
  contentKey: string;
  image?: ImageMediaConfig;
};

export type HelpContactSectionConfig = BaseSectionConfig & {
  type: "help_contact";
  contentKey: string;
};

export type PurchasePanelSectionConfig = BaseSectionConfig & {
  type: "purchase_panel";
  heroImage: ImageMediaConfig;
  gallery: ImageMediaConfig[];
  price: string;
};

export type MeasurementGridSectionConfig = BaseSectionConfig & {
  type: "measurement_grid";
  contentKey: string;
  stepImages: ImageMediaConfig[];
};

export type PressQuoteSectionConfig = BaseSectionConfig & {
  type: "press_quote";
  contentKey: string;
};

export type MeasureCarouselSectionConfig = BaseSectionConfig & {
  type: "measure_carousel";
  contentKey: string;
  /** One icon per card, in card order. */
  icons: string[];
};

export type TypedQuoteSectionConfig = BaseSectionConfig & {
  type: "typed_quote";
  contentKey: string;
};

export type ProductSlideSectionConfig =
  | SplitHeroSectionConfig
  | SplitHeroDualMediaSectionConfig
  | FullBleedMediaSectionConfig
  | MediaIntroSectionConfig
  | TrustStripSectionConfig
  | IconListSectionConfig
  | FeatureCarouselSectionConfig
  | FeatureCardGridSectionConfig
  | FirmnessCompareSectionConfig
  | SpecTableSectionConfig
  | SizeGuideSplitSectionConfig
  | VideoSectionConfig
  | PackagingBlockSectionConfig
  | OutcomeGridSectionConfig
  | TestimonialCardSectionConfig
  | TextCalloutBlockSectionConfig
  | CommitmentCardsSectionConfig
  | HelpContactSectionConfig
  | PurchasePanelSectionConfig
  | MeasurementGridSectionConfig
  | PressQuoteSectionConfig
  | MeasureCarouselSectionConfig
  | TypedQuoteSectionConfig;

export function isProductSlideSectionType(value: string): value is ProductSlideSectionType {
  return (PRODUCT_SLIDE_SECTION_TYPES as readonly string[]).includes(value);
}

/** Templates with a React implementation in the renderer (grows per slice). */
export const IMPLEMENTED_SECTION_TYPES = [
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
  "press_quote",
  "measure_carousel",
  "typed_quote",
] as const satisfies readonly ProductSlideSectionType[];

export type ImplementedSectionType = (typeof IMPLEMENTED_SECTION_TYPES)[number];

export function isImplementedSectionType(type: ProductSlideSectionType): type is ImplementedSectionType {
  return (IMPLEMENTED_SECTION_TYPES as readonly string[]).includes(type);
}
