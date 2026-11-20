import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EasyshipAdminRedirect({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(`/${lang}/settings/shipping/couriers`);
}
