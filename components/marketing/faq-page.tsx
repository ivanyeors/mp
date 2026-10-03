import Link from "next/link";
import type { Metadata } from "next";

import { FaqContent } from "@/components/marketing/faq-content";
import { JsonLdScript } from "@/components/seo/json-ld-script";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { getFaqPageData, stripMarkdownForSchema } from "@/lib/faq";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

import { getSiteOrigin } from "@/lib/site-url";
import { buildPageMetadata } from "@/lib/seo/metadata";

const META: Record<Locale, { title: string; description: string; intro: string; cta: string }> = {
  "en-US": {
    title: "MPillow FAQ | Common Questions, Orders & Product Help",
    description:
      "Find answers about Mpillow customisation, care, warranty, returns, refunds, and shipping. Expert help for Singapore's fully customisable pillow.",
    intro:
      "Quick answers about Mpillow products, customisation, care, warranty, returns, and shipping. Can't find what you need? Our support team is happy to help.",
    cta: "Contact support",
  },
  "zh-CN": {
    title: "MPillow 常见问题 | 订单与产品帮助",
    description:
      "查找关于 Mpillow 定制、保养、保修、退货、退款和配送的常见问题解答。新加坡全定制枕头专家为您解答。",
    intro:
      "关于 Mpillow 产品、定制、保养、保修、退货和配送的快速解答。找不到答案？欢迎联系我们的客服团队。",
    cta: "联系客服",
  },
};

type FaqPageProps = {
  params: Promise<{ lang: string }>;
  searchParams?: Promise<{ q?: string }>;
};

export async function generateFaqMetadata({ params }: FaqPageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const meta = META[locale];

  return buildPageMetadata({
    title: meta.title,
    description: meta.description,
    path: "/faq",
    lang: locale,
    keywords: [
      "Mpillow FAQ",
      "custom pillow Singapore",
      "pillow warranty",
      "pillow returns",
      "pillow shipping",
      "Mpillow care",
    ],
  });
}

export async function MarketingFaqPage({ params, searchParams }: FaqPageProps) {
  const { lang } = await params;
  const sp = searchParams ? await searchParams : {};
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const meta = META[locale];
  const siteOrigin = getSiteOrigin();
  const homeHref = withLocale("/", locale);
  const supportHref = withLocale("/support", locale);
  const initialSlug = typeof sp.q === "string" ? sp.q : undefined;

  const categories = await getFaqPageData(locale);

  const allItems = categories.flatMap((cat) => cat.items);
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: allItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: stripMarkdownForSchema(item.answer),
      },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteOrigin}/${locale}` },
      { "@type": "ListItem", position: 2, name: "FAQ", item: `${siteOrigin}/${locale}/faq` },
    ],
  };

  return (
    <>
      <JsonLdScript data={faqJsonLd} />
      <JsonLdScript data={breadcrumbJsonLd} />

      <main className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={homeHref}>Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>FAQ</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">FAQ</h1>
          <p className="leading-relaxed text-muted-foreground">{meta.intro}</p>
        </div>

        <div className="mt-10">
          <FaqContent categories={categories} locale={locale} initialSlug={initialSlug} />
        </div>

        <div className="mt-12 rounded-xl border bg-muted/30 p-6 text-center">
          <p className="mb-4 text-muted-foreground">
            {locale === "zh-CN"
              ? "还有其他问题？我们随时为您服务。"
              : "Still have questions? We're here to help."}
          </p>
          <Button asChild>
            <Link href={supportHref}>{meta.cta}</Link>
          </Button>
        </div>
      </main>
    </>
  );
}
