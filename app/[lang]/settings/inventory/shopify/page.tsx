import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ShopifyAdminRedirect({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(`/${lang}/settings/integrations/shopify`);
}
