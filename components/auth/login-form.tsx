"use client";

import { useEffect, useId, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { authCallbackUrl } from "@/lib/site-url";
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

  // Prefill can arrive after async Result load.
  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

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
    window.location.assign(nextPath); // keep spinner; navigating away
  };

  if (sent) {
    return (
      <div className="space-y-4">
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
              onChange={(e) => setCode(e.target.value)}
              disabled={loading !== null}
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

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <button
          type="button"
          onClick={() => void requestOtp()}
          disabled={loading !== null}
          className="w-full text-sm text-muted-foreground underline underline-offset-4 disabled:opacity-50"
        >
          Resend code
        </button>
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
