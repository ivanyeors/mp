"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Shared Supabase Auth login form (Google OAuth + optional email magic link).
 * Used for both the customer account login and the staff settings login;
 * `nextPath` controls the post-login destination. Set `allowEmailLink={false}`
 * to render Google-only (used by the staff settings login).
 */
export function LoginForm({
  nextPath,
  allowEmailLink = true,
  initialEmail = "",
}: {
  nextPath: string;
  allowEmailLink?: boolean;
  /** Prefill email (e.g. from a Result hold submission). */
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState<"google" | "email" | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  const signInWithGoogle = async () => {
    setError(null);
    setLoading("google");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  };

  const signInWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading("email");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });
    setLoading(null);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  if (!allowEmailLink) {
    return (
      <div className="space-y-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={signInWithGoogle}
          disabled={loading !== null}
        >
          {loading === "google" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Continue with Google
        </Button>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  if (sent) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <Mail className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a sign-in link to <span className="font-medium">{email}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
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
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading !== null}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading !== null || !email.trim()}>
          {loading === "email" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Email me a magic link
        </Button>
      </form>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
