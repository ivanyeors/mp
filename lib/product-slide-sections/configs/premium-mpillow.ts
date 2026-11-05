import type { ProductSlideSectionConfig } from "../section-config";
import { slideImage } from "@/lib/media/slide-media";

export const premiumMpillowSlideSections = [
  {
    key: "hero",
    type: "split_hero_dual_media",
    contentKey: "premiumHero",
    heroImage: slideImage("/m-pillow-317460-final---H-WEB.webp", { alt: "Premium Mpillow hero" }),
    secondaryImage: slideImage("/m-pillow-317409-final---H-WEB.webp", {
      alt: "Premium Mpillow in-store customisation",
      sizes: "(min-width: 768px) 50vw, 100vw",
    }),
    scales: [
      { mode: "range", value: [40, 85], label: "40–85%", titleKey: "firmnessPremiumLabel" },
      { mode: "range", value: [25, 35], label: "25–35%", titleKey: "firmnessBasicLabel" },
    ],
  },
  { type: "trust_strip", key: "trust", contentKey: "trust" },
  {
    key: "overseas",
    type: "split_hero",
    contentKey: "overseas",
    image: slideImage("/m-pillow-417953-web.webp", {
      alt: "Overseas customisation",
      sizes: "(min-width: 768px) 50vw, 100vw",
    }),
    cta: { href: "/mp-config", labelKey: "customise", labelScope: "common", closeSheet: true },
  },
  { type: "icon_list", key: "who-its-for", contentKey: "whoItsFor" },
  {
    key: "features",
    type: "feature_carousel",
    contentKey: "features",
    images: [
      slideImage("/NeckDepth.webp", { alt: "Neck depth measurement" }),
      slideImage("/3_compartment.webp", { alt: "Three compartment design" }),
      slideImage("/m-pillow-518057-final-V-WEB.webp", { alt: "Premium Mpillow" }),
      slideImage("/wash-care.webp", { alt: "Wash care" }),
      slideImage("/fillings.webp", { alt: "Premium fillings" }),
    ],
  },
  {
    key: "firmness",
    type: "firmness_compare",
    contentKey: "firmness",
    scales: [{ mode: "range", value: [40, 85], label: "40–85%", titleKey: "title" }],
  },
  {
    key: "accessory",
    type: "split_hero",
    contentKey: "accessory",
    image: slideImage("/mpillow-cervical-neck.webp", {
      alt: "Cervical neck support accessory",
      sizes: "(min-width: 768px) 50vw, 100vw",
    }),
    buttonAction: { labelKey: "accessoryButton", action: "openCervical" },
  },
  {
    key: "pricing",
    type: "spec_table",
    contentKey: "pricing",
    rows: [
      ["XS", "$340–$360"],
      ["S", "$400–$430"],
      ["M", "$430–$460"],
      ["L", "$580–$610"],
      ["XL", "$680"],
    ],
  },
  {
    key: "measurements",
    type: "measurement_grid",
    contentKey: "measurements",
    stepImages: [
      slideImage("/shoulderlength_800x.webp", { alt: "How to measure shoulder length" }),
      slideImage("/NeckDepth_800x.webp", { alt: "How to measure neck depth" }),
      slideImage("/HeadDepth_800x.webp", { alt: "How to measure head depth" }),
      slideImage("/necklength_800x.webp", { alt: "How to measure neck length" }),
    ],
  },
  {
    key: "package",
    type: "packaging_block",
    contentKey: "premiumPackage",
    image: slideImage("/m-pillow-417804-final-WEB.webp", {
      alt: "Premium Mpillow package",
      sizes: "(min-width: 768px) 70vw, 100vw",
    }),
  },
  { type: "video_section", key: "customisation-video", contentKey: "customisation", videoId: "V2H03lq9IYU" },
  { type: "video_section", key: "aftercare-video", contentKey: "aftercare", videoId: "LxtHJL9s58E" },
  {
    key: "commitment",
    type: "commitment_cards",
    contentKey: "commitment",
    image: slideImage("/DSC03705.webp", {
      alt: "Premium Mpillow commitment",
      sizes: "(min-width: 768px) 70vw, 100vw",
    }),
  },
  { type: "help_contact", key: "help", contentKey: "help" },
] satisfies readonly ProductSlideSectionConfig[];
