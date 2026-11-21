import { redirect } from "next/navigation";
import { invalidateTag } from "@/lib/cache/invalidate";
import { assertAdmin, requireAdminPage } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { Button } from "@/components/ui/button";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function HidePartnerListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ partner?: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("partners", locale);

  const { partner: partnerId } = await searchParams;
  if (!partnerId || !UUID_RE.test(partnerId)) {
    return <Shell title="Invalid link" body="This hide link is missing or malformed." />;
  }

  const { data: partner } = await supabaseAdmin()
    .from("partners")
    .select("name, visible")
    .eq("id", partnerId)
    .maybeSingle();

  if (!partner) {
    return <Shell title="Listing not found" body="No partner matches this link." />;
  }
  if (partner.visible === false) {
    return (
      <Shell
        title="Already hidden"
        body={`“${partner.name}” is already hidden from the public partners page.`}
      />
    );
  }

  async function hide() {
    "use server";
    await assertAdmin("partners");
    if (!partnerId || !UUID_RE.test(partnerId)) return;
    await supabaseAdmin().from("partners").update({ visible: false }).eq("id", partnerId);
    invalidateTag("locations");
    redirect(withLocale("/settings/partners", locale));
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Hide partner listing?</h1>
      <p className="text-sm text-muted-foreground">
        This hides <strong>{partner.name}</strong> from the public partners page. You can make it
        visible again anytime in Partners.
      </p>
      <form action={hide}>
        <Button type="submit" variant="destructive" className="w-full">
          Hide this listing
        </Button>
      </form>
    </div>
  );
}

function Shell({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
