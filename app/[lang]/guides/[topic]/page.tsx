import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { buildPageMetadata, buildFaqPageJsonLd } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld-script";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getGuideContent, type GuideTopic } from "@/lib/seo/guides-content";

type Props = {
  params: Promise<{ lang: string; topic: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, topic } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const guide = getGuideContent(topic, locale);
  if (!guide) return { title: "Guide Not Found" };

  return buildPageMetadata({
    title: guide.metaTitle,
    description: guide.metaDescription,
    path: `/guides/${topic}`,
    lang: locale,
    keywords: guide.keywords,
  });
}

export function generateStaticParams() {
  return [
    { topic: "neck-pain" },
    { topic: "cervical-pillow" },
    { topic: "custom-pillow" },
  ];
}

export default async function GuideHubPage({ params }: Props) {
  const { lang, topic } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const guide = getGuideContent(topic as GuideTopic, locale);

  if (!guide) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Guide not found</h1>
      </div>
    );
  }

  const faqJsonLd = buildFaqPageJsonLd(guide.faqs);

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <JsonLdScript data={faqJsonLd} />
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{guide.h1}</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{guide.answerLede}</p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Related reading</h2>
        <ul className="mt-4 space-y-2">
          {guide.links.map((link) => (
            <li key={link.href}>
              <Link href={withLocale(link.href, locale)} className="text-primary hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Common questions</h2>
        <dl className="mt-4 space-y-6">
          {guide.faqs.map((faq) => (
            <div key={faq.question}>
              <dt className="font-medium">{faq.question}</dt>
              <dd className="mt-1 text-muted-foreground">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild>
          <Link href={withLocale(guide.ctaHref, locale)}>{guide.ctaLabel}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={withLocale("/faq", locale)}>View all FAQs</Link>
        </Button>
      </div>
    </article>
  );
}
