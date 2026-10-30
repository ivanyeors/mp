import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { ConfiguratorClientShell } from "@/components/seo/configurator-client-shell";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";

const META: Record<Locale, { title: string; description: string }> = {
  "en-US": {
    title: "Customise your Mbolster support bolster in Singapore",
    description:
      "Design your custom Mbolster support bolster in Singapore. Choose a short, medium or long length and a case, then add it to your cart. For side sleepers.",
  },
  "zh-CN": {
    title: "在新加坡定制您的 Mbolster 支撑抱枕",
    description:
      "在新加坡定制您的 Mbolster 支撑抱枕：按身长选择短、中或长尺寸，挑选可洗的枕套面料后加入购物车。Mbolster 为侧睡者设计，环抱时承托髋部与脊柱，也有适合孩子的尺寸，让家里每个人都能找到合适的长度，可在线下单配送到家。",
  },
};

type Props = {
  params: Promise<{ lang: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const meta = META[locale];

  return buildPageMetadata({
    title: meta.title,
    description: meta.description,
    path: "/mbolster-config",
    lang: locale,
    keywords: [
      "bolster pillow Singapore",
      "custom bolster Singapore",
      "side sleeping bolster",
      "Mbolster",
    ],
  });
}

export default async function MbolsterConfigLayout({ children }: Props) {
  return <ConfiguratorClientShell>{children}</ConfiguratorClientShell>;
}
