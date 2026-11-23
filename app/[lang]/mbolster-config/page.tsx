import { PageFaqSection } from "@/components/page-faq/page-faq-section";
import { ConfiguratorSeoIntro } from "@/components/seo/configurator-seo-intro";
import { getAdminContext } from "@/lib/auth/admin";
import { discoverySourceChoices } from "@/lib/discovery-source";
import { readDiscoverySourceCatalog } from "@/lib/discovery-source/cached";
import { hasPermission } from "@/lib/auth/permissions";
import { getPageFaq } from "@/lib/page-faq";
import { getConfiguratorOfferRange } from "@/lib/seo/configurator-offer-range";
import { buildConfiguratorProductJsonLd } from "@/lib/seo/jsonld-product";
import { getSiteOrigin } from "@/lib/site-url";
import { getPartnerByCode } from "@/lib/referrals";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { loadServiceFees } from "@/lib/pricing/service-prices";
import { actingProfile } from "@/lib/staff/working-as";
import { supabaseAdmin } from "@/lib/supabase/server";
import { MbolsterConfigClient } from "./mbolster-config-client";

const INTRO: Record<Locale, { h1: string; lede: string }> = {
  "en-US": {
    h1: "Customise your Mbolster",
    lede:
      "Customise your Mbolster, the custom-length support bolster from Mpillow for side sleepers in Singapore. Choose short, medium, or long by height, with sizes for kids too, so everyone in your household gets the right fit. Pick a washable case fabric and order online with delivery. Mbolster supports your hips and spine as you hug it, and follows the same ergonomic thinking as our cervical pillows, so your whole sleep setup feels consistent.",
  },
  "zh-CN": {
    h1: "定制您的 Mbolster",
    lede:
      "定制您的 Mbolster——Mpillow 为新加坡侧睡者设计的定制长度支撑抱枕。按身长选择短、中或长尺寸，挑选可洗面料后在线下单。Mbolster 面向髋部与脊柱对齐及环抱睡姿舒适，理念与我们的颈椎枕一致，让整套睡眠配置保持统一。",
  },
};

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ partner?: string }>;
};

export default async function MbolsterConfigPage({ params, searchParams }: Props) {
  const { lang } = await params;
  const { partner: partnerCode } = await searchParams;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const intro = INTRO[locale];
  const [offer, faq, staffCtx, partner, discoverySourceOptions] = await Promise.all([
    getConfiguratorOfferRange("bolster"),
    getPageFaq("mbolster-config", locale),
    getAdminContext(),
    partnerCode ? getPartnerByCode(partnerCode) : Promise.resolve(null),
    readDiscoverySourceCatalog().then((catalog) => discoverySourceChoices(catalog, locale)),
  ]);

  const [servicePrices, measuringProfile] = await Promise.all([
    loadServiceFees(supabaseAdmin()).catch(() => null),
    staffCtx ? actingProfile(staffCtx.memberId) : Promise.resolve(null),
  ]);

  const jsonLd = buildConfiguratorProductJsonLd({
    lang: locale,
    path: "/mbolster-config",
    name: "Mbolster Custom Support Bolster",
    description: intro.lede,
    image: `${getSiteOrigin()}/bolster_mbolster_size.webp`,
    ...(offer ?? {}),
  });

  return (
    <>
      <div className="sr-only">
        <ConfiguratorSeoIntro h1={intro.h1} answerLede={intro.lede} jsonLd={jsonLd} />
        <PageFaqSection surfaceKey="mbolster-config" locale={locale} />
      </div>
      <MbolsterConfigClient
        info={{
          h1: intro.h1,
          lede: intro.lede,
          faqTitle: faq?.title ?? null,
          faqItems: faq?.items ?? [],
        }}
        staffAssist={Boolean(staffCtx && hasPermission(staffCtx, "results"))}
        servicePrices={servicePrices}
        measuredByStaff={Boolean(measuringProfile)}
        discoverySourceOptions={discoverySourceOptions}
        partner={
          partner
            ? {
                code: partner.code,
                name: partner.name,
                logoUrl: partner.logoUrl,
                description: partner.description,
              }
            : null
        }
      />
    </>
  );
}
