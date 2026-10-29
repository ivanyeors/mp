"use client";

import { useState } from "react";
import { ChevronRight, Globe, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COUNTRIES, REGIONS, findCountry, regionCodes, type Region } from "@/lib/shipping/countries";
import { cn } from "@/lib/utils";

/** Catalog order first, then any code outside the catalog, so the saved list reads the same every time. */
function ordered(codes: Set<string>): string[] {
    return [
        ...COUNTRIES.filter((c) => codes.has(c.code)).map((c) => c.code),
        ...[...codes].filter((c) => !findCountry(c)).sort(),
    ];
}

function Chip({ code, label, selected, onClick }: { code: string; label: string; selected: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            title={code}
            className={cn(
                "rounded border px-2 py-0.5 text-xs transition-colors max-md:min-h-11 max-md:px-3 max-md:text-sm",
                selected
                    ? "border-primary bg-primary text-primary-foreground active:bg-primary/80"
                    : "border-border bg-background hover:bg-muted active:bg-press",
            )}
        >
            {label}
        </button>
    );
}

/**
 * The countries a shipping method delivers to, by region. "Worldwide" picks every
 * country in the catalog; checkout then offers exactly the countries active
 * methods list.
 */
export function CountryPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
    const selected = new Set(value);
    const [query, setQuery] = useState("");
    // Regions with a country picked start open, so an edit shows what the method already covers.
    const [open, setOpen] = useState<Set<Region>>(
        () => new Set(REGIONS.filter((r) => regionCodes(r.key).some((c) => selected.has(c))).map((r) => r.key)),
    );

    const setMany = (codes: string[], on: boolean) => {
        const next = new Set(selected);
        for (const c of codes) {
            if (on) next.add(c);
            else next.delete(c);
        }
        onChange(ordered(next));
    };
    const toggle = (code: string) => setMany([code], !selected.has(code));
    const toggleOpen = (region: Region) =>
        setOpen((prev) => {
            const next = new Set(prev);
            if (next.has(region)) next.delete(region);
            else next.add(region);
            return next;
        });

    const q = query.trim().toLowerCase();
    const matches = q
        ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q)
        : [];
    const others = value.filter((c) => !findCountry(c));
    const worldwide = COUNTRIES.every((c) => selected.has(c.code));

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    {worldwide ? "Worldwide" : `${value.length} ${value.length === 1 ? "country" : "countries"}`}
                </p>
                <div className="flex gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={worldwide}
                        onClick={() => setMany(COUNTRIES.map((c) => c.code), true)}
                    >
                        <Globe className="mr-1.5 h-3.5 w-3.5" />
                        Worldwide
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={value.length === 0} onClick={() => onChange([])}>
                        Clear
                    </Button>
                </div>
            </div>

            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find a country"
                    aria-label="Find a country"
                    className="pl-8 text-base md:text-sm"
                />
            </div>

            {q ? (
                <div className="flex flex-wrap gap-1 max-md:gap-2">
                    {matches.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No country matches “{query.trim()}”.</p>
                    ) : (
                        matches.map((c) => (
                            <Chip key={c.code} code={c.code} label={c.name} selected={selected.has(c.code)} onClick={() => toggle(c.code)} />
                        ))
                    )}
                </div>
            ) : (
                <div className="divide-y rounded-lg border">
                    {REGIONS.map(({ key, label }) => {
                        const codes = regionCodes(key);
                        const count = codes.filter((c) => selected.has(c)).length;
                        const all = count === codes.length;
                        const isOpen = open.has(key);
                        return (
                            <div key={key}>
                                <div className="flex items-center gap-2 px-3 py-2 max-md:py-0">
                                    <button
                                        type="button"
                                        onClick={() => toggleOpen(key)}
                                        aria-expanded={isOpen}
                                        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left text-sm font-medium transition-colors max-md:min-h-11 active:bg-press"
                                    >
                                        <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-90")} />
                                        <span className="truncate">{label}</span>
                                        <span className="shrink-0 text-xs font-normal text-muted-foreground">
                                            {count}/{codes.length}
                                        </span>
                                    </button>
                                    <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs max-md:min-w-11" onClick={() => setMany(codes, !all)}>
                                        {all ? "None" : "All"}
                                    </Button>
                                </div>
                                {isOpen && (
                                    <div className="flex flex-wrap gap-1 px-3 pb-3 max-md:gap-2">
                                        {codes.map((code) => (
                                            <Chip
                                                key={code}
                                                code={code}
                                                label={findCountry(code)!.name}
                                                selected={selected.has(code)}
                                                onClick={() => toggle(code)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {others.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 max-md:gap-2">
                    <span className="text-xs text-muted-foreground">Not in the country list:</span>
                    {others.map((code) => (
                        <button
                            key={code}
                            type="button"
                            onClick={() => toggle(code)}
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs hover:bg-muted active:bg-press max-md:min-h-11 max-md:px-3"
                            aria-label={`Remove ${code}`}
                        >
                            {code}
                            <X className="h-3 w-3" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
