import Link from "next/link";

import { PageFaqAccordion } from "@/components/page-faq/page-faq-accordion";
import { JsonLdScript } from "@/components/seo/json-ld-script";
import { getPageFaq, stripMarkdownForSchema } from "@/lib/page-faq";
import { buildFaqPageJsonLd } from "@/lib/seo";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

export type PageFaqSectionItem = {
  id: string;
  slug: string;
  question: string;
  answer: string;
};

const VIEW_ALL: Record<Locale, string> = {
  "en-US": "View all FAQs",
  "zh-CN": "查看全部常见问题",
};

/** Presentational: null when empty. Used by server fetch wrapper + self-check. */
export function PageFaqSectionView({
  title,
  items,
  locale,
  withJsonLd = true,
}: {
  title: string;
  items: PageFaqSectionItem[];
  locale: Locale;
  /** Set false when parent already emits FAQPage JSON-LD (e.g. PDP server page). */
  withJsonLd?: boolean;
}) {
  if (items.length === 0) return null;

  const jsonLd = withJsonLd
    ? buildFaqPageJsonLd(
        items.map((item) => ({
          question: item.question,
          answer: stripMarkdownForSchema(item.answer),
        }))
      )
    : null;

  return (
    <>
      {jsonLd ? <JsonLdScript data={jsonLd} /> : null}
      <section className="relative" data-page-faq="">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
            <Link
              href={withLocale("/faq", locale)}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {VIEW_ALL[locale]}
            </Link>
          </div>
          <PageFaqAccordion items={items} locale={locale} />
        </div>
      </section>
    </>
  );
}

/** Public embed: loads Page FAQ for surface; hides entirely when no visible items. */
export async function PageFaqSection({
  surfaceKey,
  locale,
}: {
  surfaceKey: string;
  locale: Locale;
}) {
  const set = await getPageFaq(surfaceKey, locale);
  if (!set?.items.length) return null;
  return <PageFaqSectionView title={set.title} items={set.items} locale={locale} />;
}
