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

export function AccountSecurity({ googleLinked }: Props) {
  const { locale } = useI18n();

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
