import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

/**
 * Product Builder is now the Product Visualize tab on Products. Old links land
 * there; the mappings / filling-visuals routes and Rules Engine stay under this path.
 */
export default async function ProductBuilderRedirect({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(withLocale("/settings/products?tab=visualize", isSupportedLocale(lang) ? lang : DEFAULT_LOCALE));
}
