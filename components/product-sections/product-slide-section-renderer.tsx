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
import {
  resolveMeasurementHeader,
  resolveMeasurementSteps,
  resolveRatingBreakdownLabel,
  resolveReviewTitle,
  resolveSlideContent,
  resolveTestimonialHeader,
} from "@/lib/product-slide-sections/resolve-slide-content";
import type { SectionCtaConfig } from "@/lib/product-slide-sections/types";

import { CommitmentCardsSection } from "./commitment-cards-section";
import { FeatureCarouselSection } from "./feature-carousel-section";
import { FeatureCardGridSection } from "./feature-card-grid-section";
import { FirmnessCompareSection } from "./firmness-compare-section";
import { FullBleedMediaSection } from "./full-bleed-media-section";
import { HelpContactSection } from "./help-contact-section";
import { IconListSection } from "./icon-list-section";
import { MeasurementGridSection } from "./measurement-grid-section";
import { MediaIntroSection } from "./media-intro-section";
import { OutcomeGridSection } from "./outcome-grid-section";
import { PackagingBlockSection } from "./packaging-block-section";
import { PurchasePanelSection } from "./purchase-panel-section";
import { SpecTableSection } from "./spec-table-section";
import { SplitHeroDualMediaSection } from "./split-hero-dual-media-section";
import { SplitHeroSection } from "./split-hero-section";
import { TestimonialCardSection } from "./testimonial-card-section";
import { TextCalloutBlockSection } from "./text-callout-block-section";
import { TrustStripSection } from "./trust-strip-section";
import { VideoSection } from "./video-section";

type ProductSlideSectionRendererProps = {
  sections: readonly ProductSlideSectionConfig[];
  messages: Record<string, unknown>;
  commonMessages?: Record<string, unknown>;
  auxMessages?: Record<string, unknown>;
  resolveHref?: (href: string) => string;
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
}: ProductSlideSectionRendererProps) {
  // Policy copy carries {readjustmentFee}-style placeholders; fill them with
  // today's Costings → Service fees so the slide never quotes a stale price.
  const serviceCopy = useServiceCopy();
  const messages = React.useMemo(
    () => interpolateServiceCopyDeep(rawMessages, serviceCopy),
    [rawMessages, serviceCopy],
  );
  return (
    <>
      {sections.map((section, index) => {
        if (!isProductSlideSectionType(section.type)) {
          throw new Error(`ProductSlideSectionRenderer: unknown section type "${section.type}"`);
        }

        if (!isImplementedSectionType(section.type)) {
          throw new Error(
            `ProductSlideSectionRenderer: section type "${section.type}" is not implemented yet`,
          );
        }

        const key = `${section.type}-${"contentKey" in section ? section.contentKey : index}-${index}`;

        if (section.type === "split_hero") {
          const content = resolveSlideContent(messages, "split_hero", section.contentKey);
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
          const content = resolveSlideContent(messages, "split_hero_dual_media", section.contentKey);
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
          const content = resolveSlideContent(messages, "trust_strip", section.contentKey);
          return <TrustStripSection key={key} content={content} borderTop={section.borderTop} />;
        }

        if (section.type === "icon_list") {
          const content = resolveSlideContent(messages, "icon_list", section.contentKey);
          return <IconListSection key={key} content={content} borderTop={section.borderTop} />;
        }

        if (section.type === "firmness_compare") {
          const content = resolveSlideContent(messages, "firmness_compare", section.contentKey);
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
          const content = resolveSlideContent(messages, "feature_carousel", section.contentKey);
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
          const content = resolveSlideContent(messages, "size_guide_split", section.contentKey);
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
          const content = resolveSlideContent(messages, "video_section", section.contentKey);
          return (
            <VideoSection
              key={key}
              content={content}
              videoId={section.videoId}
              borderTop={section.borderTop}
            />
          );
        }

        if (section.type === "spec_table") {
          const content = resolveSlideContent(messages, "spec_table", section.contentKey);
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
          const content = resolveSlideContent(messages, "packaging_block", section.contentKey);
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
          const content = resolveSlideContent(messages, "commitment_cards", section.contentKey);
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
          const content = resolveSlideContent(messages, "help_contact", section.contentKey);
          return <HelpContactSection key={key} content={content} borderTop={section.borderTop} />;
        }

        if (section.type === "media_intro") {
          const content = resolveSlideContent(messages, "media_intro", section.contentKey);
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
          return <FullBleedMediaSection key={key} image={section.image} borderTop={section.borderTop} />;
        }

        if (section.type === "feature_card_grid") {
          const content = resolveSlideContent(messages, "feature_card_grid", section.contentKey);
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
          const content = resolveSlideContent(messages, "text_callout_block", section.contentKey);
          return <TextCalloutBlockSection key={key} content={content} borderTop={section.borderTop} />;
        }

        if (section.type === "outcome_grid") {
          const content = resolveSlideContent(messages, "outcome_grid", section.contentKey);
          return <OutcomeGridSection key={key} content={content} borderTop={section.borderTop} />;
        }

        if (section.type === "testimonial_card") {
          const content = resolveSlideContent(messages, "testimonial_card", section.contentKey);
          const header = resolveTestimonialHeader(messages);
          const stars = messages.stars as string[] | undefined;
          return (
            <TestimonialCardSection
              key={key}
              headerTitle={header.title}
              headerIntro={header.intro}
              reviewTitle={resolveReviewTitle(messages)}
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
          const header = resolveMeasurementHeader(messages);
          return (
            <MeasurementGridSection
              key={key}
              title={header.title}
              intro={header.intro}
              steps={resolveMeasurementSteps(messages)}
              stepImages={section.stepImages}
              borderTop={section.borderTop}
            />
          );
        }

        if (section.type === "purchase_panel") {
          if (!commonMessages || !resolveHref) {
            throw new Error("ProductSlideSectionRenderer: purchase_panel requires commonMessages and resolveHref");
          }
          return (
            <PurchasePanelSection
              key={key}
              messages={
                messages as {
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
      })}
    </>
  );
}
