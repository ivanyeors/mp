import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { supabaseAdmin } from "@/lib/supabase/server";
import { readMarketingEmailState } from "@/lib/marketing-consent/consent";
import { UNSUBSCRIBE_ROUTE, verifyUnsubscribeLink } from "@/lib/marketing-consent/unsubscribe";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";
import { Button } from "@/components/ui/button";
import { UnsubscribeLinkReasonQuestion } from "@/components/marketing/unsubscribe-reason-question";
import { readUnsubscribeQuestion } from "@/lib/marketing-consent/unsubscribe-reasons-server";
import { unsubscribeAskOrder } from "@/lib/marketing-consent/unsubscribe-reasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ lang }, query] = await Promise.all([params, searchParams]);
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const u = typeof query.u === "string" ? query.u : null;
  const t = typeof query.t === "string" ? query.t : null;
  const s = typeof query.s === "string" ? query.s : null;

  let state: MarketingEmailState | "invalid" | "error" = "invalid";
  let ask = false;
  const link = verifyUnsubscribeLink(u, t, s);
  if (link) {
    state = await readMarketingEmailState(supabaseAdmin(), link.customerId)
      .then((s) => s ?? "unsubscribed")
      .catch(() => "error" as const);
    if (state === "unsubscribed") {
      ask = (await readUnsubscribeQuestion(supabaseAdmin(), link.customerId).catch(() => null)) === "ask";
    }
  }

  const accountHref = withLocale("/account", locale);
  const supportHref = withLocale("/support", locale);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col justify-center gap-4 px-4 py-12">
      {state === "unsubscribed" ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">You&apos;re unsubscribed</h1>
          <p className="leading-relaxed text-muted-foreground">
            Mpillow will not send you news or offers by email. Emails about your orders, your
            customisations and your appointments still arrive, because they are about something you
            asked for.
          </p>
          <p className="text-sm text-muted-foreground">
            Changed your mind? Turn &ldquo;Email me news and offers&rdquo; back on in{" "}
            <Link href={accountHref} className="underline underline-offset-4">
              your account
            </Link>
            .
          </p>
          {ask && u && t ? <UnsubscribeLinkReasonQuestion order={unsubscribeAskOrder()} u={u} t={t} s={s} /> : null}
        </>
      ) : state === "subscribed" || state === "not_subscribed" ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Unsubscribe from news and offers?</h1>
          <p className="leading-relaxed text-muted-foreground">
            Mpillow will stop sending you marketing email. Emails about your orders, your
            customisations and your appointments are not affected.
          </p>
          <form method="post" action={UNSUBSCRIBE_ROUTE}>
            <input type="hidden" name="u" value={u ?? ""} />
            <input type="hidden" name="t" value={t ?? ""} />
            {s ? <input type="hidden" name="s" value={s} /> : null}
            <input type="hidden" name="lang" value={locale} />
            <input type="hidden" name="via" value="page" />
            <Button type="submit" className="w-full sm:w-auto">
              Unsubscribe
            </Button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">
            {state === "error" ? "Something went wrong" : "This link is not valid"}
          </h1>
          <p className="leading-relaxed text-muted-foreground">
            {state === "error"
              ? "We could not open your email preferences just now. Please try the link again in a minute."
              : "It may have been cut short when it was copied. Use the unsubscribe link in the email itself."}
          </p>
          <p className="text-sm text-muted-foreground">
            You can also turn marketing email off in{" "}
            <Link href={accountHref} className="underline underline-offset-4">
              your account
            </Link>
            , or{" "}
            <Link href={supportHref} className="underline underline-offset-4">
              ask us
            </Link>{" "}
            to.
          </p>
        </>
      )}
    </main>
  );
}
