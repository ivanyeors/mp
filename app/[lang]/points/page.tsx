import Link from "next/link";
import type { Metadata } from "next";

import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { readPointsSettings } from "@/lib/points/server";
import { POINTS_DEFAULTS, pointsLive } from "@/lib/points/settings";
import { POINTS_TERMS_UPDATED, pointsTermsSections } from "@/lib/points/terms";
import { englishOnlyPageMetadata } from "@/lib/seo/page-meta";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  return englishOnlyPageMetadata("points", (await params).lang);
}

/**
 * The points terms (PRD-loyalty-points slice 08). Linked from checkout, the
 * Profile's Points card, every points email and the footer. The numbers come
 * from the live settings; if they cannot be read, the seeded defaults stand in.
 */
export default async function PointsTermsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const settings = await readPointsSettings(supabaseAdmin()).catch(() => POINTS_DEFAULTS);
  const sections = pointsTermsSections(settings);
  const live = pointsLive(settings);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Mpillow Points</h1>
        <p className="text-sm text-muted-foreground">Last updated: {POINTS_TERMS_UPDATED}</p>
        <p className="leading-relaxed text-muted-foreground">
          Points are our thank-you for shopping with us: you earn them on what you pay, and use them as
          money off a later shop order. These are the rules.
        </p>
        {!live ? (
          <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Points are coming soon. These are the rules that will apply.
          </p>
        ) : null}
      </div>

      <div className="mt-10 max-w-none space-y-8 text-foreground">
        {sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
            {section.paragraphs.map((p) => (
              <p key={p} className="leading-relaxed text-muted-foreground">
                {p}
              </p>
            ))}
          </section>
        ))}

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">Your points</h2>
          <p className="leading-relaxed text-muted-foreground">
            Your balance, the points on their way and the date they expire are on your{" "}
            <Link href={withLocale("/account", locale)} className="underline underline-offset-4">
              account
            </Link>
            . These terms sit alongside our{" "}
            <Link href={withLocale("/terms-of-service", locale)} className="underline underline-offset-4">
              Terms of Service
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
