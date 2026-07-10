import type { ProductSlideSectionConfig } from "../section-config";
import { slideImage } from "@/lib/media/slide-media";

export const cervicalNeckSupportSlideSections = [
  {
    type: "media_intro",
    contentKey: "hero",
    image: slideImage("/bev-back-sleep.png", {
      alt: "Back sleeping posture with cervical neck support",
      sizes: "100vw",
    }),
  },
  {
    type: "split_hero",
    contentKey: "why",
    image: slideImage("/cns-pouch.png", {
      alt: "Cervical neck support pouch",
      sizes: "(min-width: 768px) 50vw, 100vw",
    }),
  },
  {
    type: "full_bleed_media",
    image: slideImage("/round-flat-head-comp.png", {
      alt: "Round head vs flat head comparison",
      className: "object-contain bg-white",
      sizes: "100vw",
    }),
  },
  {
    type: "feature_card_grid",
    contentKey: "benefits",
    cardImages: [
      undefined,
      slideImage("/cns-insert.png", { alt: "Cervical neck support insert" }),
      slideImage("/cns-contact-point.png", { alt: "Contact point support diagram" }),
    ],
  },
  { type: "text_callout_block", contentKey: "difference" },
] satisfies readonly ProductSlideSectionConfig[];
