"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

interface BlogFiltersProps {
    availableLabels: string[];
}

export function BlogFilters({ availableLabels }: BlogFiltersProps) {
    const router = useRouter();
    const pathname = usePathname() ?? "";
    const searchParams = useSearchParams();

    const initialQuery = searchParams?.get("q") ?? "";
    const activeLabel = searchParams?.get("label");

    const [query, setQuery] = useState(initialQuery);
    const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 300);
        return () => clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        let changed = false;

        if (debouncedQuery) {
            if (params.get("q") !== debouncedQuery) {
                params.set("q", debouncedQuery);
                changed = true;
            }
        } else {
            if (params.has("q")) {
                params.delete("q");
                changed = true;
            }
        }

        if (changed) {
            router.push(`${pathname}?${params.toString()}`);
        }
    }, [debouncedQuery, pathname, router, searchParams]);

    const toggleLabel = (label: string) => {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        if (activeLabel === label) {
            params.delete("label");
        } else {
            params.set("label", label);
        }
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <div className="flex flex-col gap-6 mb-12">
            <div className="relative max-w-md mx-auto w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-input rounded-full bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm shadow-sm"
                    placeholder="Search articles..."
                />
            </div>

            {availableLabels.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                    {availableLabels.map((label) => {
                        const isActive = activeLabel === label;
                        return (
                            <button
                                key={label}
                                onClick={() => toggleLabel(label)}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${isActive
                                        ? "bg-primary text-primary-foreground shadow-md"
                                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground border border-transparent hover:border-border"
                                    }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
