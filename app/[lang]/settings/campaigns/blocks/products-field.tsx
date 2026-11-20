"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { Loader2, Package, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTENT_LIMITS, CONTENT_PLACEHOLDERS, type ProductLayout } from "@/lib/email-campaigns/content";
import type { CampaignProductCard } from "@/lib/email-campaigns/products";
import { cn } from "@/lib/utils";
import { describeCampaignProducts } from "../actions";

/**
 * The products a campaign names (PRD-campaign-email-editor slice 07), as the
 * email will show them: each one's photo, name and price, read from the shop,
 * never typed. A product no longer Listed says so, by name, as the send
 * checks will. Shared by the products block and a button that goes to a
 * product.
 */

// The picker loads with the first products block or product button, not with the page.
const ProductPicker = lazy(() => import("./product-picker").then((m) => ({ default: m.ProductPicker })));

type Described = { ok: true; card: CampaignProductCard } | { ok: false; error: string };

/** Each product's card, asked for once while the page is open; a failure is asked again next time. */
const described = new Map<string, Promise<Described>>();

function describe(ids: readonly string[]): void {
    const missing = ids.filter((id) => id && !described.has(id));
    if (!missing.length) return;
    const all = describeCampaignProducts(missing).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    for (const id of missing) {
        const one = all.then((r): Described => {
            if (!r.ok) return r;
            const card = r.products.find((p) => p.id === id);
            return card ? { ok: true, card } : { ok: false, error: "That product couldn't be read." };
        });
        described.set(id, one);
        void one.then((r) => {
            if (!r.ok) described.delete(id);
        });
    }
}

/** A product just chosen from the picker: its card is what the picker showed. */
const remember = (card: CampaignProductCard) => described.set(card.id, Promise.resolve({ ok: true, card }));

/** The cards of `ids`, as they arrive. */
function useProductCards(ids: readonly string[]): Record<string, Described | undefined> {
    const key = ids.join(",");
    const [got, setGot] = useState<Record<string, Described>>({});
    useEffect(() => {
        const wanted = key ? key.split(",").filter(Boolean) : [];
        describe(wanted);
        let live = true;
        for (const id of wanted) {
            void described.get(id)?.then((r) => {
                if (live) setGot((g) => (g[id] === r ? g : { ...g, [id]: r }));
            });
        }
        return () => {
            live = false;
        };
    }, [key]);
    return got;
}

/** A chosen product's name, once its card has arrived. */
const titleOf = (state: Described | undefined) => (state?.ok ? state.card.title : null);

/** A product's photo, small, or a box where it has none. */
export function ProductThumb({ url, className = "h-12 w-12" }: { url: string | null; className?: string }) {
    return url ? (
        <img src={url} alt="" className={cn(className, "shrink-0 rounded object-cover")} />
    ) : (
        <span className={cn(className, "flex shrink-0 items-center justify-center rounded bg-muted text-muted-foreground")}>
            <Package className="h-4 w-4" aria-hidden />
        </span>
    );
}

/** One chosen product as the email will show it, or why it can't be. */
function ProductCardView({ state, wide }: { state: Described | undefined; wide: boolean }) {
    if (!state) {
        return (
            <div className="flex min-h-16 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Reading the product from the shop" />
            </div>
        );
    }
    if (!state.ok) return <p className="text-xs text-destructive">{state.error}</p>;
    const p = state.card;
    return (
        <div className={cn("flex gap-3", wide ? "flex-col items-center text-center" : "items-center")}>
            <ProductThumb url={p.photoUrl} className={wide ? "aspect-square h-auto w-full max-w-36" : "h-16 w-16"} />
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.title ?? "A product that no longer exists"}</p>
                {p.listed ? (
                    <p className="text-sm">{p.price}</p>
                ) : (
                    <p className="text-xs text-destructive">
                        {p.title ? "No longer in the shop: remove it or list it again." : "It is no longer in the shop: remove it."}
                    </p>
                )}
            </div>
        </div>
    );
}

/** The picker's button: the element itself, so the picker's trigger hands it its handlers. Busy while the picker loads. */
const pickButton = (label: string, busy = false) => (
    <Button type="button" variant="outline" size="sm" disabled={busy}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
        {label}
    </Button>
);

/**
 * A products block's products: their cards side by side or one per row, as
 * the block's layout puts them, each with *Remove*, and *Add a product* up to
 * three. Errors are keyed from the block: `products` and `products.<i>`.
 */
export function ProductsField({
    products,
    layout,
    onChange,
    readOnly,
    errors,
}: {
    products: readonly string[];
    layout: ProductLayout;
    onChange: (next: string[]) => void;
    readOnly: boolean;
    errors: Record<string, string>;
}) {
    const cards = useProductCards(products);
    const ids = products.filter(Boolean);
    const sideBySide = layout === "side_by_side";
    const error = errors.products ?? Object.entries(errors).find(([k]) => k.startsWith("products."))?.[1];
    return (
        <div className="@container space-y-3">
            {ids.length ? (
                <ul className={cn("grid gap-3", sideBySide && ids.length > 1 && (ids.length === 2 ? "@sm:grid-cols-2" : "@md:grid-cols-3"))}>
                    {ids.map((id) => (
                        <li key={id} className="space-y-1 rounded-md border p-3">
                            <ProductCardView state={cards[id]} wide={sideBySide} />
                            {readOnly ? null : (
                                <div className={cn(sideBySide && "text-center")}>
                                    <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onChange(ids.filter((x) => x !== id))}>
                                        Remove
                                        <span className="sr-only"> {titleOf(cards[id]) ?? "this product"}</span>
                                    </Button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    <ShoppingBag className="h-5 w-5" aria-hidden />
                    {CONTENT_PLACEHOLDERS.products}
                </div>
            )}
            {readOnly || ids.length >= CONTENT_LIMITS.products ? null : (
                <Suspense fallback={pickButton("Add a product", true)}>
                    <ProductPicker
                        chosen={ids}
                        onPick={(card) => {
                            remember(card);
                            onChange([...ids, card.id]);
                        }}
                    >
                        {pickButton("Add a product")}
                    </ProductPicker>
                </Suspense>
            )}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
    );
}

/** The product a button goes to: its card, and *Choose a product* or *Change the product*. */
export function ProductField({
    product,
    onChange,
    readOnly,
    error,
}: {
    /** Empty until one is chosen. */
    product: string;
    onChange: (next: string) => void;
    readOnly: boolean;
    error?: string;
}) {
    const cards = useProductCards(product ? [product] : []);
    return (
        <div className="space-y-2">
            {product ? (
                <div className="rounded-md border p-2">
                    <ProductCardView state={cards[product]} wide={false} />
                </div>
            ) : null}
            {readOnly ? null : (
                <Suspense fallback={pickButton(product ? "Change the product" : "Choose a product", true)}>
                    <ProductPicker
                        chosen={product ? [product] : []}
                        onPick={(card) => {
                            remember(card);
                            onChange(card.id);
                        }}
                    >
                        {pickButton(product ? "Change the product" : "Choose a product")}
                    </ProductPicker>
                </Suspense>
            )}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
    );
}
