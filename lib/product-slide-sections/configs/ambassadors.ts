import type { ProductSlideSectionConfig } from "../section-config";
import { slideImage } from "@/lib/media/slide-media";

const SPLIT_TITLE = "text-base font-semibold tracking-normal md:text-base";

export const ambassadorsSlideSections = [
  {
    key: "hero",
    type: "split_hero",
    contentKey: "ambassadorsHero",
    titleAs: "h2",
    titleClassName: "text-lg font-semibold leading-tight md:text-xl",
    imageWrapperClassName: "border-0 bg-muted/20",
    image: slideImage("/images/landing/ambassadors-1.jpg", {
      alt: "Mpillow ambassadors posture and fit",
      sizes: "(min-width: 768px) 50vw, 100vw",
    }),
  },
  {
    key: "all-builds",
    type: "split_hero",
    contentKey: "allBuilds",
    titleAs: "h2",
    titleClassName: SPLIT_TITLE,
    imageWrapperClassName: "border-0 bg-muted/20",
    image: slideImage("/images/landing/ambassadors-2.png", {
      alt: "Mpillow suited to different builds",
      sizes: "(min-width: 768px) 50vw, 100vw",
    }),
  },
  {
    key: "ambassadors",
    type: "split_hero",
    contentKey: "ambassadorsAwards",
    titleAs: "h2",
    titleClassName: SPLIT_TITLE,
    collapsibleList: true,
    imageWrapperClassName: "border-0 bg-muted/20",
    image: slideImage("/images/landing/ambassadors-3.png", {
      alt: "Skyjin and Piggie with customised Mpillows",
      sizes: "(min-width: 768px) 50vw, 100vw",
    }),
  },
  { key: "testimonial", type: "typed_quote", contentKey: "testimonial" },
  {
    key: "video",
    type: "video_section",
    contentKey: "ambassadorsVideo",
    videoId: "z2u69YPvHi4",
    layout: "split",
  },
] satisfies readonly ProductSlideSectionConfig[];
