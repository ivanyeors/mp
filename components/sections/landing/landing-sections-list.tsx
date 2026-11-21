import type { Messages } from "@/lib/i18n/messages/types";
import type { Locale } from "@/lib/i18n/locales";
import type { LandingSection as LandingSectionType } from "@/lib/types/landing-sections";
import type { LandingRatings } from "@/lib/seo/review-aggregate";

import { LandingSection } from "./landing-section";

export interface LandingSectionsListProps {
  sections: LandingSectionType[];
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

export function LandingSectionsList({
  sections,
  messages,
  locale,
  images,
  prices,
  landingRatings,
  preview = false,
}: LandingSectionsListProps) {
  return (
    <>
      {sections.map((section) => {
        const hidden = preview && !section.visible;
        return (
          <div
            key={section.id}
            id={section.slug}
            data-section={section.slug}
            {...(preview
              ? { "data-preview-hidden": hidden ? "" : undefined, "data-section-type": section.section_type }
              : {})}
            className={hidden ? "relative opacity-40 grayscale" : undefined}
          >
            {hidden && (
              <div className="pointer-events-none absolute right-2 top-2 z-20 rounded-full bg-foreground/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">
                Hidden
              </div>
            )}
            <LandingSection
              section={section}
              messages={messages}
              locale={locale}
              images={images}
              prices={prices}
              landingRatings={landingRatings}
              preview={preview}
            />
          </div>
        );
      })}
    </>
  );
}
