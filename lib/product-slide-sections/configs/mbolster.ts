import type { ProductSlideSectionConfig } from "../section-config";

const MBOLSTER_GALLERY = [
  { src: "/MpillowIGPostMay2025.zip-2.webp", alt: "Customised Bolsters - Mbolster (gallery)" },
  { src: "/MpillowIGPostMay2025.zip-5.webp", alt: "Customised Bolsters - Mbolster (gallery)" },
  { src: "/Mpillow_IG_Post_May_2025.webp", alt: "Customised Bolsters - Mbolster (gallery)" },
  { src: "/IMG_5097.jpg", alt: "Customised Bolsters - Mbolster (gallery)" },
  { src: "/IMG_5110.webp", alt: "Customised Bolsters - Mbolster (gallery)" },
] as const;

export const mbolsterSlideSections = [
  {
    type: "purchase_panel",
    heroImage: { src: "/808907f4-ac2b-499a-ace6-69933883b2f5.webp", alt: "Mbolster" },
    gallery: [...MBOLSTER_GALLERY],
    price: "$135.00 SGD",
  },
  {
    type: "split_hero",
    contentKey: "mbolsterAbout",
    borderTop: true,
  },
  {
    type: "size_guide_split",
    contentKey: "mbolsterSizeGuide",
    image: {
      src: "/bolster_mbolster_size.webp",
      alt: "Mbolster size guide",
      sizes: "(max-width: 768px) 100vw, 640px",
    },
    imageWrapperClassName: "aspect-video",
    borderTop: true,
  },
  { type: "packaging_block", contentKey: "mbolsterPackage", borderTop: true },
  { type: "outcome_grid", contentKey: "sizeOutcomes", borderTop: true },
  {
    type: "testimonial_card",
    contentKey: "reviews",
    image: { src: "/IMG_5110.webp", alt: "Mbolster photo", sizes: "(max-width: 768px) 100vw, 640px" },
    ratingRows: [
      { starIndex: 0, percent: "0%" },
      { starIndex: 1, percent: "100%" },
      { starIndex: 2, percent: "0%" },
      { starIndex: 3, percent: "0%" },
      { starIndex: 4, percent: "0%" },
    ],
    borderTop: true,
  },
  {
    type: "feature_carousel",
    contentKey: "story",
    images: [
      { src: "/fillings.webp", alt: "Modular waterproof fillings" },
      { src: "/Mpillow_IG_Post_May_2025.webp", alt: "Customise your Mbolster with us" },
      { src: "/wash-care.webp", alt: "Wash care" },
    ],
    borderTop: true,
  },
  {
    type: "split_hero",
    contentKey: "mbolsterDiscover",
    stacked: true,
    stackedImages: [
      { src: "/IMG_5097.jpg", alt: "Discover the Mbolster", sizes: "(max-width: 768px) 100vw, 640px" },
      { src: "/Bolster_Fillings_gif.webp", alt: "Bolster fillings", sizes: "(max-width: 768px) 100vw, 640px" },
    ],
    borderTop: true,
  },
] as const satisfies readonly ProductSlideSectionConfig[];
