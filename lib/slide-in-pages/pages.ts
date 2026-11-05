import type { Messages } from "@/lib/i18n/messages/types";
import type { ProductSlideSectionConfig } from "@/lib/product-slide-sections/section-config";
import { ambassadorsSlideSections } from "@/lib/product-slide-sections/configs/ambassadors";
import { basicMpillowSlideSections } from "@/lib/product-slide-sections/configs/basic-mpillow";
import { cervicalNeckSupportSlideSections } from "@/lib/product-slide-sections/configs/cervical-neck-support";
import { mbolsterSlideSections } from "@/lib/product-slide-sections/configs/mbolster";
import { premiumMpillowSlideSections } from "@/lib/product-slide-sections/configs/premium-mpillow";
import { sizeMattersSlideSections } from "@/lib/product-slide-sections/configs/size-matters";

/**
 * The landing page's sub pages — every **Learn-more slide-in** the Page Builder edits
 * (CONTEXT.md — **Slide-in section**). Order here is the page picker's order: the
 * landing page's own top-to-bottom order of the sections that open them.
 */
export const SLIDE_IN_PAGE_KEYS = [
  "size-matters",
  "ambassadors",
  "basic-mpillow",
  "premium-mpillow",
  "cervical-neck-support",
  "mbolster",
] as const;

export type SlideInPageKey = (typeof SLIDE_IN_PAGE_KEYS)[number];

type SlideMessagesKey = keyof Messages["slides"];

export interface SlideInPageDef {
  key: SlideInPageKey;
  /** Name in the page picker. */
  label: string;
  /** Where shoppers open it, so Staff know which sheet they are editing. */
  openedFrom: string;
  /** `m.slides.<messagesKey>` holds its copy. */
  messagesKey: SlideMessagesKey;
  /** A second slide namespace some templates read titles from (Premium's firmness bars). */
  auxMessagesKey?: SlideMessagesKey;
  /** Templates that need `m.common` (CTA labels, the Mbolster purchase panel). */
  usesCommonMessages?: boolean;
  /** The sheet body's own spacing, so Preview mode lays sections out as the sheet does. */
  bodyClassName: string;
  sections: readonly ProductSlideSectionConfig[];
}

export const SLIDE_IN_PAGES: Record<SlideInPageKey, SlideInPageDef> = {
  "size-matters": {
    key: "size-matters",
    label: "Size Matters",
    openedFrom: "Size Matters section → Learn more",
    messagesKey: "sizeMatters",
    bodyClassName: "pb-20",
    sections: sizeMattersSlideSections,
  },
  ambassadors: {
    key: "ambassadors",
    label: "Ambassadors",
    openedFrom: "Ambassadors section → Learn how",
    messagesKey: "ambassadors",
    bodyClassName: "pb-20",
    sections: ambassadorsSlideSections,
  },
  "basic-mpillow": {
    key: "basic-mpillow",
    label: "Basic Mpillow",
    openedFrom: "Pick your Mpillow → Basic → Learn more",
    messagesKey: "basicMpillow",
    bodyClassName: "space-y-10 pb-20",
    sections: basicMpillowSlideSections,
  },
  "premium-mpillow": {
    key: "premium-mpillow",
    label: "Premium Mpillow",
    openedFrom: "Pick your Mpillow → Premium → Learn more",
    messagesKey: "premiumMpillow",
    auxMessagesKey: "basicMpillow",
    usesCommonMessages: true,
    bodyClassName: "space-y-10 pb-20",
    sections: premiumMpillowSlideSections,
  },
  "cervical-neck-support": {
    key: "cervical-neck-support",
    label: "Cervical Neck Support",
    openedFrom: "Neck pains section and Premium Mpillow → Learn more",
    messagesKey: "cervicalNeckSupport",
    bodyClassName: "space-y-10 pb-20",
    sections: cervicalNeckSupportSlideSections,
  },
  mbolster: {
    key: "mbolster",
    label: "Mbolster",
    openedFrom: "Mbolster section → Learn more",
    messagesKey: "mbolster",
    usesCommonMessages: true,
    bodyClassName: "pb-20",
    sections: mbolsterSlideSections,
  },
};

export function isSlideInPageKey(value: string): value is SlideInPageKey {
  return (SLIDE_IN_PAGE_KEYS as readonly string[]).includes(value);
}

/** The page's own i18n namespace, as the renderer reads it. */
export function slideMessages(m: Messages, page: SlideInPageKey): Record<string, unknown> {
  return m.slides[SLIDE_IN_PAGES[page].messagesKey] as unknown as Record<string, unknown>;
}

export function slideAuxMessages(m: Messages, page: SlideInPageKey): Record<string, unknown> | undefined {
  const key = SLIDE_IN_PAGES[page].auxMessagesKey;
  return key ? (m.slides[key] as unknown as Record<string, unknown>) : undefined;
}
