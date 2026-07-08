import type { ProductSlideSectionConfig } from "../section-config";

export const premiumMpillowSlideSections = [
  {
    type: "split_hero_dual_media",
    contentKey: "premiumHero",
    heroImage: { src: "/m-pillow-317460-final---H-WEB.webp", alt: "Premium Mpillow hero" },
    secondaryImage: {
      src: "/m-pillow-317409-final---H-WEB.webp",
      alt: "Premium Mpillow in-store customisation",
      sizes: "(min-width: 768px) 50vw, 100vw",
    },
    scales: [
      { mode: "range", value: [40, 85], label: "40–85%", titleKey: "firmnessPremiumLabel" },
      { mode: "range", value: [25, 35], label: "25–35%", titleKey: "firmnessBasicLabel" },
    ],
  },
  { type: "trust_strip", contentKey: "trust" },
  {
    type: "split_hero",
    contentKey: "overseas",
    image: {
      src: "/m-pillow-417953-web.webp",
      alt: "Overseas customisation",
      sizes: "(min-width: 768px) 50vw, 100vw",
    },
    cta: { href: "/mp-config", labelKey: "customise", labelScope: "common", closeSheet: true },
  },
  { type: "icon_list", contentKey: "whoItsFor" },
  {
    type: "feature_carousel",
    contentKey: "features",
    images: [
      { src: "/NeckDepth.webp", alt: "Neck depth measurement" },
      { src: "/3_compartment.webp", alt: "Three compartment design" },
      { src: "/m-pillow-518057-final-V-WEB.webp", alt: "Premium Mpillow" },
      { src: "/wash-care.webp", alt: "Wash care" },
      { src: "/fillings.webp", alt: "Premium fillings" },
    ],
  },
  {
    type: "firmness_compare",
    contentKey: "firmness",
    scales: [{ mode: "range", value: [40, 85], label: "40–85%", titleKey: "title" }],
  },
  {
    type: "split_hero",
    contentKey: "accessory",
    image: {
      src: "/mpillow-cervical-neck.webp",
      alt: "Cervical neck support accessory",
      sizes: "(min-width: 768px) 50vw, 100vw",
    },
    buttonAction: { labelKey: "accessoryButton", action: "openCervical" },
  },
  {
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
    type: "measurement_grid",
    contentKey: "measurements",
    stepImages: [
      { src: "/shoulderlength_800x.webp", alt: "How to measure shoulder length" },
      { src: "/NeckDepth_800x.webp", alt: "How to measure neck depth" },
      { src: "/HeadDepth_800x.webp", alt: "How to measure head depth" },
      { src: "/necklength_800x.webp", alt: "How to measure neck length" },
    ],
  },
  {
    type: "packaging_block",
    contentKey: "premiumPackage",
    image: {
      src: "/m-pillow-417804-final-WEB.webp",
      alt: "Premium Mpillow package",
      sizes: "(min-width: 768px) 70vw, 100vw",
    },
  },
  { type: "video_section", contentKey: "customisation", videoId: "V2H03lq9IYU" },
  { type: "video_section", contentKey: "aftercare", videoId: "LxtHJL9s58E" },
  {
    type: "commitment_cards",
    contentKey: "commitment",
    image: { src: "/DSC03705.webp", alt: "Premium Mpillow commitment", sizes: "(min-width: 768px) 70vw, 100vw" },
  },
  { type: "help_contact", contentKey: "help" },
] as const satisfies readonly ProductSlideSectionConfig[];
