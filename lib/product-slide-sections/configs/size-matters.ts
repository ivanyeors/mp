import type { ProductSlideSectionConfig } from "../section-config";

const SPLIT_TITLE = "text-base font-semibold leading-tight tracking-normal md:text-base";

export const sizeMattersSlideSections = [
  { key: "press-quote", type: "press_quote", contentKey: "pressQuote" },
  {
    key: "size-matters",
    type: "split_hero",
    contentKey: "sizeMattersIntro",
    titleAs: "h2",
    titleClassName: "text-lg font-semibold leading-tight tracking-normal md:text-lg",
    naturalImage: true,
    image: { src: "/sizecomparison.webp", alt: "Mpillow sizing and fit" },
  },
  {
    key: "measurements",
    type: "measure_carousel",
    contentKey: "measurements",
    icons: ["/shoulder-length.svg", "/neck-length.svg", "/neck-to-back.svg", "/head-to-back.svg"],
  },
  {
    key: "head-shapes",
    type: "split_hero",
    contentKey: "headShapes",
    titleAs: "h2",
    titleClassName: SPLIT_TITLE,
    naturalImage: true,
    image: { src: "/Head-Shapes-GIF.gif", alt: "Head shapes and support examples" },
  },
  {
    key: "why-unique",
    type: "split_hero",
    contentKey: "whyUnique",
    titleAs: "h2",
    titleClassName: SPLIT_TITLE,
    imageWrapperClassName: "border-0 bg-muted/20",
    image: {
      src: "/five-sizes.webp",
      alt: "Five Mpillow size options",
      sizes: "(min-width: 768px) 50vw, 100vw",
    },
  },
  {
    key: "sleep-position",
    type: "split_hero",
    contentKey: "sleepPosition",
    titleAs: "h2",
    titleClassName: SPLIT_TITLE,
    imageWrapperClassName: "border-0 bg-muted/20",
    image: {
      src: "/stitch-inner-component.webp",
      alt: "Mpillow inner component stitching",
      sizes: "(min-width: 768px) 50vw, 100vw",
    },
  },
  {
    key: "configurations",
    type: "split_hero",
    contentKey: "configurations",
    titleAs: "h2",
    titleClassName: SPLIT_TITLE,
    imageWrapperClassName: "border-0 bg-muted/20",
    image: {
      src: "/diff-body-back-sleep.webp",
      alt: "Different body types and back sleeping support",
      sizes: "(min-width: 768px) 50vw, 100vw",
    },
  },
] satisfies readonly ProductSlideSectionConfig[];
