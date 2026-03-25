"use client";

import { useEffect, useState } from "react";
import type { LandingSection } from "@/lib/types/landing-sections";
import type { FeaturedProductsContent } from "@/lib/types/landing-sections";
import { ProductCard } from "@/components/shop/product-card";
import type { Product, ProductVariant } from "@/lib/types/ecommerce";

type ProductWithDetails = Product & {
  variants?: ProductVariant[];
  images?: { url: string; alt_text?: string | null }[];
};

interface FeaturedProductsSectionProps {
  section: LandingSection;
  locale: string;
}

export function FeaturedProductsSection({ section, locale }: FeaturedProductsSectionProps) {
  const content = section.content as FeaturedProductsContent;
  const limit = content.limit ?? 4;
  const [products, setProducts] = useState<ProductWithDetails[]>([]);

  useEffect(() => {
    fetch(`/api/shop/products?status=active&featured=true&limit=${limit}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setProducts(d.rows ?? []);
      })
      .catch(() => {});
  }, [limit]);

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
