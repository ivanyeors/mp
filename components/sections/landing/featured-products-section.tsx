import type { LandingSection } from "@/lib/types/landing-sections";
import type { FeaturedProductsContent } from "@/lib/types/landing-sections";
import { ProductCard } from "@/components/shop/product-card";
import { getFeaturedProducts } from "@/lib/ecommerce/products";

interface FeaturedProductsSectionProps {
  section: LandingSection;
  locale: string;
}

/**
 * Read on the server: the admin `GET /api/shop/products` is staff-only, and this
 * section renders on the public landing page.
 */
export async function FeaturedProductsSection({ section, locale }: FeaturedProductsSectionProps) {
  const content = section.content as FeaturedProductsContent;
  const products = await getFeaturedProducts(content.limit ?? 4);

  if (products.length === 0) return null;

  return (
    <section className="py-12 md:py-20">
      <div className="mx-auto max-w-6xl px-4">
        {(content.title || content.subtitle) && (
          <div className="mb-8 text-center md:mb-12">
            {content.title && (
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                {content.title}
              </h2>
            )}
            {content.subtitle && (
              <p className="mt-2 text-muted-foreground">{content.subtitle}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 md:gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} locale={locale} />
          ))}
        </div>
      </div>
    </section>
  );
}
