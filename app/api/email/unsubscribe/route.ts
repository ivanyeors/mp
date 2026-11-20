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
  verifyUnsubscribeLink,
} from "@/lib/marketing-consent/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readForm(req: Request): Promise<FormData | null> {
  const type = req.headers.get("content-type") ?? "";
  if (!/application\/x-www-form-urlencoded|multipart\/form-data/i.test(type)) return null;
  return req.formData().catch(() => null);
}

const field = (form: FormData | null, key: string): string | null => {
  const value = form?.get(key);
  return typeof value === "string" ? value : null;
};

function pageUrl(req: Request, lang: string | null, u: string | null, t: string | null, s: string | null): URL {
  const locale = lang && isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const url = new URL(withLocale(UNSUBSCRIBE_PAGE, locale), req.url);
  if (u) url.searchParams.set("u", u);
  if (t) url.searchParams.set("t", t);
  if (s) url.searchParams.set("s", s);
  return url;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return NextResponse.redirect(
    pageUrl(req, null, searchParams.get("u"), searchParams.get("t"), searchParams.get("s")),
    303,
  );
}

export async function POST(req: Request) {
  if (!unsubscribeConfigured()) {
    return NextResponse.json({ ok: false, error: NOT_CONFIGURED }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const form = await readForm(req);
  const u = searchParams.get("u") ?? field(form, "u");
  const t = searchParams.get("t") ?? field(form, "t");
  const s = searchParams.get("s") ?? field(form, "s");
  const link = verifyUnsubscribeLink(u, t, s);
  if (!link) {
    return NextResponse.json({ ok: false, error: INVALID_LINK }, { status: 400 });
  }

  const result = await setMarketingEmail(supabaseAdmin(), {
    customerId: link.customerId,
    to: "unsubscribed",
    source: "unsubscribe_link",
    campaignSendId: link.sendId,
  });
  if (!result.ok && !result.notFound) {
    console.error("[unsubscribe] set_marketing_email failed:", result.error);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }

  if (field(form, "via") === "page") {
    return NextResponse.redirect(pageUrl(req, field(form, "lang"), u, t, s), 303);
  }
  return NextResponse.json({ ok: true });
}
