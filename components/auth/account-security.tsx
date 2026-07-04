"use client";

import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { authCallbackUrl } from "@/lib/site-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withLocale } from "@/lib/i18n/routing";
import { useI18n } from "@/lib/i18n/use-i18n";

type Props = {
  email: string;
  googleLinked: boolean;
};

/**
 * Password + Google identity controls for the customer profile page.
 * Uses the signed-in session (updateUser / linkIdentity / resetPasswordForEmail).
 */
export function AccountSecurity({ email, googleLinked: initialGoogleLinked }: Props) {
  const { locale } = useI18n();
  const passwordId = useId();
  const confirmId = useId();

  const [googleLinked, setGoogleLinked] = useState(initialGoogleLinked);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState<"password" | "reset" | "google" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGoogleLinked(initialGoogleLinked);
  }, [initialGoogleLinked]);

  const accountPath = withLocale("/account", locale);

  const setNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading("password");
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(null);
    if (err) {
      setError(err.message);
      return;
    }
    setPassword("");
    setConfirm("");
    setMessage("Password updated.");
  };

  const sendResetEmail = async () => {
    setError(null);
    setMessage(null);
    setLoading("reset");
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authCallbackUrl(accountPath),
    });
    setLoading(null);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage(`Password reset link sent to ${email}.`);
  };

  const linkGoogle = async () => {
    setError(null);
    setMessage(null);
    setLoading("google");
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: authCallbackUrl(accountPath) },
    });
    if (err) {
      setError(err.message);
      setLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Password</h2>
          <p className="text-sm text-muted-foreground">
            Set a password for email sign-in, or email yourself a reset link.
          </p>
        </div>
        <form onSubmit={setNewPassword} className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1.5">
            <Label htmlFor={passwordId}>New password</Label>
            <Input
              id={passwordId}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading !== null}
              minLength={8}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={confirmId}>Confirm password</Label>
            <Input
              id={confirmId}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading !== null}
              minLength={8}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={loading !== null || !password || !confirm}>
              {loading === "password" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save password
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={sendResetEmail}
              disabled={loading !== null}
            >
              {loading === "reset" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Email reset link
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Connected accounts</h2>
          <p className="text-sm text-muted-foreground">
            Link Google so you can sign in with either method.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div>
            <p className="font-medium">Google</p>
            <p className="text-sm text-muted-foreground">
              {googleLinked ? "Connected" : "Not connected"}
            </p>
          </div>
          {googleLinked ? (
            <Button type="button" variant="secondary" size="sm" disabled>
              Linked
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={linkGoogle}
              disabled={loading !== null}
            >
              {loading === "google" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Link Google
            </Button>
          )}
        </div>
      </section>

      {message ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
