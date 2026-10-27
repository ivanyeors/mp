import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { ConfiguratorClientShell } from "@/components/seo/configurator-client-shell";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";

const META: Record<Locale, { title: string; description: string }> = {
  "en-US": {
    title: "Customise your cervical pillow in Singapore",
    description:
      "Design a customised cervical pillow in Singapore for neck pain. Choose Basic or Premium, then your size, cover and case.",
  },
  "zh-CN": {
    title: "在新加坡定制您的颈椎枕",
    description:
      "在新加坡定制您的颈椎枕。选择基础款或高级款、尺寸、面料和枕套，专为缓解颈部疼痛而设计。",
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
    path: "/mp-config",
    lang: locale,
    keywords: [
      "customised pillow Singapore",
      "custom pillow Singapore",
      "cervical pillow customisation",
      "Mpillow customisation",
    ],
  });
}

export default async function MpConfigLayout({ children }: Props) {
  return <ConfiguratorClientShell>{children}</ConfiguratorClientShell>;
}
