import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Courier settings moved under Shipping. Keep the old path working.
export default async function EasyshipAdminRedirect({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(`/${lang}/settings/shipping/couriers`);
}
