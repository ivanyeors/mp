import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGrid } from "@/components/shop/product-grid";
import { ShopFilters } from "@/components/shop/shop-filters";
import { ShopSearchForm, ShopClearFilters } from "@/components/shop/shop-search-form";
import { getProducts } from "@/lib/ecommerce/products";
import { getReviewAggregates } from "@/lib/seo/review-aggregate";
import { getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

const PAGE_SIZE = 20;

interface ShopPageProps {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ShopPage({ params, searchParams }: ShopPageProps) {
  const { lang } = await params;
  const sp = await searchParams;

  const category = (sp.category as string) ?? "";
  const sort = (sp.sort as string) ?? "newest";
  const search = (sp.search as string) ?? "";
  const page = parseInt((sp.page as string) ?? "1", 10);

  const m = getMessages(lang as Locale);

  const { products, total } = await getProducts({
      status: "active",
      category_id: category || undefined,
      sort,
      search: search || undefined,
      page,
      limit: PAGE_SIZE,
    });

  const accessoryIds = products
    .filter((p) => p.product_type === "accessory" || p.product_type === "bundle")
    .map((p) => p.id);
  const reviewAggregates = await getReviewAggregates(accessoryIds);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!(category || search || sort !== "newest");

  return (
    <div className="container mx-auto max-w-7xl space-y-8 px-4 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{m.shop.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} {total === 1 ? "product" : "products"}
          </p>
        </div>

        <ShopSearchForm
          placeholder={m.shop.searchPlaceholder}
        />
      </div>

      {/* Filters */}
      <ShopFilters sort={sort} />

      {/* Product grid / empty state */}
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <p className="text-xl font-medium text-muted-foreground">
            {m.shop.noProducts}
          </p>
          <ShopClearFilters label={m.shop.filters.clear} hasFilters={hasFilters} />
        </div>
      ) : (
        <ProductGrid>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              locale={lang}
              reviewAggregate={reviewAggregates[product.id]}
            />
          ))}
        </ProductGrid>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-4">
          {page > 1 ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`?${buildPaginationParams(sp, page - 1)}`}>
                Previous
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`?${buildPaginationParams(sp, page + 1)}`}>
                Next
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function buildPaginationParams(
  current: { [key: string]: string | string[] | undefined },
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (key === "page") continue;
    if (typeof value === "string") params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  return params.toString();
}
