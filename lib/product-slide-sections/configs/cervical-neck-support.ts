import type { ProductSlideSectionConfig } from "../section-config";
import { slideImage } from "@/lib/media/slide-media";

export const cervicalNeckSupportSlideSections = [
  {
    key: "hero",
    type: "media_intro",
    contentKey: "hero",
    image: slideImage("/bev-back-sleep.png", {
      alt: "Back sleeping posture with cervical neck support",
      sizes: "100vw",
    }),
  },
  { type: "split_hero", key: "tech-neck", contentKey: "techNeck", titleAs: "h2" },
  {
    key: "why",
    type: "split_hero",
    contentKey: "why",
    image: slideImage("/cns-pouch.png", {
      alt: "Cervical neck support pouch",
      sizes: "(min-width: 768px) 50vw, 100vw",
    }),
  },
  {
    key: "comparison",
    type: "full_bleed_media",
    image: slideImage("/round-flat-head-comp.png", {
      alt: "Round head vs flat head comparison",
      className: "object-contain bg-white",
      sizes: "100vw",
    }),
  },
  {
    key: "benefits",
    type: "feature_card_grid",
    contentKey: "benefits",
    cardImages: [
      undefined,
      slideImage("/cns-insert.png", { alt: "Cervical neck support insert" }),
      slideImage("/cns-contact-point.png", { alt: "Contact point support diagram" }),
    ],
  },
  { type: "text_callout_block", key: "difference", contentKey: "difference" },
] satisfies readonly ProductSlideSectionConfig[];
