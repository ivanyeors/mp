"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useState } from "react";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";

interface BlogFiltersProps {
    availableLabels: string[];
}

export function BlogFilters({ availableLabels }: BlogFiltersProps) {
    const router = useRouter();
    const pathname = usePathname() ?? "";
    const searchParams = useSearchParams();

    const urlQuery = searchParams?.get("q") ?? "";
    const activeLabel = searchParams?.get("label");

    const [query, setQuery] = useState(urlQuery);
    // When ?q= changes to something the box did not send (Back, Forward, a
    // link), the box follows it. The URL catching up with what the box sent
    // leaves anything typed since alone.
    const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
    const [sent, setSent] = useState(urlQuery);
    if (urlQuery !== seenUrlQuery) {
        setSeenUrlQuery(urlQuery);
        if (urlQuery !== sent) {
            setSent(urlQuery);
            setQuery(urlQuery);
        }
    }

    const go = (q: string, label: string | null | undefined) => {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        if (q) params.set("q", q);
        else params.delete("q");
        if (label) params.set("label", label);
        else params.delete("label");
        setSent(q);
        if (params.toString() !== (searchParams?.toString() ?? "")) {
            router.push(`${pathname}?${params.toString()}`);
        }
    };

    const pushQuery = useDebouncedCallback((q: string) => go(q, activeLabel), 300);

    const toggleLabel = (label: string) => {
        // A search still waiting to be written goes with the label, not after it.
        pushQuery.cancel();
        go(query, activeLabel === label ? null : label);
    };

    return (
        <div className="flex flex-col gap-6 mb-12">
            {/* Search Bar */}
            <div className="relative max-w-md mx-auto w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        pushQuery(e.target.value);
                    }}
                    className="block w-full pl-10 pr-3 py-2 border border-input rounded-full bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm shadow-sm"
                    placeholder="Search articles..."
                />
            </div>

            {/* Labels Filter */}
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
