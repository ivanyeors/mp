import type {
  CommitmentCardsContent,
  FeatureCardGridContent,
  FeatureCarouselContent,
  FirmnessCompareContent,
  HelpContactContent,
  IconListContent,
  MeasureCarouselContent,
  MediaIntroContent,
  OutcomeGridContent,
  PackagingBlockContent,
  PressQuoteContent,
  ProductSlideSectionType,
  SectionContentByType,
  SpecTableContent,
  SplitHeroContent,
  SplitHeroDualMediaContent,
  TestimonialCardContent,
  TextCalloutBlockContent,
  TrustStripContent,
  TypedQuoteContent,
  VideoSectionContent,
} from "./types";

type MessagesSlice = Record<string, unknown>;

type SplitHeroExtractor = (messages: MessagesSlice) => SplitHeroContent;

const SPLIT_HERO_EXTRACTORS: Record<string, SplitHeroExtractor> = {
  hero(messages) {
    return {
      title: requireString(messages, "heroTitle"),
      paragraphs: requireStringArray(messages, "heroParagraphs"),
      listTitle: optionalString(messages, "packagingTitle"),
      listItems: optionalStringArray(messages, "packagingItems"),
    };
  },
  overseas(messages) {
    return {
      title: requireString(messages, "overseasTitle"),
      paragraphs: [requireString(messages, "overseasDescription")],
    };
  },
  accessory(messages) {
    return {
      title: requireString(messages, "accessoryTitle"),
      eyebrow: optionalString(messages, "accessorySubtitle"),
      paragraphs: [requireString(messages, "accessoryDescription")],
    };
  },
  why(messages) {
    return {
      title: requireString(messages, "whyTitle"),
      paragraphs: [requireString(messages, "whyDescription")],
    };
  },
  techNeck(messages) {
    return {
      title: requireString(messages, "techNeckTitle"),
      paragraphs: requireStringArray(messages, "techNeckParagraphs"),
    };
  },
  mbolsterAbout(messages) {
    return {
      eyebrow: optionalString(messages, "viewDetailsLabel"),
      title: requireString(messages, "aboutTitle"),
      paragraphs: requireStringArray(messages, "aboutParagraphs"),
    };
  },
  mbolsterDiscover(messages) {
    return {
      title: requireString(messages, "discoverTitle"),
      stackedParagraphs: requireStringArray(messages, "discoverParagraphs"),
    };
  },
  mbolsterSizeGuide(messages) {
    return {
      title: requireString(messages, "sizeGuideTitle"),
      paragraphs: [requireString(messages, "sizeGuideDescription")],
      listItems: requireStringArray(messages, "sizeGuideItems"),
    };
  },
  sizeGuide(messages) {
    return {
      title: requireString(messages, "sizeTitle"),
      paragraphs: [requireString(messages, "sizeDescription")],
      table: requireTable(messages, "sizeTable"),
    };
  },
  // Size Matters
  sizeMattersIntro(messages) {
    return {
      title: requireString(messages, "sectionSizeMattersTitle"),
      paragraphs: [requireString(messages, "sectionSizeMattersDescription")],
    };
  },
  headShapes(messages) {
    return {
      title: requireString(messages, "headShapesTitle"),
      paragraphs: [requireString(messages, "headShapesDescription")],
    };
  },
  whyUnique(messages) {
    return {
      title: requireString(messages, "whyUniqueTitle"),
      paragraphs: [requireString(messages, "whyUniqueDescription")],
    };
  },
  sleepPosition(messages) {
    return {
      title: requireString(messages, "sleepPositionTitle"),
      paragraphs: requireStringArray(messages, "sleepPositionParagraphs"),
    };
  },
  configurations(messages) {
    return {
      title: requireString(messages, "configurationsTitle"),
      paragraphs: requireStringArray(messages, "configurationsParagraphs"),
    };
  },
  // Ambassadors
  ambassadorsHero(messages) {
    return {
      eyebrow: optionalString(messages, "heroLabel"),
      title: requireString(messages, "title"),
      paragraphs: [requireString(messages, "heroDescription")],
    };
  },
  allBuilds(messages) {
    return {
      title: requireString(messages, "allBuildsTitle"),
      paragraphs: requireStringArray(messages, "allBuildsParagraphs"),
    };
  },
  ambassadorsAwards(messages) {
    return {
      title: requireString(messages, "ambassadorsTitle"),
      listTitle: optionalString(messages, "awardsIntro"),
      listToggle: optionalString(messages, "awardsButton"),
      listItems: requireStringArray(messages, "awards"),
    };
  },
};

function requireString(messages: MessagesSlice, key: string): string {
  const value = messages[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`resolve-slide-content: missing string "${key}"`);
  }
  return value;
}

function optionalString(messages: MessagesSlice, key: string): string | undefined {
  const value = messages[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requireStringArray(messages: MessagesSlice, key: string): string[] {
  const value = messages[key];
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "string")) {
    throw new Error(`resolve-slide-content: missing string[] "${key}"`);
  }
  return value;
}

function optionalStringArray(messages: MessagesSlice, key: string): string[] | undefined {
  const value = messages[key];
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "string")) {
    return undefined;
  }
  return value;
}

function requireTable(messages: MessagesSlice, key: string): SplitHeroContent["table"] {
  const value = messages[key];
  if (!value || typeof value !== "object") {
    throw new Error(`resolve-slide-content: missing table "${key}"`);
  }
  const table = value as Record<string, unknown>;
  const rows = table.rows;
  if (
    typeof table.sizeHeader !== "string" ||
    typeof table.shoulderHeader !== "string" ||
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    throw new Error(`resolve-slide-content: invalid table "${key}"`);
  }
  return {
    sizeHeader: table.sizeHeader,
    shoulderHeader: table.shoulderHeader,
    rows: rows as Array<{ size: string; shoulder: string }>,
  };
}

function resolveSplitHeroDualMedia(messages: MessagesSlice, contentKey: string): SplitHeroDualMediaContent {
  if (contentKey !== "premiumHero") {
    throw new Error(`resolve-slide-content: no split_hero_dual_media extractor for "${contentKey}"`);
  }
  return {
    subtitle: requireString(messages, "heroSubtitle"),
    paragraphs: requireStringArray(messages, "heroParagraphs"),
  };
}

function resolveTrustStrip(messages: MessagesSlice, contentKey: string): TrustStripContent {
  if (contentKey !== "trust") {
    throw new Error(`resolve-slide-content: no trust_strip extractor for "${contentKey}"`);
  }
  const items = messages.trustStrip;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`resolve-slide-content: missing trustStrip array`);
  }
  return { items: items as Array<{ label: string }> };
}

function resolveIconList(messages: MessagesSlice, contentKey: string): IconListContent {
  if (contentKey !== "whoItsFor") {
    throw new Error(`resolve-slide-content: no icon_list extractor for "${contentKey}"`);
  }
  return {
    title: requireString(messages, "whoItsForTitle"),
    intro: optionalString(messages, "whoItsForIntro"),
    items: requireStringArray(messages, "whoItsForItems"),
    conclusion: optionalString(messages, "whoItsForConclusion"),
  };
}

function resolveFirmnessCompare(messages: MessagesSlice, contentKey: string): FirmnessCompareContent {
  if (contentKey !== "firmness") {
    throw new Error(`resolve-slide-content: no firmness_compare extractor for "${contentKey}"`);
  }
  return {
    title: requireString(messages, "firmnessTitle"),
    description: optionalString(messages, "firmnessDescription"),
    scales: [],
  };
}

function resolveFeatureCarousel(messages: MessagesSlice, contentKey: string): FeatureCarouselContent {
  if (contentKey === "features") {
    const features = messages.features;
    if (!Array.isArray(features) || features.length === 0) {
      throw new Error(`resolve-slide-content: missing features array`);
    }
    return {
      title: optionalString(messages, "featuresTitle"),
      intro: optionalString(messages, "featuresIntro"),
      features: features as Array<{ title: string; description: string }>,
    };
  }

  if (contentKey === "story") {
    return {
      features: [
        {
          title: requireString(messages, "modularTitle"),
          description: requireString(messages, "modularDescription"),
        },
        {
          title: requireString(messages, "customiseTitle"),
          description: requireString(messages, "customiseDescription"),
        },
        {
          title: requireString(messages, "fillingsSectionTitle"),
          description: requireString(messages, "fillingsSectionDescription"),
        },
      ],
    };
  }

  throw new Error(`resolve-slide-content: no feature_carousel extractor for "${contentKey}"`);
}

function resolveSpecTable(messages: MessagesSlice, contentKey: string): SpecTableContent {
  if (contentKey !== "pricing") {
    throw new Error(`resolve-slide-content: no spec_table extractor for "${contentKey}"`);
  }
  const table = messages.pricingTable as Record<string, string>;
  return {
    title: requireString(messages, "pricingTitle"),
    headers: [table.sizeHeader, table.priceHeader],
    footnotes: optionalStringArray(messages, "pricingNotes"),
  };
}

function resolveVideoSection(messages: MessagesSlice, contentKey: string): VideoSectionContent {
  if (contentKey === "sizingChart") {
    return {
      title: requireString(messages, "sizingChartTitle"),
      description: optionalString(messages, "sizingChartDescription"),
    };
  }
  if (contentKey === "customisation") {
    return { title: requireString(messages, "videoTitle") };
  }
  if (contentKey === "aftercare") {
    return {
      title: requireString(messages, "aftercareTitle"),
      description: optionalString(messages, "aftercareDescription"),
    };
  }
  if (contentKey === "ambassadorsVideo") {
    return {
      title: requireString(messages, "videoTitle"),
      description: optionalString(messages, "videoDescription"),
    };
  }
  throw new Error(`resolve-slide-content: no video_section extractor for "${contentKey}"`);
}

function resolvePackagingBlock(messages: MessagesSlice, contentKey: string): PackagingBlockContent {
  if (contentKey === "premiumPackage") {
    return {
      title: requireString(messages, "packageTitle"),
      items: requireStringArray(messages, "packageItems"),
    };
  }
  if (contentKey === "mbolsterPackage") {
    return {
      title: requireString(messages, "packagingTitle"),
      items: requireStringArray(messages, "packagingItems"),
      callout: {
        title: requireString(messages, "fillingsTitle"),
        description: requireString(messages, "fillingsDescription"),
        note: requireString(messages, "packagingNote"),
      },
    };
  }
  throw new Error(`resolve-slide-content: no packaging_block extractor for "${contentKey}"`);
}

function resolveCommitmentCards(messages: MessagesSlice, contentKey: string): CommitmentCardsContent {
  if (contentKey !== "commitment") {
    throw new Error(`resolve-slide-content: no commitment_cards extractor for "${contentKey}"`);
  }
  return {
    title: requireString(messages, "commitmentTitle"),
    cards: [
      {
        title: requireString(messages, "commitmentReadjustmentTitle"),
        description: requireString(messages, "commitmentReadjustmentDescription"),
      },
      {
        title: requireString(messages, "commitmentWarrantyTitle"),
        description: requireString(messages, "commitmentWarrantyDescription"),
      },
    ],
  };
}

function resolveHelpContact(messages: MessagesSlice, contentKey: string): HelpContactContent {
  if (contentKey !== "help") {
    throw new Error(`resolve-slide-content: no help_contact extractor for "${contentKey}"`);
  }
  return {
    title: requireString(messages, "helpTitle"),
    description: requireString(messages, "helpDescription"),
  };
}

function resolveMediaIntro(messages: MessagesSlice, contentKey: string): MediaIntroContent {
  if (contentKey !== "hero") {
    throw new Error(`resolve-slide-content: no media_intro extractor for "${contentKey}"`);
  }
  return {
    eyebrow: optionalString(messages, "heroEyebrow"),
    title: requireString(messages, "heroTitle"),
    description: optionalString(messages, "heroDescription") ?? "",
  };
}

function resolveFeatureCardGrid(messages: MessagesSlice, contentKey: string): FeatureCardGridContent {
  if (contentKey !== "benefits") {
    throw new Error(`resolve-slide-content: no feature_card_grid extractor for "${contentKey}"`);
  }
  const benefits = messages.benefits;
  if (!Array.isArray(benefits) || benefits.length === 0) {
    throw new Error(`resolve-slide-content: missing benefits array`);
  }
  return {
    title: requireString(messages, "benefitsTitle"),
    cards: benefits as Array<{ title: string; description: string }>,
  };
}

function resolveTextCalloutBlock(messages: MessagesSlice, contentKey: string): TextCalloutBlockContent {
  if (contentKey !== "difference") {
    throw new Error(`resolve-slide-content: no text_callout_block extractor for "${contentKey}"`);
  }
  return {
    title: requireString(messages, "differenceTitle"),
    paragraphs: requireStringArray(messages, "differenceParagraphs"),
    calloutTitle: requireString(messages, "additionalBenefitsTitle"),
    calloutItems: requireStringArray(messages, "additionalBenefits"),
  };
}

function resolveOutcomeGrid(messages: MessagesSlice, contentKey: string): OutcomeGridContent {
  if (contentKey !== "sizeOutcomes") {
    throw new Error(`resolve-slide-content: no outcome_grid extractor for "${contentKey}"`);
  }
  const items = requireStringArray(messages, "sizeGuideItems");
  return {
    outcomes: items.map((item) => {
      const [title, ...rest] = item.split(":");
      return { title: title?.trim() ?? item, description: rest.join(":").trim() || item };
    }),
  };
}

function resolveTestimonialCard(messages: MessagesSlice, contentKey: string): TestimonialCardContent {
  if (contentKey !== "reviews") {
    throw new Error(`resolve-slide-content: no testimonial_card extractor for "${contentKey}"`);
  }
  return {
    quote: requireString(messages, "reviewText"),
    attribution: requireString(messages, "reviewAttribution"),
  };
}

function resolvePressQuote(messages: MessagesSlice, contentKey: string): PressQuoteContent {
  if (contentKey !== "pressQuote") {
    throw new Error(`resolve-slide-content: no press_quote extractor for "${contentKey}"`);
  }
  const quote = messages.pressQuote;
  if (!quote || typeof quote !== "object") {
    throw new Error(`resolve-slide-content: missing pressQuote`);
  }
  const record = quote as MessagesSlice;
  return {
    text: requireString(record, "text"),
    attribution: optionalString(record, "attribution"),
  };
}

function resolveMeasureCarousel(messages: MessagesSlice, contentKey: string): MeasureCarouselContent {
  if (contentKey !== "measurements") {
    throw new Error(`resolve-slide-content: no measure_carousel extractor for "${contentKey}"`);
  }
  const cards = messages.measurementCards;
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error(`resolve-slide-content: missing measurementCards array`);
  }
  return {
    title: requireString(messages, "measurementsTitle"),
    intro: optionalString(messages, "measurementsIntro"),
    cards: (cards as Array<Record<string, unknown>>).map((card) => ({
      title: String(card.title ?? ""),
      description: String(card.description ?? ""),
    })),
  };
}

function resolveTypedQuote(messages: MessagesSlice, contentKey: string): TypedQuoteContent {
  if (contentKey !== "testimonial") {
    throw new Error(`resolve-slide-content: no typed_quote extractor for "${contentKey}"`);
  }
  return {
    title: requireString(messages, "testimonialTitle"),
    quote: requireString(messages, "testimonialQuote"),
    attribution: optionalString(messages, "testimonialAttribution"),
  };
}

export function resolveSlideContent<T extends ProductSlideSectionType>(
  messages: MessagesSlice,
  sectionType: T,
  contentKey: string,
): SectionContentByType[T] {
  if (sectionType === "split_hero" || sectionType === "size_guide_split") {
    const extractor = SPLIT_HERO_EXTRACTORS[contentKey];
    if (!extractor) {
      throw new Error(
        `resolve-slide-content: no ${sectionType} extractor for contentKey "${contentKey}"`,
      );
    }
    return extractor(messages) as SectionContentByType[T];
  }

  if (sectionType === "split_hero_dual_media") {
    return resolveSplitHeroDualMedia(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "trust_strip") {
    return resolveTrustStrip(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "icon_list") {
    return resolveIconList(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "firmness_compare") {
    return resolveFirmnessCompare(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "feature_carousel") {
    return resolveFeatureCarousel(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "spec_table") {
    return resolveSpecTable(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "video_section") {
    return resolveVideoSection(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "packaging_block") {
    return resolvePackagingBlock(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "commitment_cards") {
    return resolveCommitmentCards(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "help_contact") {
    return resolveHelpContact(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "media_intro") {
    return resolveMediaIntro(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "feature_card_grid") {
    return resolveFeatureCardGrid(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "text_callout_block") {
    return resolveTextCalloutBlock(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "outcome_grid") {
    return resolveOutcomeGrid(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "testimonial_card") {
    return resolveTestimonialCard(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "press_quote") {
    return resolvePressQuote(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "measure_carousel") {
    return resolveMeasureCarousel(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "typed_quote") {
    return resolveTypedQuote(messages, contentKey) as SectionContentByType[T];
  }
  if (sectionType === "full_bleed_media" || sectionType === "measurement_grid" || sectionType === "purchase_panel") {
    return {} as SectionContentByType[T];
  }

  throw new Error(`resolve-slide-content: section type "${sectionType}" not implemented yet`);
}

export function resolveMeasurementSteps(
  messages: MessagesSlice,
): Array<{ title: string; description: string }> {
  const steps = messages.measurementSteps;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("resolve-slide-content: missing measurementSteps array");
  }
  return steps as Array<{ title: string; description: string }>;
}

export function resolveTestimonialHeader(messages: MessagesSlice): { title: string; intro: string } {
  return {
    title: requireString(messages, "reviewsTitle"),
    intro: requireString(messages, "reviewsBasedOn"),
  };
}

export function resolveReviewTitle(messages: MessagesSlice): string {
  return requireString(messages, "reviewTitle");
}

export function resolveMeasurementHeader(messages: MessagesSlice): { title: string; intro: string } {
  return {
    title: requireString(messages, "measurementsTitle"),
    intro: requireString(messages, "measurementsIntro"),
  };
}

export function resolveRatingBreakdownLabel(messages: MessagesSlice): string {
  return requireString(messages, "ratingBreakdown");
}
