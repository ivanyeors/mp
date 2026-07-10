import { ConfiguratorSeoIntro } from "@/components/seo/configurator-seo-intro";
import { getConfiguratorOfferRange } from "@/lib/seo/configurator-offer-range";
import { buildConfiguratorProductJsonLd } from "@/lib/seo/jsonld-product";
import { getSiteOrigin } from "@/lib/site-url";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { MpConfigClient } from "./mp-config-client";

const INTRO: Record<Locale, { h1: string; lede: string }> = {
  "en-US": {
    h1: "Customise Your Mpillow Pillow",
    lede:
      "Mpillow is Singapore's fully customisable cervical pillow — sized and fitted in-store for your neck and sleep position. Choose Basic or Premium tier, pick your size and cover, and book an in-store fitting. Our pillows are designed for neck pain relief, ergonomic alignment, and long-term comfort — not one-size-fits-all foam.",
  },
  "zh-CN": {
    h1: "定制您的 Mpillow 枕头",
    lede:
      "Mpillow 是新加坡全定制颈椎枕——根据您的颈部和睡姿在店内量身配置。选择基础款或高级款、尺寸和面料，并预约到店试配。",
  },
};

type Props = {
  params: Promise<{ lang: string }>;
};

export default async function MpConfigPage({ params }: Props) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const intro = INTRO[locale];
  const offer = await getConfiguratorOfferRange("pillow");

  const jsonLd = buildConfiguratorProductJsonLd({
    lang: locale,
    path: "/mp-config",
    name: "Mpillow Custom Pillow",
    description: intro.lede,
    image: `${getSiteOrigin()}/basic-mpillow.webp`,
    ...(offer ?? {}),
  });

  return (
    <>
      <ConfiguratorSeoIntro h1={intro.h1} answerLede={intro.lede} jsonLd={jsonLd} />
      <MpConfigClient />
    </>
  );
}
