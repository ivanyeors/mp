"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ShopSearchFormProps {
  placeholder: string;
}

export function ShopSearchForm({ placeholder }: ShopSearchFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");

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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ search: searchInput || null });
  };

  return (
    <form
      onSubmit={handleSearchSubmit}
      className="flex gap-2 w-full sm:w-auto sm:max-w-xs"
    >
      <Input
        type="search"
        placeholder={placeholder}
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="flex-1"
      />
      <Button type="submit" variant="secondary" size="sm">
        Search
      </Button>
    </form>
  );
}

export function ShopClearFilters({
  label,
  hasFilters,
}: {
  label: string;
  hasFilters: boolean;
}) {
  const router = useRouter();

  if (!hasFilters) return null;

  return (
    <Button variant="outline" onClick={() => router.push("?")}>
      {label}
    </Button>
  );
}
