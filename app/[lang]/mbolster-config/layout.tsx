import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { ConfiguratorClientShell } from "@/components/seo/configurator-client-shell";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";

const META: Record<Locale, { title: string; description: string }> = {
  "en-US": {
    title: "Customise Your Mbolster | Support Bolster Singapore",
    description:
      "Design your custom Mbolster support bolster in Singapore. Choose length (short, medium, long), case, and add to cart. Ergonomic side-sleeping support for Singapore homes.",
  },
  "zh-CN": {
    title: "定制您的 Mbolster | 新加坡支撑抱枕",
    description: "在新加坡定制您的 Mbolster 支撑抱枕。选择长度、面料并加入购物车。",
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
