import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { setMarketingEmail } from "@/lib/marketing-consent/consent";
import {
  INVALID_LINK,
  NOT_CONFIGURED,
  UNSUBSCRIBE_PAGE,
  unsubscribeConfigured,
  verifyUnsubscribeToken,
} from "@/lib/marketing-consent/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe (PRD-shopify-customer-migration slice 07; RFC 8058).
 *
 * POST takes two callers, both carrying the signed link `?u=<customer>&t=<token>`
 * (in the query, or as form fields):
 *  - a mail client's one-click POST, body `List-Unsubscribe=One-Click`:
 *    answered `200 { ok: true }`;
 *  - the confirm page's button (form field `via=page`): answered `303` back to
 *    that page, which now says they are unsubscribed.
 * Either sets `unsubscribed` with source `unsubscribe_link` and writes one
 * event, and a second POST changes nothing. A link that does not verify is
 * `400 { error: "invalid_link" }` and changes nothing; that answer to an empty
 * POST is also how a campaign sender checks the route is live
 * (`probeUnsubscribeRoute`).
 *
 * GET never changes anything, because link scanners prefetch: a person who
 * opens the `List-Unsubscribe` URL in a browser lands on the confirm page.
 *
 * Unsubscribing stops marketing email only. Order, Result and aftercare email
 * is transactional and continues (ADR 0028 i).
 */

async function readForm(req: Request): Promise<FormData | null> {
  const type = req.headers.get("content-type") ?? "";
  if (!/application\/x-www-form-urlencoded|multipart\/form-data/i.test(type)) return null;
  return req.formData().catch(() => null);
}

const field = (form: FormData | null, key: string): string | null => {
  const value = form?.get(key);
  return typeof value === "string" ? value : null;
};

function pageUrl(req: Request, lang: string | null, u: string | null, t: string | null): URL {
  const locale = lang && isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const url = new URL(withLocale(UNSUBSCRIBE_PAGE, locale), req.url);
  if (u) url.searchParams.set("u", u);
  if (t) url.searchParams.set("t", t);
  return url;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return NextResponse.redirect(pageUrl(req, null, searchParams.get("u"), searchParams.get("t")), 303);
}

export async function POST(req: Request) {
  if (!unsubscribeConfigured()) {
    return NextResponse.json({ ok: false, error: NOT_CONFIGURED }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const form = await readForm(req);
  const u = searchParams.get("u") ?? field(form, "u");
  const t = searchParams.get("t") ?? field(form, "t");
  if (!verifyUnsubscribeToken(u, t)) {
    return NextResponse.json({ ok: false, error: INVALID_LINK }, { status: 400 });
  }

  const result = await setMarketingEmail(supabaseAdmin(), {
    customerId: u,
    to: "unsubscribed",
    source: "unsubscribe_link",
  });
  // A Customer since deleted is on no list: done, as far as the sender knows.
  if (!result.ok && !result.notFound) {
    console.error("[unsubscribe] set_marketing_email failed:", result.error);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }

  // The confirm page's button says so; any other POST is a mail client's
  // one-click, which RFC 8058 answers with a 2xx and no redirect.
  if (field(form, "via") === "page") {
    return NextResponse.redirect(pageUrl(req, field(form, "lang"), u, t), 303);
  }
  return NextResponse.json({ ok: true });
}
