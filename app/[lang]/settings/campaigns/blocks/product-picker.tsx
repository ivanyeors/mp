"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CampaignProductCard } from "@/lib/email-campaigns/products";
import { findCampaignProducts } from "../actions";
import { ProductThumb } from "./products-field";

/**
 * The shop's Listed products to choose from (PRD-campaign-email-editor slice
 * 07), searched through the shop's own query and shown as the email will
 * show each: its photo, name and price. Products bought through the
 * configurator are not here; a *Customise* button covers them. Loaded with
 * the first products block or product button, not with the page.
 */

/** How long typing pauses before the shop is searched. */
const SEARCH_PAUSE_MS = 250;

type Found = { ok: true; products: CampaignProductCard[] } | { ok: false; error: string };

export function ProductPicker({
    onPick,
    chosen = [],
    title = "Choose a product",
    children,
}: {
    onPick: (product: CampaignProductCard) => void;
    /** Already in the block: shown, but not offered again. */
    chosen?: readonly string[];
    title?: string;
    /** The button that opens it. */
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [found, setFound] = useState<{ query: string; result: Found } | null>(null);

    useEffect(() => {
        if (!open) return;
        let live = true;
        const timer = setTimeout(() => {
            void findCampaignProducts(query)
                .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }))
                .then((result) => {
                    if (live) setFound({ query, result });
                });
        }, SEARCH_PAUSE_MS);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [open, query]);

    const result = found?.query === query ? found.result : null;
    const pick = (p: CampaignProductCard) => {
        onPick(p);
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>Products listed in the shop. The email shows each at the price the shop charges when it is sent.</DialogDescription>
                </DialogHeader>
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                        type="search"
                        aria-label="Search the shop"
                        placeholder="Search the shop"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-8"
                    />
                </div>
                <div className="min-h-40 overflow-y-auto" aria-busy={!result}>
                    {!result ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Searching the shop" />
                        </div>
                    ) : !result.ok ? (
                        <p className="py-6 text-center text-sm text-destructive">{result.error}</p>
                    ) : !result.products.length ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            {query.trim() ? "No product in the shop matches that." : "The shop has no product listed."}
                        </p>
                    ) : (
                        <ul className="grid gap-2 sm:grid-cols-2">
                            {result.products.map((p) => {
                                const taken = chosen.includes(p.id);
                                return (
                                    <li key={p.id}>
                                        <button
                                            type="button"
                                            disabled={taken}
                                            onClick={() => pick(p)}
                                            className="flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 max-md:min-h-11"
                                        >
                                            <ProductThumb url={p.photoUrl} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium">{p.title}</span>
                                                <span className="block text-xs text-muted-foreground">{taken ? "In this block already" : p.price}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
