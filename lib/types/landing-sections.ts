export type BuiltInSectionType =
  | "hero"
  | "text_image"
  | "marquee"
  | "stories"
  | "pick_your_mpillow"
  | "neck_pains"
  | "why_choose_highlights"
  | "product_card"
  | "credibility"
  | "video_embed"
  | "founder_note"
  | "explore";

export type CustomSectionType =
  | "custom_text_image"
  | "custom_full_width_image"
  | "custom_video"
  | "custom_rich_text"
  | "featured_products"
  | "shop_cta"
  | "faq"
  | "delivery_estimator"
  | "tiktok_videos";

export type SectionType = BuiltInSectionType | CustomSectionType;

export interface LandingSection {
  id: string;
  section_type: SectionType;
  slug: string;
  position: number;
  visible: boolean;
  content: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface HeroContent {
  image?: string;
  alt?: string;
  titlePrefix?: string;
  titleEmphasis?: string;
  titleSuffix?: string;
  subtitle?: string;
  ctaCustomiseLabel?: string;
  ctaBookLabel?: string;
}

export interface TextImageContent {
  image?: string;
  alt?: string;
  title?: string;
  description?: string;
  flip?: boolean;
}

export interface MarqueeContent {
  image?: string;
}

export interface PickYourMpillowContent {
  title?: string;
  subtitle?: string;
}

export interface NeckPainsContent {
  image?: string;
  alt?: string;
  title?: string;
  description?: string;
  feelTitle?: string;
  feelSupported?: { label?: string; description?: string };
  feelFit?: { label?: string; description?: string };
  feelUpkeep?: { label?: string; description?: string };
}

export interface WhyChooseContent {
  cards?: Array<{ key?: string; label?: string; title?: string; description?: string }>;
}

export interface ProductCardContent {
  image?: string;
  title?: string;
  description?: string;
  subtitle?: string;
}

export interface CredibilityContent {
  cards?: Array<{ title?: string; description?: string }>;
}

export interface VideoEmbedContent {
  videoId?: string;
  title?: string;
  subtitle?: string;
}

export interface FounderNoteContent {
  image?: string;
  title?: string;
  subtitle?: string;
  paragraphs?: string[];
  name?: string;
  role?: string;
}

export interface ExploreContent {
  image?: string;
  alt?: string;
  title?: string;
  body?: string;
  buttonLabel?: string;
}

export interface CustomTextImageContent {
  image?: string;
  alt?: string;
  title?: string;
  description?: string;
  flip?: boolean;
}

export interface CustomFullWidthImageContent {
  image?: string;
  alt?: string;
}

export interface CustomVideoContent {
  videoId?: string;
  title?: string;
  subtitle?: string;
}

export interface CustomRichTextContent {
  body?: string;
  title?: string;
}

export interface FeaturedProductsContent {
  title?: string;
  subtitle?: string;
  limit?: number;
}

export interface ShopCtaContent {
  image?: string;
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  buttonUrl?: string;
}

export interface DeliveryEstimatorContent {
  title?: string;
  subtitle?: string;
}

export interface TikTokVideoItemContent {
  tiktokUrl?: string;
  image?: string;
  media_asset_id?: string | null;
  alt?: string;
  hook?: string;
  buttonLabel?: string;
  buttonUrl?: string;
}

export interface TikTokVideosContent {
  title?: string;
  subtitle?: string;
  direction?: "left" | "right";
  videos?: TikTokVideoItemContent[];
}

export type FaqContent = Record<string, never>;

export const CUSTOM_SECTION_TEMPLATES: Array<{
  type: CustomSectionType;
  label: string;
  description: string;
}> = [
  { type: "custom_text_image", label: "Text + Image", description: "Two-column layout with text and an image" },
  { type: "custom_full_width_image", label: "Full-Width Image", description: "A full-width image banner" },
  { type: "custom_video", label: "Video Embed", description: "YouTube video with title and subtitle" },
  {
    type: "tiktok_videos",
    label: "TikTok videos",
    description: "Scrolling band of TikTok videos; each opens in a player with its own button link",
  },
  { type: "custom_rich_text", label: "Rich Text", description: "Markdown-based content section" },
  { type: "featured_products", label: "Featured Products", description: "Grid of featured products from the shop" },
  { type: "shop_cta", label: "Shop CTA Banner", description: "Full-width banner with a call-to-action linking to the shop" },
  {
    type: "faq",
    label: "Page FAQs",
    description: "Home FAQs from Settings → FAQ → Page FAQs (home surface)",
  },
  {
    type: "delivery_estimator",
    label: "Delivery Estimator",
    description: "Shoppers enter a postal code and see live delivery rates (Settings → Shipping)",
  },
];
