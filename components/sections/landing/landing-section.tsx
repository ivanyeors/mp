import type { Messages } from "@/lib/i18n/messages/types";
import type { Locale } from "@/lib/i18n/locales";
import type { LandingSection as LandingSectionType } from "@/lib/types/landing-sections";

import { HeroSection } from "./hero-section";
import { TextImageSection } from "./text-image-section";
import { MarqueeSection } from "./marquee-section";
import { StoriesSectionWrapper } from "./stories-section-wrapper";
import { PickMpillowSection } from "./pick-mpillow-section";
import { NeckPainsSection } from "./neck-pains-section";
import { WhyChooseSection } from "./why-choose-section";
import { ProductCardSection } from "./product-card-section";
import { CredibilitySection } from "./credibility-section";
import { VideoSection } from "./video-section";
import { FounderSection } from "./founder-section";
import { ExploreSection } from "./explore-section";
import { CustomTextImageSection } from "./custom-text-image-section";
import { CustomRichTextSection } from "./custom-rich-text-section";
import { CustomFullWidthImageSection } from "./custom-full-width-image-section";
import { FeaturedProductsSection } from "./featured-products-section";
import { ShopCtaSection } from "./shop-cta-section";
import { DeliveryEstimatorSection } from "./delivery-estimator-section";
import { TikTokVideosSection } from "./tiktok-videos-section";
import { PageFaqSection } from "@/components/page-faq/page-faq-section";

import type { LandingRatings } from "@/lib/seo/review-aggregate";
import { resolveContentLocale } from "@/lib/page-builder/locale";

export interface LandingSectionProps {
  section: LandingSectionType;
  messages: Messages;
  locale: Locale;
  images: Record<string, string>;
  prices: {
    basicXsFromPrice: string;
    premiumXsFromPrice: string;
    bolsterFromPrice: string;
  };
  landingRatings?: LandingRatings;
  preview?: boolean;
}

export function LandingSection({
  section: stored,
  messages,
  locale,
  images,
  prices,
  landingRatings,
  preview = false,
}: LandingSectionProps) {
  const section: LandingSectionType = {
    ...stored,
    content: resolveContentLocale(stored.content, locale),
  };

  switch (section.section_type) {
    case "hero":
      return <HeroSection section={section} messages={messages} locale={locale} images={images} />;

    case "text_image":
      return <TextImageSection section={section} messages={messages} locale={locale} images={images} />;

    case "marquee":
      return <MarqueeSection section={section} images={images} />;

    case "stories":
      return <StoriesSectionWrapper messages={messages} preview={preview} />;

    case "pick_your_mpillow":
      return (
        <PickMpillowSection
          section={section}
          messages={messages}
          locale={locale}
          images={images}
          prices={{ basicXsFromPrice: prices.basicXsFromPrice, premiumXsFromPrice: prices.premiumXsFromPrice }}
          ratings={{
            basic: landingRatings?.basic,
            premium: landingRatings?.premium,
          }}
        />
      );

    case "neck_pains":
      return <NeckPainsSection section={section} messages={messages} images={images} />;

    case "why_choose_highlights":
      return <WhyChooseSection section={section} messages={messages} />;

    case "product_card":
      return (
        <ProductCardSection
          section={section}
          messages={messages}
          locale={locale}
          images={images}
          prices={{ bolsterFromPrice: prices.bolsterFromPrice }}
          bolsterRating={landingRatings?.bolster}
        />
      );

    case "credibility":
      return <CredibilitySection section={section} messages={messages} />;

    case "video_embed":
      return <VideoSection section={section} messages={messages} />;

    case "founder_note":
      return <FounderSection section={section} messages={messages} images={images} />;

    case "explore":
      return <ExploreSection section={section} messages={messages} locale={locale} />;

    case "custom_text_image":
      return <CustomTextImageSection section={section} />;

    case "custom_rich_text":
      return <CustomRichTextSection section={section} />;

    case "custom_full_width_image":
      return <CustomFullWidthImageSection section={section} />;

    case "custom_video": {
      return <VideoSection section={section} messages={messages} />;
    }

    case "featured_products":
      return <FeaturedProductsSection section={section} locale={locale} />;

    case "shop_cta":
      return <ShopCtaSection section={section} locale={locale} messages={messages} />;

    case "faq":
      // ponytail: content {} — Q&A owned by Page FAQ store (`home`)
      return <PageFaqSection surfaceKey="home" locale={locale} />;

    case "delivery_estimator":
      return <DeliveryEstimatorSection section={section} locale={locale} />;

    case "tiktok_videos":
      return <TikTokVideosSection section={section} messages={messages} locale={locale} />;

    default:
      return null;
  }
}
