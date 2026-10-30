import type { Metadata } from "next";
import { PartnersPage } from "@/components/marketing/partners-page";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { PAGE_META } from "@/lib/seo/page-meta";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  return buildPageMetadata({ ...PAGE_META.ourPartners[locale], path: "/our-partners", lang: locale });
}

export default function OurPartnersPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  return <PartnersPage params={params} />;
}
