import { ConfiguratorSeoIntro } from "@/components/seo/configurator-seo-intro";
import { buildConfiguratorProductJsonLd } from "@/lib/seo/jsonld-product";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { MbolsterConfigClient } from "./mbolster-config-client";

const INTRO: Record<Locale, { h1: string; lede: string }> = {
  "en-US": {
    h1: "Customise Your Mbolster",
    lede:
      "Mbolster is Mpillow's custom-length support bolster for side sleepers in Singapore. Pick short, medium, or long to match your body, choose your case fabric, and order online. Designed for hip–spine alignment and hug-sleep comfort — the same ergonomic philosophy behind our cervical pillows.",
  },
  "zh-CN": {
    h1: "定制您的 Mbolster",
    lede:
      "Mbolster 是 Mpillow 为新加坡侧睡者设计的定制长度支撑抱枕。选择短、中或长尺寸，挑选面料，在线下单。",
  },
};

type Props = {
  params: Promise<{ lang: string }>;
};

export default async function MbolsterConfigPage({ params }: Props) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const intro = INTRO[locale];

  const jsonLd = buildConfiguratorProductJsonLd({
    lang: locale,
    path: "/mbolster-config",
    name: "Mbolster Custom Support Bolster",
    description: intro.lede,
  });

  return (
    <>
      <ConfiguratorSeoIntro h1={intro.h1} answerLede={intro.lede} jsonLd={jsonLd} />
      <MbolsterConfigClient />
    </>
  );
}
