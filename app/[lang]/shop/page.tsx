"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGrid } from "@/components/shop/product-grid";
import { ShopFilters } from "@/components/shop/shop-filters";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { Product, ProductCategory } from "@/lib/types/ecommerce";

const PAGE_SIZE = 20;

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-muted animate-pulse aspect-[3/4]" />
      ))}
    </div>
  );
}

export default function ShopPage() {
  const { m } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Derive filter state from URL
  const category = searchParams.get("category") ?? "";
  const sort = searchParams.get("sort") ?? "newest";
  const search = searchParams.get("search") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(search);

  // Update URL params helper — resets to page 1 unless explicitly setting page
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      if (!("page" in updates)) {
        params.delete("page");
      }
      router.push(`?${params.toString()}`);
    },
    [searchParams, router]
  );

  // Fetch categories once on mount
  useEffect(() => {
    fetch("/api/shop/categories")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setCategories(data.rows ?? []);
      })
      .catch(() => {});
  }, []);

  // Fetch products when filter params change
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("status", "active");
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    if (category) params.set("category_id", category);
    if (sort) params.set("sort", sort);
    if (search) params.set("search", search);

    fetch(`/api/shop/products?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setProducts(data.rows ?? []);
          setTotal(data.total ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category, sort, search, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ search: searchInput || null });
  };

  const handleClearFilters = () => {
    setSearchInput("");
    router.push("?");
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!(category || search || sort !== "newest");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{m.shop.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? m.shop.subtitle
              : `${total} ${total === 1 ? "product" : "products"}`}
          </p>
        </div>

        {/* Search */}
        <form
          onSubmit={handleSearchSubmit}
          className="flex gap-2 w-full sm:w-auto sm:max-w-xs"
        >
          <Input
            type="search"
            placeholder={m.shop.searchPlaceholder}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>
      </div>

      {/* Filters */}
      <ShopFilters
        categories={categories}
        selectedCategory={category}
        sort={sort}
        onCategoryChange={(val) => updateParams({ category: val || null })}
        onSortChange={(val) => updateParams({ sort: val })}
      />

      {/* Product grid / states */}
      {loading ? (
        <SkeletonGrid />
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <p className="text-xl font-medium text-muted-foreground">
            {m.shop.noProducts}
          </p>
          {hasFilters && (
            <Button variant="outline" onClick={handleClearFilters}>
              {m.shop.filters.clear}
            </Button>
          )}
        </div>
      ) : (
        <ProductGrid>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </ProductGrid>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
