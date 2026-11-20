import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmEmailLink } from "@/lib/auth/sign-in-actions";
import { readEmailLink, readSignInIntent, signInErrorPath } from "@/lib/auth/sign-in-intent";
import { getSiteOrigin } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Finish signing in | Mpillow",
  robots: { index: false, follow: false },
};

export default async function ConfirmSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (typeof value === "string") query.set(k, value);
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origins = [getSiteOrigin(), ...(host ? [`${h.get("x-forwarded-proto") ?? "https"}://${host}`] : [])];
  const link = readEmailLink(query, origins);

  if (!link) {
    const back = signInErrorPath(readSignInIntent(query), "link_expired");
    return (
      <Shell title="This link is incomplete">
        <p className="text-sm text-muted-foreground">
          Part of the link is missing, which happens when an email app shortens it. Use the 6-digit code from the same
          email, or ask for a new one.
        </p>
        <Button asChild className="w-full">
          <Link href={back}>Back to sign in</Link>
        </Button>
      </Shell>
    );
  }

  const { intent } = link;
  const staff = intent.audience === "staff";
  return (
    <Shell title={staff ? "Open the Admin Panel" : "Finish signing in"}>
      <p className="text-sm text-muted-foreground">
        {staff
          ? "One more click to sign in to the Admin Panel."
          : intent.consent === "newsletter"
            ? "One more click confirms your email and signs you up for our emails."
            : "One more click confirms your email and signs you in. New here? This creates your account."}
      </p>
      <form action={confirmEmailLink} className="space-y-3">
        <input type="hidden" name="token_hash" value={link.tokenHash} />
        <input type="hidden" name="type" value={link.type} />
        <input type="hidden" name="next" value={intent.next} />
        <input type="hidden" name="as" value={intent.audience} />
        <input type="hidden" name="lang" value={intent.locale} />
        {intent.consent ? <input type="hidden" name="consent" value={intent.consent} /> : null}
        <Button type="submit" className="w-full">
          {staff ? "Sign in to the Admin Panel" : "Continue"}
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="space-y-4 rounded-lg border p-6 text-center">
        <MailCheck className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  );
}
