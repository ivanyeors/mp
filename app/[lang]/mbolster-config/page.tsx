import { PageFaqSection } from "@/components/page-faq/page-faq-section";
import { ConfiguratorSeoIntro } from "@/components/seo/configurator-seo-intro";
import { getAdminContext } from "@/lib/auth/admin";
import { roleHasPermission } from "@/lib/auth/permissions";
import { getPageFaq } from "@/lib/page-faq";
import { getConfiguratorOfferRange } from "@/lib/seo/configurator-offer-range";
import { buildConfiguratorProductJsonLd } from "@/lib/seo/jsonld-product";
import { getSiteOrigin } from "@/lib/site-url";
import { getPartnerByCode } from "@/lib/referrals";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { MbolsterConfigClient } from "./mbolster-config-client";

const INTRO: Record<Locale, { h1: string; lede: string }> = {
  "en-US": {
    h1: "Customise Your Mbolster",
    lede:
      "Customise your Mbolster — Mpillow's custom-length support bolster for side sleepers in Singapore. Choose short, medium, or long by height — including kids — so the whole household can share the same Science of Sleep approach. Pick a washable case fabric and order online with delivery. Mbolster is built for hip–spine alignment and hug-sleep comfort, using the same ergonomic philosophy as our cervical pillows so your whole sleep setup stays consistent.",
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
  // Staff assist gate: same Staff check as mp-config. Guests get null.
  // Partner-assist (#78) is INDEPENDENT of staff auth — from the ?partner code.
  const [offer, faq, staffCtx, partner] = await Promise.all([
    getConfiguratorOfferRange("bolster"),
    getPageFaq("mbolster-config", locale),
    getAdminContext(),
    partnerCode ? getPartnerByCode(partnerCode) : Promise.resolve(null),
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
      {/* Crawlable SEO shell; UI lives in the welcome (i) dialog */}
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
        // Same gate as /mp-config: assist edits a Result, `viewer` is read-only.
        staffAssist={Boolean(staffCtx && roleHasPermission(staffCtx.role, "results"))}
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
