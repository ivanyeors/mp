"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { authCallbackUrl } from "@/lib/site-url";
import { safeNextPath } from "@/lib/auth/post-auth-redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Shared Supabase Auth login form (Google OAuth + email magic link).
 * Google is the primary CTA; `nextPath` controls the post-login destination.
 */
export function LoginForm({
  nextPath,
  initialEmail = "",
  submitLabel = "Email me a magic link",
}: {
  nextPath: string;
  /** Prefill email (e.g. from a Result hold submission). */
  initialEmail?: string;
  submitLabel?: string;
}) {
  const emailFieldId = useId();
  const codeFieldId = useId();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<"google" | "email" | "verify" | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const redirectTo = authCallbackUrl(nextPath);
    if (process.env.NODE_ENV === "development") {
      console.info("[auth] OAuth redirectTo:", redirectTo);
    }
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  };

  // One request yields BOTH a magic link (emailRedirectTo) and a 6-digit token
  // usable by verifyOtp. Used for the initial send and for "Resend code".
  const requestOtp = async () => {
    setError(null);
    setLoading("email");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authCallbackUrl(nextPath) },
    });
    setLoading(null);
    if (error) {
      setError(error.message);
      return;
    }
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
      setError(error.message);
      return;
    }
    // Same-origin guard mirrors the callback route's safeNext; keep spinner.
    window.location.assign(safeNextPath(nextPath, "/"));
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
            enter the code below.
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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
