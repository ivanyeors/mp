import { redirect } from "next/navigation";

export default async function CategoriesRedirect({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(`/${lang}/settings/products`);
}
