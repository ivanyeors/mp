"use client";

import * as React from "react";

import { useServiceCopy } from "@/hooks/use-service-copy";
import { interpolateServiceCopyDeep } from "@/lib/pricing/service-copy";

import { openCervicalNeckSupportSheet } from "@/components/slide-in-pages/cervical-neck-support";
import { buildFeatureCarouselItems } from "@/lib/product-slide-sections/feature-carousel-items";
import {
  isImplementedSectionType,
  isProductSlideSectionType,
  type FirmnessScaleConfig,
  type ProductSlideSectionConfig,
} from "@/lib/product-slide-sections/section-config";
import { resolveRatingBreakdownLabel } from "@/lib/product-slide-sections/resolve-slide-content";
import type {
  CommitmentCardsContent,
  FeatureCardGridContent,
  FeatureCarouselContent,
  FirmnessCompareContent,
  FullBleedMediaContent,
  HelpContactContent,
  IconListContent,
  MeasureCarouselContent,
  MediaIntroContent,
  OutcomeGridContent,
  PackagingBlockContent,
  PressQuoteContent,
  SectionCtaConfig,
  SpecTableContent,
  SplitHeroContent,
  SplitHeroDualMediaContent,
  TestimonialCardContent,
  TextCalloutBlockContent,
  TrustStripContent,
  TypedQuoteContent,
  VideoSectionContent,
} from "@/lib/product-slide-sections/types";
import { applyCopyOverride, resolveSectionDefaults } from "@/lib/slide-in-pages/content";

import { CommitmentCardsSection } from "./commitment-cards-section";
import { FeatureCarouselSection } from "./feature-carousel-section";
import { FeatureCardGridSection } from "./feature-card-grid-section";
import { FirmnessCompareSection } from "./firmness-compare-section";
import { FullBleedMediaSection } from "./full-bleed-media-section";
import { HelpContactSection } from "./help-contact-section";
import { IconListSection } from "./icon-list-section";
import { MeasureCarouselSection } from "./measure-carousel-section";
import { MeasurementGridSection } from "./measurement-grid-section";
import { MediaIntroSection } from "./media-intro-section";
import { OutcomeGridSection } from "./outcome-grid-section";
import { PackagingBlockSection } from "./packaging-block-section";
import { PressQuoteSection } from "./press-quote-section";
import { PurchasePanelSection } from "./purchase-panel-section";
import { SpecTableSection } from "./spec-table-section";
import { SplitHeroDualMediaSection } from "./split-hero-dual-media-section";
import { SplitHeroSection } from "./split-hero-section";
import { TestimonialCardSection } from "./testimonial-card-section";
import { TextCalloutBlockSection } from "./text-callout-block-section";
import { TrustStripSection } from "./trust-strip-section";
import { TypedQuoteSection } from "./typed-quote-section";
import { VideoSection } from "./video-section";

type ProductSlideSectionRendererProps = {
  sections: readonly ProductSlideSectionConfig[];
  messages: Record<string, unknown>;
  commonMessages?: Record<string, unknown>;
  auxMessages?: Record<string, unknown>;
  resolveHref?: (href: string) => string;
  /**
   * Staff copy overrides for the current locale, by section key (**Slide-in section**).
   * Merged over each section's i18n default; media overrides are already applied to
   * `sections` by the caller.
   */
  copyOverrides?: Readonly<Record<string, Record<string, unknown>>>;
  /** Wraps each rendered section — Preview mode's selectable frame. */
  wrapSection?: (section: ProductSlideSectionConfig, node: React.ReactNode) => React.ReactNode;
};

function resolveCtaLabel(
  messages: Record<string, unknown>,
  commonMessages: Record<string, unknown> | undefined,
  cta: SectionCtaConfig,
): string | undefined {
  if (cta.label) return cta.label;
  if (cta.labelKey) {
    const source = cta.labelScope === "common" ? commonMessages : messages;
    const value = source?.[cta.labelKey];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function resolveScaleTitles(
  messages: Record<string, unknown>,
  scales: FirmnessScaleConfig[],
  auxMessages?: Record<string, unknown>,
): Array<FirmnessScaleConfig & { title: string }> {
  return scales.map((scale) => {
    const title =
      scale.title ??
      (scale.titleKey
        ? ((messages[scale.titleKey] ?? auxMessages?.[scale.titleKey]) as string | undefined)
        : undefined);
    if (!title) {
      throw new Error(`ProductSlideSectionRenderer: missing firmness scale title for "${scale.label}"`);
    }
    // ponytail: titleKey resolved above; omit from spread
    const { titleKey: _omit, ...rest } = scale;
    void _omit;
    return { ...rest, title };
  });
}

function resolveButtonLabel(messages: Record<string, unknown>, labelKey: string): string | undefined {
  const value = messages[labelKey];
  return typeof value === "string" ? value : undefined;
}

export function ProductSlideSectionRenderer({
  sections,
  messages: rawMessages,
  commonMessages,
  auxMessages,
  resolveHref,
  copyOverrides,
  wrapSection,
}: ProductSlideSectionRendererProps) {
  // Policy copy carries {readjustmentFee}-style placeholders; fill them with
  // today's Costings → Service fees so the slide never quotes a stale price.
  const serviceCopy = useServiceCopy();
  const messages = React.useMemo(
    () => interpolateServiceCopyDeep(rawMessages, serviceCopy),
    [rawMessages, serviceCopy],
  );

  /**
   * A section's copy: its i18n default, with any Staff override merged over it. The
   * override is interpolated too, so Staff can write `{readjustmentFee}` like the i18n.
   */
  const copyOf = <T,>(section: ProductSlideSectionConfig): T => {
    const defaults = resolveSectionDefaults(messages, section);
    const override = copyOverrides?.[section.key];
    if (!override) return defaults as T;
    return interpolateServiceCopyDeep(applyCopyOverride(section.type, defaults, override), serviceCopy) as T;
  };

  return (
    <>
      {sections.map((section, index) => {
        const node = renderSection(section, index);
        return wrapSection ? (
          <React.Fragment key={`${section.key}-${index}`}>{wrapSection(section, node)}</React.Fragment>
        ) : (
          node
        );
      })}
    </>
  );

  function renderSection(section: ProductSlideSectionConfig, index: number): React.ReactNode {
    if (!isProductSlideSectionType(section.type)) {
      throw new Error(`ProductSlideSectionRenderer: unknown section type "${section.type}"`);
    }

    if (!isImplementedSectionType(section.type)) {
      throw new Error(
        `ProductSlideSectionRenderer: section type "${section.type}" is not implemented yet`,
      );
    }

    const key = `${section.key}-${index}`;

    if (section.type === "split_hero") {
      const content = copyOf<SplitHeroContent>(section);
      const ctaLabel = section.cta
        ? resolveCtaLabel(messages, commonMessages, section.cta)
        : undefined;
      const buttonLabel = section.buttonAction
        ? resolveButtonLabel(messages, section.buttonAction.labelKey)
        : undefined;

      return (
        <SplitHeroSection
          key={key}
          content={content}
          image={section.image}
          flip={section.flip}
          stacked={section.stacked}
          stackedImages={section.stackedImages}
          naturalImage={section.naturalImage}
          collapsibleList={section.collapsibleList}
          cta={section.cta && ctaLabel ? { ...section.cta, label: ctaLabel } : undefined}
          buttonLabel={buttonLabel}
          onButtonClick={
            section.buttonAction?.action === "openCervical" ? openCervicalNeckSupportSheet : undefined
          }
          resolveHref={resolveHref}
          titleAs={section.titleAs}
          titleClassName={section.titleClassName}
          imageWrapperClassName={section.imageWrapperClassName}
          gridClassName={section.gridClassName}
          borderTop={section.borderTop}
          sectionData={section.sectionData}
          headerData={section.headerData}
        />
      );
    }

    if (section.type === "split_hero_dual_media") {
      const content = copyOf<SplitHeroDualMediaContent>(section);
      return (
        <SplitHeroDualMediaSection
          key={key}
          content={content}
          heroImage={section.heroImage}
          secondaryImage={section.secondaryImage}
          scales={resolveScaleTitles(messages, section.scales, auxMessages)}
          borderTop={section.borderTop}
        />
      );
    }

    if (section.type === "trust_strip") {
      const content = copyOf<TrustStripContent>(section);
      return <TrustStripSection key={key} content={content} borderTop={section.borderTop} />;
    }

    if (section.type === "icon_list") {
      const content = copyOf<IconListContent>(section);
      return <IconListSection key={key} content={content} borderTop={section.borderTop} />;
    }

    if (section.type === "firmness_compare") {
      const content = copyOf<FirmnessCompareContent>(section);
      return (
        <FirmnessCompareSection
          key={key}
          content={content}
          scales={resolveScaleTitles(messages, section.scales, auxMessages)}
          borderTop={section.borderTop}
        />
      );
    }

    if (section.type === "feature_carousel") {
      const content = copyOf<FeatureCarouselContent>(section);
      const items = buildFeatureCarouselItems(content.features, section.images).map((item) => ({
        title: item.title,
        description: item.description,
        imageSrc: item.image.src,
        imageAlt: item.image.alt,
      }));

      return (
        <FeatureCarouselSection
          key={key}
          items={items}
          title={content.title}
          intro={content.intro}
          borderTop={section.borderTop}
        />
      );
    }

    if (section.type === "size_guide_split") {
      const content = copyOf<SplitHeroContent>(section);
      return (
        <SplitHeroSection
          key={key}
          content={content}
          image={section.image}
          flip={section.flip}
          titleAs={section.titleAs}
          titleClassName={section.titleClassName}
          imageWrapperClassName={section.imageWrapperClassName}
          gridClassName={section.gridClassName}
          borderTop={section.borderTop}
          sectionData={section.sectionData}
          headerData={section.headerData}
        />
      );
    }

    if (section.type === "video_section") {
      const content = copyOf<VideoSectionContent>(section);
      return (
        <VideoSection
          key={key}
          content={content}
          videoId={section.videoId}
          layout={section.layout}
          borderTop={section.borderTop}
        />
      );
    }

    if (section.type === "spec_table") {
      const content = copyOf<SpecTableContent>(section);
      return (
        <SpecTableSection
          key={key}
          content={content}
          rows={section.rows}
          borderTop={section.borderTop}
        />
      );
    }

    if (section.type === "packaging_block") {
      const content = copyOf<PackagingBlockContent>(section);
      return (
        <PackagingBlockSection
          key={key}
          content={content}
          image={section.image}
          borderTop={section.borderTop}
        />
      );
    }

    if (section.type === "commitment_cards") {
      const content = copyOf<CommitmentCardsContent>(section);
      return (
        <CommitmentCardsSection
          key={key}
          content={content}
          image={section.image}
          borderTop={section.borderTop}
        />
      );
    }

    if (section.type === "help_contact") {
      const content = copyOf<HelpContactContent>(section);
      return <HelpContactSection key={key} content={content} borderTop={section.borderTop} />;
    }

    if (section.type === "media_intro") {
      const content = copyOf<MediaIntroContent>(section);
      return (
        <MediaIntroSection
          key={key}
          content={content}
          image={section.image}
          borderTop={section.borderTop}
        />
      );
    }

    if (section.type === "full_bleed_media") {
      const content = copyOf<FullBleedMediaContent>(section);
      return (
        <FullBleedMediaSection
          key={key}
          image={section.image}
          content={content}
          borderTop={section.borderTop}
        />
      );
    }

    if (section.type === "press_quote") {
      const content = copyOf<PressQuoteContent>(section);
      return <PressQuoteSection key={key} content={content} borderTop={section.borderTop} />;
    }

    if (section.type === "measure_carousel") {
      const content = copyOf<MeasureCarouselContent>(section);
      return (
        <MeasureCarouselSection
          key={key}
          content={content}
          icons={section.icons}
          borderTop={section.borderTop}
        />
      );
    }

    if (section.type === "typed_quote") {
      const content = copyOf<TypedQuoteContent>(section);
      return <TypedQuoteSection key={key} content={content} borderTop={section.borderTop} />;
    }

    if (section.type === "feature_card_grid") {
      const content = copyOf<FeatureCardGridContent>(section);
      return (
        <FeatureCardGridSection
          key={key}
          content={content}
          cardImages={section.cardImages}
          borderTop={section.borderTop}
        />
      );
    }

    if (section.type === "text_callout_block") {
      const content = copyOf<TextCalloutBlockContent>(section);
      return <TextCalloutBlockSection key={key} content={content} borderTop={section.borderTop} />;
    }

    if (section.type === "outcome_grid") {
      const content = copyOf<OutcomeGridContent>(section);
      return <OutcomeGridSection key={key} content={content} borderTop={section.borderTop} />;
    }

    if (section.type === "testimonial_card") {
      const content = copyOf<
        TestimonialCardContent & { headerTitle: string; headerIntro: string; reviewTitle: string }
      >(section);
      const stars = messages.stars as string[] | undefined;
      return (
        <TestimonialCardSection
          key={key}
          headerTitle={content.headerTitle}
          headerIntro={content.headerIntro}
          reviewTitle={content.reviewTitle}
          content={content}
          ratingLabel={resolveRatingBreakdownLabel(messages)}
          ratingRows={section.ratingRows.map((row) => ({
            label: stars?.[row.starIndex] ?? `${row.starIndex + 1} stars`,
            percent: row.percent,
          }))}
          image={section.image}
          borderTop={section.borderTop}
        />
      );
    }

    if (section.type === "measurement_grid") {
      const content = copyOf<{
        title: string;
        intro: string;
        steps: Array<{ title: string; description: string }>;
      }>(section);
      return (
        <MeasurementGridSection
          key={key}
          title={content.title}
          intro={content.intro}
          steps={content.steps}
          stepImages={section.stepImages}
          borderTop={section.borderTop}
        />
      );
    }

    if (section.type === "purchase_panel") {
      if (!commonMessages || !resolveHref) {
        throw new Error("ProductSlideSectionRenderer: purchase_panel requires commonMessages and resolveHref");
      }
      const panelCopy = copyOf<Record<string, unknown>>(section);
      return (
        <PurchasePanelSection
          key={key}
          messages={
            { ...messages, ...panelCopy } as {
              heroLabel: string;
              heroTitle: string;
              heroDescription: string;
              zoomLabel: string;
              salePriceLabel: string;
              reviewCountLabel: string;
              sizeLabel: string;
              sizePlaceholder: string;
              sizes: string[];
              caseTypeLabel: string;
              caseTypePlaceholder: string;
              caseTypes: string[];
              purchaseNote: string;
              purchaseLinkLabel: string;
            }
          }
          commonMessages={{
            addToCart: String(commonMessages.addToCart ?? ""),
            customise: String(commonMessages.customise ?? ""),
            bookAppointment: String(commonMessages.bookAppointment ?? ""),
          }}
          heroImage={section.heroImage}
          gallery={section.gallery}
          price={section.price}
          resolveHref={resolveHref}
          borderTop={section.borderTop}
        />
      );
    }

    return null;
  }
}
