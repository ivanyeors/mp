"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authCallbackUrl } from "@/lib/site-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { withLocale } from "@/lib/i18n/routing";
import { useI18n } from "@/lib/i18n/use-i18n";

type Props = {
  googleLinked: boolean;
};

/**
 * Connected-account controls for the customer profile page.
 *
 * Sign-in here is passwordless by design: Google OAuth, or an emailed magic
 * link / 6-digit code (see {@link ../auth/login-form.tsx}). This panel used to
 * offer "set a password" and "email a reset link" too, but nothing in the app
 * ever called `signInWithPassword`, so a password set here could not be used to
 * sign in — it was a credential with no door. Removed rather than completed:
 * OTP already covers the cross-device case Google doesn't.
 *
 * If password sign-in is ever wanted, it needs a field in `LoginForm` and
 * leaked-password protection turned on in Supabase, not just this panel back.
 */
export function AccountSecurity({ googleLinked }: Props) {
  const { locale } = useI18n();

  // No local mirror of `googleLinked`: a successful link navigates to Google and
  // the page re-renders from the server on the way back.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkGoogle = async () => {
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: authCallbackUrl(withLocale("/account", locale)) },
    });
    // On success the browser navigates to Google, so only failure lands here.
    if (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">How you sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We never ask for a password. Sign in with Google, or have us email
            you a link and a 6-digit code.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-5 sm:p-6">
          <div>
            <p className="font-medium">Google</p>
            <p className="text-sm text-muted-foreground">
              {googleLinked
                ? "Connected — you can sign in with one tap."
                : "Not connected — link it to skip the emailed code."}
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
              disabled={loading}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Link Google
            </Button>
          )}
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
