import type { ProductSlideSectionConfig } from "@/lib/product-slide-sections/section-config";
import type { ImageMediaConfig, ProductSlideSectionType } from "@/lib/product-slide-sections/types";

/**
 * What Staff may edit on each **Slide-in section**, by template type.
 *
 * Copy field keys are the keys of the template's resolved content (`SplitHeroContent`
 * and friends), so an override merges straight over what the renderer would show. A
 * field that is not listed here is not editable and an override for it is ignored —
 * that is what keeps a stray key from reaching a template.
 *
 * Deliberately not editable: prices (the Premium price table and the Mbolster price are
 * sell prices, and Costings is their one source), the size/shoulder-length chart (fit
 * data, not copy), firmness percentages, and measurement icons (designed artwork).
 */

export type SubField = { key: string; label: string; multiline?: boolean };

export type CopyField =
  | { kind: "text"; key: string; label: string; multiline?: boolean; always?: boolean }
  /** An ordered list of strings — paragraphs or bullets. Staff may add and remove. */
  | { kind: "list"; key: string; label: string; itemLabel: string }
  /**
   * An ordered list of records. `fixedCount` when each card is paired by position with
   * media the config owns (a carousel image, a step photo): adding a card would leave it
   * without one, so the count stays the template's.
   */
  | { kind: "cards"; key: string; label: string; itemLabel: string; fields: SubField[]; fixedCount?: boolean }
  /** One nested record, e.g. a callout's title, description and note. */
  | { kind: "group"; key: string; label: string; fields: SubField[] };

const title = (label = "Title"): CopyField => ({ kind: "text", key: "title", label, always: true });
const description = (label = "Description"): CopyField => ({
  kind: "text",
  key: "description",
  label,
  multiline: true,
});
const TITLE_DESCRIPTION: SubField[] = [
  { key: "title", label: "Title" },
  { key: "description", label: "Description", multiline: true },
];

/** The sheet's own header: its title and the line under it. */
export const HEADER_SECTION_TYPE = "header";
export const HEADER_FIELDS: CopyField[] = [
  title("Sheet title"),
  { kind: "text", key: "description", label: "Line under the title", multiline: true, always: true },
];

const SPLIT_FIELDS: CopyField[] = [
  { kind: "text", key: "eyebrow", label: "Label above the title" },
  title(),
  { kind: "list", key: "paragraphs", label: "Paragraphs", itemLabel: "Paragraph" },
  { kind: "list", key: "stackedParagraphs", label: "Paragraphs", itemLabel: "Paragraph" },
  { kind: "text", key: "listTitle", label: "List heading" },
  { kind: "text", key: "listToggle", label: "List button label" },
  { kind: "list", key: "listItems", label: "List items", itemLabel: "Item" },
];

export const COPY_FIELDS: Record<ProductSlideSectionType, CopyField[]> = {
  split_hero: SPLIT_FIELDS,
  size_guide_split: SPLIT_FIELDS,
  split_hero_dual_media: [
    { kind: "text", key: "subtitle", label: "Heading", always: true },
    { kind: "list", key: "paragraphs", label: "Paragraphs", itemLabel: "Paragraph" },
  ],
  full_bleed_media: [{ kind: "text", key: "title", label: "Title" }, description()],
  media_intro: [
    { kind: "text", key: "eyebrow", label: "Label above the title" },
    title(),
    description(),
  ],
  trust_strip: [
    { kind: "cards", key: "items", label: "Trust points", itemLabel: "Point", fields: [{ key: "label", label: "Text" }] },
  ],
  icon_list: [
    title(),
    { kind: "text", key: "intro", label: "Intro", multiline: true },
    { kind: "list", key: "items", label: "Points", itemLabel: "Point" },
    { kind: "text", key: "conclusion", label: "Closing line", multiline: true },
  ],
  feature_carousel: [
    { kind: "text", key: "title", label: "Title" },
    { kind: "text", key: "intro", label: "Intro", multiline: true },
    { kind: "cards", key: "features", label: "Cards", itemLabel: "Card", fields: TITLE_DESCRIPTION, fixedCount: true },
  ],
  feature_card_grid: [
    title(),
    { kind: "cards", key: "cards", label: "Cards", itemLabel: "Card", fields: TITLE_DESCRIPTION, fixedCount: true },
  ],
  firmness_compare: [title(), description()],
  spec_table: [
    title(),
    { kind: "list", key: "footnotes", label: "Notes under the table", itemLabel: "Note" },
  ],
  video_section: [title(), description()],
  packaging_block: [
    title(),
    { kind: "list", key: "items", label: "Items", itemLabel: "Item" },
    { kind: "text", key: "note", label: "Note", multiline: true },
    { kind: "group", key: "callout", label: "Callout", fields: [...TITLE_DESCRIPTION, { key: "note", label: "Note" }] },
  ],
  outcome_grid: [
    { kind: "text", key: "title", label: "Title" },
    { kind: "cards", key: "outcomes", label: "Tiles", itemLabel: "Tile", fields: TITLE_DESCRIPTION },
  ],
  testimonial_card: [
    { kind: "text", key: "headerTitle", label: "Section title", always: true },
    { kind: "text", key: "headerIntro", label: "Section intro" },
    { kind: "text", key: "reviewTitle", label: "Review title" },
    { kind: "text", key: "quote", label: "Quote", multiline: true, always: true },
    { kind: "text", key: "attribution", label: "Attribution" },
  ],
  text_callout_block: [
    { kind: "text", key: "title", label: "Title" },
    { kind: "list", key: "paragraphs", label: "Paragraphs", itemLabel: "Paragraph" },
    { kind: "text", key: "calloutTitle", label: "Callout heading" },
    { kind: "list", key: "calloutItems", label: "Callout points", itemLabel: "Point" },
  ],
  commitment_cards: [
    title(),
    { kind: "cards", key: "cards", label: "Cards", itemLabel: "Card", fields: TITLE_DESCRIPTION },
  ],
  help_contact: [title(), description()],
  purchase_panel: [
    { kind: "text", key: "heroLabel", label: "Label above the title" },
    { kind: "text", key: "heroTitle", label: "Title", always: true },
    { kind: "text", key: "heroDescription", label: "Description", multiline: true },
    { kind: "text", key: "purchaseNote", label: "Note under the buttons", multiline: true },
  ],
  measurement_grid: [
    title(),
    { kind: "text", key: "intro", label: "Intro", multiline: true },
    { kind: "cards", key: "steps", label: "Steps", itemLabel: "Step", fields: TITLE_DESCRIPTION, fixedCount: true },
  ],
  press_quote: [
    { kind: "text", key: "text", label: "Quote", multiline: true, always: true },
    { kind: "text", key: "attribution", label: "Attribution" },
  ],
  measure_carousel: [
    title(),
    { kind: "text", key: "intro", label: "Intro", multiline: true },
    { kind: "cards", key: "cards", label: "Cards", itemLabel: "Card", fields: TITLE_DESCRIPTION, fixedCount: true },
  ],
  typed_quote: [
    title(),
    { kind: "text", key: "quote", label: "Quote", multiline: true, always: true },
    { kind: "text", key: "attribution", label: "Attribution" },
  ],
};

export function copyFieldsFor(sectionType: string): CopyField[] {
  if (sectionType === HEADER_SECTION_TYPE) return HEADER_FIELDS;
  return COPY_FIELDS[sectionType as ProductSlideSectionType] ?? [];
}

/** True when a default value exists, so the field is part of this section's layout. */
function hasDefault(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && typeof value === "object";
}

/**
 * The copy fields that apply to one section: the template's fields, less any its default
 * content does not use. A text-only split has no list to edit; a split with a stacked
 * layout edits `stackedParagraphs` rather than `paragraphs`.
 */
export function visibleCopyFields(sectionType: string, defaults: Record<string, unknown>): CopyField[] {
  return copyFieldsFor(sectionType).filter(
    (field) => (field.kind === "text" && field.always) || hasDefault(defaults[field.key]),
  );
}

// --- Media --------------------------------------------------------------------

export type SingleImageKey = "image" | "heroImage" | "secondaryImage";
export type ImageListKey = "images" | "stackedImages" | "cardImages" | "stepImages" | "gallery";

export type MediaField =
  | { kind: "image"; key: SingleImageKey; label: string; fallback: ImageMediaConfig }
  | {
      kind: "images";
      key: ImageListKey;
      label: string;
      itemLabel: string;
      /** One slot per position; `undefined` where the template shows no image. */
      fallbacks: Array<ImageMediaConfig | undefined>;
    }
  | { kind: "video"; key: "videoId"; label: string; fallback: string };

const SINGLE_IMAGE_LABELS: Record<SingleImageKey, string> = {
  image: "Image",
  heroImage: "Main image",
  secondaryImage: "Second image",
};

const IMAGE_LIST_LABELS: Record<ImageListKey, { label: string; itemLabel: string }> = {
  images: { label: "Card images", itemLabel: "Card" },
  stackedImages: { label: "Images", itemLabel: "Image" },
  cardImages: { label: "Card images", itemLabel: "Card" },
  stepImages: { label: "Step photos", itemLabel: "Step" },
  gallery: { label: "Gallery", itemLabel: "Photo" },
};

/** The media a section's config carries, and so the media Staff may replace. */
export function mediaFieldsFor(section: ProductSlideSectionConfig): MediaField[] {
  const fields: MediaField[] = [];
  const record = section as unknown as Record<string, unknown>;

  for (const key of ["image", "heroImage", "secondaryImage"] as const) {
    const value = record[key] as ImageMediaConfig | undefined;
    if (value && typeof value.src === "string") {
      fields.push({ kind: "image", key, label: SINGLE_IMAGE_LABELS[key], fallback: value });
    }
  }

  for (const key of ["images", "stackedImages", "cardImages", "stepImages", "gallery"] as const) {
    const value = record[key] as Array<ImageMediaConfig | undefined> | undefined;
    if (Array.isArray(value) && value.length > 0) {
      fields.push({ kind: "images", key, ...IMAGE_LIST_LABELS[key], fallbacks: value });
    }
  }

  if (section.type === "video_section") {
    fields.push({ kind: "video", key: "videoId", label: "YouTube video", fallback: section.videoId });
  }

  return fields;
}

/** The type badge in the builder's section list. */
export const SLIDE_IN_TYPE_LABELS: Record<string, string> = {
  header: "Sheet header",
  split_hero: "Text and image",
  size_guide_split: "Size guide",
  split_hero_dual_media: "Hero",
  full_bleed_media: "Wide image",
  media_intro: "Image intro",
  trust_strip: "Trust strip",
  icon_list: "List",
  feature_carousel: "Carousel",
  feature_card_grid: "Cards",
  firmness_compare: "Firmness",
  spec_table: "Price table",
  video_section: "Video",
  packaging_block: "Packaging",
  outcome_grid: "Tiles",
  testimonial_card: "Review",
  text_callout_block: "Text and callout",
  commitment_cards: "Commitments",
  help_contact: "Help",
  purchase_panel: "Purchase panel",
  measurement_grid: "Measuring steps",
  press_quote: "Quote",
  measure_carousel: "Measurements",
  typed_quote: "Testimonial",
};

/** What a section shows that Staff cannot change here, said once in its editor. */
export const FIXED_CONTENT_NOTES: Partial<Record<string, string>> = {
  size_guide_split: "The size chart is fit data, so it isn't edited here.",
  spec_table: "Prices aren't edited in the Page Builder.",
  purchase_panel: "The price and the size and case options aren't edited in the Page Builder.",
  firmness_compare: "The firmness bars and their percentages aren't edited here.",
  split_hero_dual_media: "The firmness bars and their percentages aren't edited here.",
  measure_carousel: "The measurement icons are designed artwork, so they aren't edited here.",
};
