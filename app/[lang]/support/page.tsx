import Link from "next/link";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

export default async function SupportPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const homeHref = withLocale("/", locale);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Support</h1>
        <p className="text-muted-foreground leading-relaxed">
          Need help? Reach out and we’ll get back to you.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            WhatsApp:{" "}
            <a
              className="underline underline-offset-4"
              href="http://wa.me/6587805311"
              target="_blank"
              rel="noopener noreferrer"
            >
              +65 8780 5311
            </a>
          </li>
          <li>
            Book an appointment:{" "}
            <a
              className="underline underline-offset-4"
              href="https://www.mpillow.com/pages/book-online"
              target="_blank"
              rel="noopener noreferrer"
            >
              mpillow.com
            </a>
          </li>
        </ul>
        <div className="pt-2">
          <Link href={homeHref} className="underline underline-offset-4">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

