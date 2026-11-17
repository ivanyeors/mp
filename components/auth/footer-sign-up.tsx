"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { authErrorMessage } from "@/lib/auth/error-message";
import { signInCallbackUrl } from "@/lib/auth/sign-in-intent";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getClientSiteOrigin } from "@/lib/site-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "Get our emails" in the site footer (PRD-campaign-audiences slice 03). The
 * sign-up is the Customer sign-in: the email gets the same link and 6-digit
 * code, and confirming either makes the account and records `newsletter`
 * consent on it. Nothing is stored until they confirm. After sending, it
 * opens Sign in at the code step; once confirmed they come back to this page.
 *
 * Someone signed in already has an address we know, so it renders nothing.
 */
export function FooterSignUp({ locale, returnTo }: { locale: Locale; returnTo: string }) {
  const fieldId = useId();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // Reads the session this browser holds; no request.
    createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (live) setSignedIn(Boolean(data.session));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (signedIn) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    setError(null);
    setLoading(true);
    const intent = { audience: "customer" as const, next: returnTo, locale, consent: "newsletter" as const };
    const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: signInCallbackUrl(getClientSiteOrigin(), intent) },
    });
    if (error) {
      setLoading(false);
      setError(authErrorMessage(error));
      return;
    }
    const q = new URLSearchParams({ as: "customer", sent: "1", consent: "newsletter", email: address, next: returnTo });
    router.push(`${withLocale("/account/login", locale)}?${q.toString()}`);
  };

  return (
    <form onSubmit={submit} className="space-y-2" aria-describedby={`${fieldId}-hint`}>
      <label htmlFor={fieldId} className="block text-base font-semibold">
        Get our emails
      </label>
      <p id={`${fieldId}-hint`} className="text-sm text-muted-foreground">
        Important updates, event invites and offers. No spam, unsubscribe anytime. We&apos;ll email you a link to
        confirm.
      </p>
      <div className="flex gap-2">
        <Input
          id={fieldId}
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          className="h-11 min-w-0 flex-1 bg-background"
        />
        <Button type="submit" className="h-11 shrink-0" disabled={loading || !email.trim()}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Sign up
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
