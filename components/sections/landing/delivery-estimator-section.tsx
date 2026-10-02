import { DeliveryEstimator } from "@/components/shop/delivery-estimator";
import type { Locale } from "@/lib/i18n/locales";
import type { DeliveryEstimatorContent, LandingSection } from "@/lib/types/landing-sections";

interface DeliveryEstimatorSectionProps {
  section: LandingSection;
  locale: Locale;
}

/**
 * "What does delivery cost to me?" on the landing page: a postal code in, live
 * delivery options out, quoted for one boxed Mpillow. Rates, couriers and the
 * free-shipping threshold all come from Settings → Shipping.
 */
export function DeliveryEstimatorSection({ section, locale }: DeliveryEstimatorSectionProps) {
  const content = section.content as DeliveryEstimatorContent;
  return (
    <section className="px-4 py-12 md:py-16">
      <div className="mx-auto max-w-xl rounded-2xl border bg-card p-5 shadow-sm md:p-8">
        <DeliveryEstimator
          locale={locale}
          profile="pillow"
          title={content.title}
          subtitle={content.subtitle}
        />
      </div>
    </section>
  );
}
