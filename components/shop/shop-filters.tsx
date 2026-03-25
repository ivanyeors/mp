"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ProductCategory } from "@/lib/types/ecommerce";

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name_asc", label: "Name A–Z" },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

interface ShopFiltersProps {
  categories: ProductCategory[];
  selectedCategory?: string;
  sort: string;
  onCategoryChange: (id: string) => void;
  onSortChange: (sort: string) => void;
  locale?: string;
}

export function ShopFilters({
  categories,
  selectedCategory,
  sort,
  onCategoryChange,
  onSortChange,
  locale = "en-US",
}: ShopFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Category pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
        {/* "All" pill */}
        <button
          type="button"
          onClick={() => onCategoryChange("")}
          className={cn(
            "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
            !selectedCategory
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-foreground border-border hover:bg-accent hover:text-accent-foreground"
          )}
        >
          All
        </button>

        {categories.map((cat) => {
          const label =
            cat.content?.[locale]?.name ??
            cat.content?.["en-US"]?.name ??
            cat.slug;
          const isSelected = selectedCategory === cat.id;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onCategoryChange(cat.id)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
                isSelected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Sort dropdown */}
      <div className="shrink-0">
        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger className="min-w-[10rem]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
