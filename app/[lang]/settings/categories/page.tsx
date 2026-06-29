import { redirect } from "next/navigation";

// Categories are now managed inside the Products page (Categories tab).
export default async function CategoriesRedirect({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(`/${lang}/settings/products`);
}
