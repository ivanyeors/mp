import type { ProductSlideSectionConfig } from "../section-config";

export const basicMpillowSlideSections = [
  {
    type: "split_hero",
    contentKey: "hero",
    image: {
      src: "/m-pillow-518001-final-WEB.webp",
      alt: "Basic Mpillow",
      sizes: "(min-width: 768px) 50vw, 100vw",
    },
    cta: { href: "/mp-basic", labelKey: "bottomCustomise" },
  },
  {
    type: "firmness_compare",
    contentKey: "firmness",
    scales: [
      { mode: "range", value: [25, 35], label: "25–35%", titleKey: "firmnessBasicLabel" },
      { mode: "range", value: [40, 85], label: "40–85%", titleKey: "firmnessPremiumLabel" },
    ],
  },
  {
    type: "feature_carousel",
    contentKey: "features",
    images: [
      { src: "/basic-mpillow.webp", alt: "Basic Mpillow ergonomic support" },
      { src: "/Square_3waysleep.webp", alt: "Patented M design" },
      { src: "/001.webp", alt: "Modular components" },
      { src: "/wash-care.webp", alt: "Wash care" },
    ],
  },
  {
    type: "size_guide_split",
    contentKey: "sizeGuide",
    flip: true,
    titleAs: "h3",
    titleClassName: "text-lg font-semibold tracking-tight md:text-xl",
    gridClassName: "gap-3 md:items-start",
    imageWrapperClassName: "aspect-[600/619] border-0 bg-muted/20",
    sectionData: { "data-section": "size-does-matter" },
    headerData: { "data-section-header": "size-does-matter" },
    image: {
      src: "/sizecomparison.webp",
      alt: "Why sizing matters",
      sizes: "(min-width: 768px) 50vw, 100vw",
      className: "object-contain",
    },
  },
  {
    type: "video_section",
    contentKey: "sizingChart",
    videoId: "r9XfezALQhA",
  },
] as const satisfies readonly ProductSlideSectionConfig[];
