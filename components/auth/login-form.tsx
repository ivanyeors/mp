"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { getClientSiteOrigin } from "@/lib/site-url";
import { safeNextPath } from "@/lib/auth/post-auth-redirect";
import { authErrorMessage } from "@/lib/auth/error-message";
import { finishSignIn } from "@/lib/auth/sign-in-actions";
import {
  audienceForPath,
  signInCallbackUrl,
  type SignInAudience,
  type SignInIntent,
  type SignUpConsent,
} from "@/lib/auth/sign-in-intent";
import { getLocaleOrDefault } from "@/lib/i18n/routing";
import { MARKETING_BOX_LABEL } from "@/lib/marketing-consent/state";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Shared Supabase Auth login form: Google, or an emailed link with a 6-digit
 * code. Signing in and signing up are the same steps; there is no password.
 *
 * Who it is for decides what happens after (lib/auth/sign-in-intent.ts):
 * `customer` (the default) makes their Customer and, with the box left
 * ticked, records `sign_in` consent once the address is proven; `staff` only
 * opens the Admin Panel; `partner` only opens the Partner Hub. The intent
 * rides in the link's return address, and the code step hands the same intent
 * to `finishSignIn`.
 */
export function LoginForm({
  nextPath,
  initialEmail = "",
  submitLabel = "Email me a sign-in link",
  audience: audienceProp,
  consentBox,
  consent: fixedConsent,
  initialSent = false,
  onStart,
}: {
  nextPath: string;
  /** Prefill email (e.g. from a Result hold submission). */
  initialEmail?: string;
  submitLabel?: string;
  /** Who is signing in; by default, read from `nextPath`. */
  audience?: SignInAudience;
  /** Customer only: show the marketing box, ticked by default. On by default for a customer. */
  consentBox?: boolean;
  /** Customer only: consent already asked for elsewhere (the footer's sign-up), in place of the box. */
  consent?: SignUpConsent;
  /** Open on the code step: the link was already sent (by the footer). */
  initialSent?: boolean;
  /** Called as a sign-in starts (Google or the email), e.g. to remember the tab. */
  onStart?: () => void;
}) {
  const emailFieldId = useId();
  const codeFieldId = useId();
  const audience = audienceProp ?? audienceForPath(nextPath);
  const showBox = audience === "customer" && !fixedConsent && consentBox !== false;
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<"google" | "email" | "verify" | null>(null);
  const [sent, setSent] = useState(initialSent && Boolean(initialEmail));
  const [error, setError] = useState<string | null>(null);
  // Ticked by default (owner decision 1); recorded only once the address is proven.
  const [boxTicked, setBoxTicked] = useState(true);
  // The intent the email was sent with: the code step finishes with the same one.
  const intentNow = (): SignInIntent => ({
    audience,
    next: nextPath,
    locale: getLocaleOrDefault(nextPath),
    consent: audience !== "customer" ? null : (fixedConsent ?? (showBox && boxTicked ? "sign_in" : null)),
  });
  const [sentIntent, setSentIntent] = useState<SignInIntent | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  // Set when leaving the code step, so the chooser lands the caret on the email.
  const focusEmailRef = useRef(false);
  // Whether we own a history entry for the code step (see the pushState effect).
  const pushedHistoryRef = useRef(false);

  // Prefill can arrive after async Result load.
  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  const leaveCodeStep = useCallback(() => {
    setCode("");
    setError(null);
    setSent(false);
  }, []);

  // The code step is a step, not a page. Give it its own history entry so the
  // phone's Back gesture returns to Google / the email field instead of
  // leaving the sign-in page entirely.
  useEffect(() => {
    if (!sent) return;
    window.history.pushState({ mpAuthStep: "code" }, "");
    pushedHistoryRef.current = true;
    const onPopState = () => {
      pushedHistoryRef.current = false;
      focusEmailRef.current = true;
      leaveCodeStep();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [sent, leaveCodeStep]);

  // In-page "back" pops our own entry when we pushed one, so the history stack
  // never keeps a dead entry that swallows the next Back press.
  const backToMethods = (focusEmail: boolean) => {
    focusEmailRef.current = focusEmail;
    if (pushedHistoryRef.current) {
      pushedHistoryRef.current = false;
      window.history.back(); // popstate handler clears the code step
      return;
    }
    leaveCodeStep();
  };

  useEffect(() => {
    if (sent || !focusEmailRef.current) return;
    focusEmailRef.current = false;
    emailInputRef.current?.focus();
    emailInputRef.current?.select();
  }, [sent]);

  const signInWithGoogle = async () => {
    setError(null);
    setLoading("google");
    onStart?.();
    const redirectTo = signInCallbackUrl(getClientSiteOrigin(), intentNow());
    if (process.env.NODE_ENV === "development") {
      console.info("[auth] OAuth redirectTo:", redirectTo);
    }
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setError(authErrorMessage(error));
      setLoading(null);
    }
  };

  // One request yields BOTH a magic link (emailRedirectTo) and a 6-digit token
  // usable by verifyOtp. Used for the initial send and for "Resend code".
  const requestOtp = async () => {
    setError(null);
    setLoading("email");
    onStart?.();
    // "Resend code" keeps the intent the first email was sent with.
    const intent = sent && sentIntent ? sentIntent : intentNow();
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: signInCallbackUrl(getClientSiteOrigin(), intent) },
    });
    setLoading(null);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    setSentIntent(intent);
    setSent(true);
  };

  const signInWithEmail = (e: React.FormEvent) => {
    e.preventDefault();
    void requestOtp();
  };

  // Cross-device alternative to clicking the link: verify the emailed code.
  // On success the browser client persists the session to cookies; a full-page
  // nav lets SSR read them and run existing per-destination role resolution.
  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading("verify");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setLoading(null);
      setError(authErrorMessage(error));
      return;
    }
    // The browser holds the session now; the server finishes as the link
    // would (the Staff check, the Customer, the consent). Keep the spinner.
    const intent = sentIntent ?? intentNow();
    let destination = safeNextPath(nextPath, "/");
    try {
      destination = (
        await finishSignIn({ next: intent.next, as: intent.audience, consent: intent.consent, lang: intent.locale })
      ).destination;
    } catch {
      // Signed in either way; the next account page links the Customer.
    }
    window.location.assign(safeNextPath(destination, "/"));
  };

  if (sent) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => backToMethods(false)}
          disabled={loading === "verify"}
          className="-ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-2 max-md:min-h-11 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to sign-in options
        </button>

        <div className="rounded-lg border p-6 text-center">
          <Mail className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Check your inbox</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We sent a sign-in link and a 6-digit code to{" "}
            <span className="font-medium">{email}</span>. Click the link, or
            enter the code below
            {(sentIntent?.consent ?? fixedConsent) === "newsletter"
              ? ", to confirm your email and join our list."
              : audience === "staff"
                ? ", to open the Admin Panel."
                : "."}
          </p>
        </div>

        <form onSubmit={verifyCode} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={codeFieldId}>
              Enter the 6-digit code from your email
            </Label>
            <Input
              id={codeFieldId}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                // A stale "token expired" line under a code they are retyping
                // reads as a fresh rejection; drop it as soon as they edit.
                if (error) setError(null);
              }}
              disabled={loading !== null}
              aria-invalid={error ? true : undefined}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={loading !== null || !code.trim()}
          >
            {loading === "verify" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Verify code
          </Button>
        </form>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => void requestOtp()}
            disabled={loading !== null}
            className="max-md:min-h-11 px-1 underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            {loading === "email" ? "Sending…" : "Resend code"}
          </button>
          <span aria-hidden="true">·</span>
          {/* The address is baked into the sent code, so a typo is only fixable
              by going back — make that its own affordance, not a guess. */}
          <button
            type="button"
            onClick={() => backToMethods(true)}
            disabled={loading === "verify"}
            className="max-md:min-h-11 px-1 underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        className="w-full"
        onClick={signInWithGoogle}
        disabled={loading !== null}
      >
        {loading === "google" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Continue with Google
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">or</span>
        </div>
      </div>

      <form onSubmit={signInWithEmail} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={emailFieldId}>Email</Label>
          <Input
            id={emailFieldId}
            ref={emailInputRef}
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading !== null}
            autoComplete="email"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          className="w-full"
          disabled={loading !== null || !email.trim()}
        >
          {loading === "email" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </form>

      {showBox ? (
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <Checkbox
            className="mt-0.5"
            checked={boxTicked}
            onCheckedChange={(checked) => setBoxTicked(checked === true)}
            disabled={loading !== null}
          />
          {MARKETING_BOX_LABEL}
        </label>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
