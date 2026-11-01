"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { completeSignIn, type SignInOutcome } from "@/lib/auth/complete-sign-in";
import {
  readEmailLink,
  readSignInIntent,
  signInErrorPath,
  SIGN_UP_NOTICE_COOKIE,
  SIGN_UP_NOTICE_MAX_AGE,
} from "@/lib/auth/sign-in-intent";
import { getAuthUser } from "@/lib/auth/user";
import { setMarketingEmail } from "@/lib/marketing-consent/consent";
import { getCurrentCustomerId } from "@/lib/shop/customer-addresses";
import { getSiteOrigin } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";

/**
 * The two sign-in finishes that are not a redirect (PRD-campaign-audiences
 * slice 03): the 6-digit code, verified in the browser, and the scanner-safe
 * link, verified here when the person presses the button. Both end in
 * `completeSignIn`, as `/auth/callback` does.
 */

async function keepNotice(outcome: SignInOutcome) {
  if (!outcome.ok || !outcome.notice) return;
  (await cookies()).set(SIGN_UP_NOTICE_COOKIE, outcome.notice, {
    path: "/",
    maxAge: SIGN_UP_NOTICE_MAX_AGE,
    sameSite: "lax",
  });
}

/**
 * After the code: the browser holds the session; the intent is what the form
 * was asked for. Returns where to go.
 */
export async function finishSignIn(raw: Record<string, string | null | undefined>): Promise<{ destination: string }> {
  const intent = readSignInIntent(raw);
  const user = await getAuthUser();
  if (!user) return { destination: signInErrorPath(intent, "failed") };
  const outcome = await completeSignIn(user, intent);
  await keepNotice(outcome);
  return { destination: outcome.destination };
}

/**
 * The scanner-safe link's button. A mail filter that opens the link only
 * loads the page; the one-time token is spent here, by the person's click.
 */
export async function confirmEmailLink(form: FormData): Promise<void> {
  const query = new URLSearchParams();
  for (const key of ["token_hash", "type", "next", "as", "consent", "lang"]) {
    const v = form.get(key);
    if (typeof v === "string" && v) query.set(key, v);
  }
  const link = readEmailLink(query, [getSiteOrigin()]);
  if (!link) redirect(signInErrorPath(readSignInIntent(query), "link_expired"));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
  if (error || !data.user) {
    console.error("[auth/confirm] verify failed:", error?.message ?? "no user");
    redirect(signInErrorPath(link.intent, "link_expired"));
  }
  const outcome = await completeSignIn(data.user, link.intent);
  await keepNotice(outcome);
  redirect(outcome.destination);
}

/**
 * The notice's "Email me again", for someone who unsubscribed and has just
 * signed up in the footer: their own click, signed in, so it is recorded as
 * their Profile switch is (`account`), the only source that brings back
 * someone who left.
 */
export async function resubscribeMe(): Promise<{ ok: boolean }> {
  const customerId = await getCurrentCustomerId();
  if (!customerId) return { ok: false };
  const res = await setMarketingEmail(supabaseAdmin(), { customerId, to: "subscribed", source: "account" });
  return { ok: res.ok };
}
