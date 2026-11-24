"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, Minus, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrSvg } from "@/components/ui/qr-svg";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EMPTY_PAID_HOW, PaidHowFields, paidHowFromDraft, type PaidHowDraft } from "@/components/settings/paid-how-fields";
import { useMatchingStripePayments } from "@/hooks/use-matching-stripe-payments";
import { paymentMethodLabel } from "@/lib/ecommerce/outside-stripe";
import type { ServiceKey } from "@/lib/pricing/service-prices";
import type {
    StaffOrderAddressOption,
    StaffOrderOptions,
} from "@/lib/staff-orders/options";
import { buildPartsLabel } from "@/lib/staff-orders/build-snapshot";
import { OrderBuildDialog, type OrderBuild } from "./order-build-dialog";
import {
    MAX_GOODS_QUANTITY,
    MAX_SERVICE_QUANTITY,
    NOTE_MAX,
    type StaffOrderDraft,
    type StaffOrderQuoteView,
} from "@/lib/staff-orders/shared";

type Line =
    | { kind: "goods"; id: string; quantity: number }
    | { kind: "build"; id: string; key: number; quantity: number; build: OrderBuild }
    | { kind: "service"; id: ServiceKey; quantity: number };

type BuildTarget = { variantId: string; editing: number | null };

const lineKey = (line: Line) => (line.kind === "build" ? `build-${line.key}` : `${line.kind}-${line.id}`);

function partsLabel(parts: { cover: string | null; case: string | null }): string {
    const label = buildPartsLabel(parts);
    return label ? ` · ${label}` : "";
}

type AddressForm = {
    recipient: string;
    line1: string;
    line2: string;
    city: string;
    postal_code: string;
    country: string;
    phone: string;
};

type Created = {
    orderId: string;
    orderNumber: string;
    url: string;
    expiresAt: string;
    emailed: { ok: true; sentTo: string } | { ok: false; error: string } | null;
    paid: { ok: true; method: string; warnings: string[] } | { ok: false; error: string } | null;
};

const NEW_ADDRESS = "new";

const money = (n: number) =>
    new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(n);

function addressFromOption(a: StaffOrderAddressOption): AddressForm {
    return {
        recipient: a.recipient ?? "",
        line1: a.line1 ?? "",
        line2: a.line2 ?? "",
        city: a.city ?? "",
        postal_code: a.postal_code ?? "",
        country: (a.country ?? "SG").toUpperCase(),
        phone: a.phone ?? "",
    };
}

export function CreateOrderDialog({
    open,
    onOpenChange,
    customerId,
    customerName,
    customerEmail,
    ordersHref,
    onCreated,
    onChangeCustomer,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customerId: string;
    customerName: string;
    customerEmail: string;
    ordersHref: (orderId: string) => string;
    onCreated: () => void;
    onChangeCustomer?: () => void;
}) {
    const [options, setOptions] = useState<StaffOrderOptions | null>(null);
    const [optionsError, setOptionsError] = useState<string | null>(null);

    const [lines, setLines] = useState<Line[]>([]);
    const [buildTarget, setBuildTarget] = useState<BuildTarget | null>(null);
    const buildSeq = useRef(0);
    const [search, setSearch] = useState("");
    const [deliveryKind, setDeliveryKind] = useState<"studio" | "ship">("studio");
    const [studioId, setStudioId] = useState("");
    const [methodId, setMethodId] = useState("");
    const [addressChoice, setAddressChoice] = useState(NEW_ADDRESS);
    const [address, setAddress] = useState<AddressForm>({
        recipient: customerName,
        line1: "",
        line2: "",
        city: "Singapore",
        postal_code: "",
        country: "SG",
        phone: "",
    });
    const [codeInput, setCodeInput] = useState("");
    const [code, setCode] = useState("");
    const [note, setNote] = useState("");
    const [internalNote, setInternalNote] = useState("");
    const [sendEmail, setSendEmail] = useState(true);
    const [payBy, setPayBy] = useState<"link" | "paid">("link");
    const [paidDraft, setPaidDraft] = useState<PaidHowDraft>(EMPTY_PAID_HOW);

    const [priced, setPriced] = useState<{ key: string; quote: StaffOrderQuoteView | null; error: string | null } | null>(
        null,
    );
    const [createError, setCreateError] = useState<{ key: string; error: string } | null>(null);
    const [creating, setCreating] = useState(false);
    const [created, setCreated] = useState<Created | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!open || options) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/staff-orders/options?customer_id=${customerId}`);
                const json = await res.json().catch(() => null);
                if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not load products");
                if (cancelled) return;
                const loaded = json as StaffOrderOptions;
                setOptions(loaded);
                setStudioId((s) => s || loaded.studios[0]?.id || "");
                setMethodId((m) => m || loaded.methods[0]?.id || "");
                const preferred = loaded.addresses.find((a) => a.is_default) ?? loaded.addresses[0];
                if (preferred) {
                    setAddressChoice(preferred.id);
                    setAddress(addressFromOption(preferred));
                }
            } catch (e) {
                if (!cancelled) setOptionsError(e instanceof Error ? e.message : "Could not load products");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, options, customerId]);

    const products = useMemo(() => options?.products ?? [], [options]);
    const productById = useMemo(() => new Map(products.map((p) => [p.variantId, p])), [products]);
    const serviceByKey = useMemo(
        () => new Map((options?.services ?? []).map((s) => [s.key, s])),
        [options],
    );

    const hasGoods = lines.some((l) => l.kind !== "service");
    const effectiveDelivery = hasGoods ? deliveryKind : "studio";

    const draft: StaffOrderDraft | null = useMemo(() => {
        if (lines.length === 0) return null;
        const goods = lines.flatMap((l) => (l.kind === "goods" ? [{ variant_id: l.id, quantity: l.quantity }] : []));
        const builds = lines.flatMap((l) =>
            l.kind === "build"
                ? [
                      {
                          variant_id: l.id,
                          quantity: l.quantity,
                          filling_template_id: l.build.templateId,
                          cover_item_id: l.build.coverItemId,
                          case_item_id: l.build.caseItemId,
                          placements: l.build.placements,
                      },
                  ]
                : [],
        );
        const services = lines.flatMap((l) => (l.kind === "service" ? [{ key: l.id, quantity: l.quantity }] : []));
        let delivery: StaffOrderDraft["delivery"];
        if (effectiveDelivery === "studio") {
            if (!studioId) return null;
            delivery = { kind: "studio", location_id: studioId };
        } else {
            if (!methodId || !address.recipient.trim() || !address.line1.trim() || !address.city.trim()) return null;
            delivery = {
                kind: "ship",
                shipping_method_id: methodId,
                address: {
                    recipient: address.recipient.trim(),
                    line1: address.line1.trim(),
                    line2: address.line2.trim() || undefined,
                    city: address.city.trim(),
                    postal_code: address.postal_code.trim(),
                    country: (address.country.trim() || "SG").toUpperCase(),
                    phone: address.phone.trim() || undefined,
                },
            };
        }
        return {
            customer_id: customerId,
            goods,
            builds,
            services,
            delivery,
            code: code || undefined,
            note: note.trim() || undefined,
            internal_note: internalNote.trim() || undefined,
        };
    }, [lines, effectiveDelivery, studioId, methodId, address, code, note, internalNote, customerId]);

    const priceKey = useMemo(
        () => (draft ? JSON.stringify({ ...draft, note: undefined, internal_note: undefined }) : null),
        [draft],
    );
    const seq = useRef(0);
    useEffect(() => {
        if (!priceKey) return;
        const mine = ++seq.current;
        const timer = setTimeout(async () => {
            let answer: { quote: StaffOrderQuoteView | null; error: string | null };
            try {
                const res = await fetch("/api/staff-orders/quote", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: priceKey,
                });
                const json = await res.json().catch(() => null);
                answer =
                    res.ok && json?.ok
                        ? { quote: json.quote as StaffOrderQuoteView, error: null }
                        : { quote: null, error: json?.error ?? "Could not price this order" };
            } catch {
                answer = { quote: null, error: "Could not price this order" };
            }
            if (mine === seq.current) setPriced({ key: priceKey, ...answer });
        }, 350);
        return () => clearTimeout(timer);
    }, [priceKey]);

    const current = priced && priced.key === priceKey ? priced : null;
    const quote = current?.quote ?? null;
    const quoteError = (createError && createError.key === priceKey ? createError.error : null) ?? current?.error ?? null;
    const shownQuote = priceKey ? (priced?.quote ?? null) : null;
    const quoting = Boolean(priceKey) && !current;

    const stripePayments = useMatchingStripePayments(payBy === "paid" ? (quote?.total ?? null) : null);
    const paidHow = payBy === "paid" ? paidHowFromDraft(paidDraft, stripePayments.payments) : null;

    const addLine = useCallback((line: Exclude<Line, { kind: "build" }>) => {
        setLines((prev) => {
            const at = prev.findIndex((l) => l.kind === line.kind && l.id === line.id);
            if (at === -1) return [...prev, line];
            const next = [...prev];
            next[at] = { ...next[at], quantity: next[at].quantity + line.quantity } as Line;
            return next;
        });
    }, []);

    const setQuantity = (index: number, quantity: number) => {
        setLines((prev) => {
            const line = prev[index];
            const max = line.kind === "service" ? MAX_SERVICE_QUANTITY : MAX_GOODS_QUANTITY;
            const q = Math.max(1, Math.min(max, quantity));
            const next = [...prev];
            next[index] = { ...line, quantity: q } as Line;
            return next;
        });
    };

    const removeLine = (index: number) => setLines((prev) => prev.filter((_, i) => i !== index));

    const saveBuild = (build: OrderBuild) => {
        if (!buildTarget) return;
        const { variantId, editing } = buildTarget;
        const key = editing ?? ++buildSeq.current;
        setLines((prev) =>
            editing === null
                ? [...prev, { kind: "build", id: variantId, key, quantity: 1, build }]
                : prev.map((l) => (l.kind === "build" && l.key === editing ? { ...l, build } : l)),
        );
        setBuildTarget(null);
    };
    const buildProduct = buildTarget ? productById.get(buildTarget.variantId) : null;
    const editedBuild =
        buildTarget?.editing != null
            ? (lines.find((l) => l.kind === "build" && l.key === buildTarget.editing) as
                  | Extract<Line, { kind: "build" }>
                  | undefined)
            : undefined;

    const filteredProducts = useMemo(() => {
        const q = search.trim().toLowerCase();
        const hits = q
            ? products.filter((p) =>
                  [p.title, p.variantTitle, p.sku].some((v) => v?.toLowerCase().includes(q)),
              )
            : products;
        return hits.slice(0, 30);
    }, [products, search]);

    const reset = () => {
        setLines([]);
        setBuildTarget(null);
        setSearch("");
        setCodeInput("");
        setCode("");
        setNote("");
        setInternalNote("");
        setSendEmail(true);
        setPayBy("link");
        setPaidDraft(EMPTY_PAID_HOW);
        setPriced(null);
        setCreateError(null);
        setCreated(null);
        setCopied(false);
    };

    const close = (next: boolean) => {
        if (!next) {
            if (created) reset();
            setOptions(null);
            setOptionsError(null);
        }
        onOpenChange(next);
    };

    const create = async () => {
        if (!draft || !quote) return;
        if (payBy === "paid" && !paidHow) return;
        setCreating(true);
        setCreateError(null);
        try {
            const res = await fetch("/api/staff-orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    paidHow ? { ...draft, send_email: false, paid: paidHow } : { ...draft, send_email: sendEmail },
                ),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setCreateError({ key: priceKey ?? "", error: json?.error ?? "Could not create the order" });
                return;
            }
            setCreated({
                orderId: json.order.id,
                orderNumber: json.order.order_number,
                url: json.link.url,
                expiresAt: json.link.expires_at,
                emailed: json.emailed ?? null,
                paid: json.paid ?? null,
            });
            onCreated();
        } catch {
            setCreateError({ key: priceKey ?? "", error: "Could not create the order" });
        } finally {
            setCreating(false);
        }
    };

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {}
    };

    const quotedLine = (line: Line) => {
        if (!shownQuote) return undefined;
        if (line.kind === "build") {
            const nth = lines.filter((l) => l.kind === "build").indexOf(line);
            const priced = shownQuote.lines.filter((q) => q.kind === "goods" && q.build)[nth];
            return priced?.kind === "goods" && priced.variantId === line.id ? priced : undefined;
        }
        return shownQuote.lines.find((q) =>
            line.kind === "goods"
                ? q.kind === "goods" && !q.build && q.variantId === line.id
                : q.kind === "service" && q.serviceKey === line.id,
        );
    };

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="sm:max-w-2xl md:max-h-[90vh] md:overflow-y-auto">
                {created ? (
                    <CreatedView
                        created={created}
                        copied={copied}
                        onCopy={() => void copy(created.url)}
                        orderHref={ordersHref(created.orderId)}
                        onDone={() => close(false)}
                    />
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>New order for {customerName}</DialogTitle>
                            <DialogDescription>
                                Pillows and bolsters are built with the fillings, cover and case you choose, at
                                their Costings price (an Ear Comfort Pad placed inside adds its own).
                                Other products are at their shop price, services at their Costings price.{" "}
                                {customerName} pays through a link, on their own phone.
                            </DialogDescription>
                            {onChangeCustomer ? (
                                <Button
                                    type="button"
                                    variant="link"
                                    className="h-auto self-center p-0 sm:self-start"
                                    onClick={onChangeCustomer}
                                >
                                    Change customer
                                </Button>
                            ) : null}
                        </DialogHeader>

                        {optionsError ? (
                            <p className="text-sm text-destructive">{optionsError}</p>
                        ) : !options ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="min-w-0 space-y-5">
                                <section className="space-y-2" aria-labelledby="add-products">
                                    <Label id="add-products" htmlFor="product-search">
                                        Products
                                    </Label>
                                    <div className="relative">
                                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            id="product-search"
                                            placeholder="Search by name or SKU"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            className="pl-9"
                                        />
                                    </div>
                                    <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
                                        {filteredProducts.length === 0 ? (
                                            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                                                No products match.
                                            </li>
                                        ) : (
                                            filteredProducts.map((p) => {
                                                const inOrder = lines.reduce(
                                                    (sum, l) => (l.kind !== "service" && l.id === p.variantId ? sum + l.quantity : sum),
                                                    0,
                                                );
                                                const left = p.stockAvailable - inOrder;
                                                const name = `${p.title}${p.variantTitle ? ` ${p.variantTitle}` : ""}`;
                                                return (
                                                    <li key={p.variantId}>
                                                        <button
                                                            type="button"
                                                            className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                                            disabled={left <= 0}
                                                            onClick={() =>
                                                                p.builtToOrder
                                                                    ? setBuildTarget({ variantId: p.variantId, editing: null })
                                                                    : addLine({ kind: "goods", id: p.variantId, quantity: 1 })
                                                            }
                                                            aria-label={
                                                                p.builtToOrder
                                                                    ? `Choose the build for ${name}, ${money(p.price)}`
                                                                    : `Add ${name}, ${money(p.price)}`
                                                            }
                                                        >
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate text-sm font-medium">
                                                                    {p.title}
                                                                    {p.variantTitle ? (
                                                                        <span className="font-normal text-muted-foreground">
                                                                            {" "}
                                                                            · {p.variantTitle}
                                                                        </span>
                                                                    ) : null}
                                                                </span>
                                                                <span className="block truncate text-xs text-muted-foreground">
                                                                    {p.builtToOrder ? "Built to order · " : ""}
                                                                    {p.stockAvailable > 0
                                                                        ? `${p.stockAvailable} ${p.builtToOrder ? "can be built" : "in stock"}`
                                                                        : "Out of stock"}
                                                                    {p.unlisted ? " · not listed online" : ""}
                                                                </span>
                                                            </span>
                                                            <span
                                                                aria-hidden="true"
                                                                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:hidden [@media(hover:none)]:hidden"
                                                            >
                                                                {p.builtToOrder ? (
                                                                    <SlidersHorizontal className="h-3.5 w-3.5" />
                                                                ) : (
                                                                    <Plus className="h-3.5 w-3.5" />
                                                                )}
                                                                {p.builtToOrder ? "Choose build" : "Add"}
                                                            </span>
                                                            <span
                                                                aria-hidden="true"
                                                                className="hidden shrink-0 text-muted-foreground group-disabled:hidden [@media(hover:none)]:inline-flex"
                                                            >
                                                                {p.builtToOrder ? (
                                                                    <SlidersHorizontal className="h-4 w-4" />
                                                                ) : (
                                                                    <Plus className="h-4 w-4" />
                                                                )}
                                                            </span>
                                                            <span className="shrink-0 text-right text-lg font-semibold leading-none tabular-nums">
                                                                {money(p.price)}
                                                            </span>
                                                        </button>
                                                    </li>
                                                );
                                            })
                                        )}
                                    </ul>
                                </section>

                                <section className="space-y-2" aria-labelledby="add-services">
                                    <p id="add-services" className="text-sm font-medium">
                                        Services
                                    </p>
                                    {options.servicesError ? (
                                        <p className="text-sm text-destructive">
                                            Service prices could not be read from Costings.
                                        </p>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {options.services.map((s) => (
                                                <Button
                                                    key={s.key}
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => addLine({ kind: "service", id: s.key, quantity: 1 })}
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    {s.label} · {money(s.price)}
                                                </Button>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                <section className="space-y-2" aria-labelledby="order-lines">
                                    <p id="order-lines" className="text-sm font-medium">
                                        In this order
                                    </p>
                                    {lines.length === 0 ? (
                                        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                                            Add a product or a service.
                                        </p>
                                    ) : (
                                        <ul className="divide-y rounded-md border">
                                            {lines.map((line, i) => {
                                                const product = line.kind === "service" ? null : productById.get(line.id);
                                                const service =
                                                    line.kind === "service" ? serviceByKey.get(line.id) : null;
                                                const pricedLine = quotedLine(line);
                                                const name = product
                                                    ? `${product.title}${product.variantTitle ? ` · ${product.variantTitle}` : ""}`
                                                    : (service?.label ?? line.id);
                                                const unit = pricedLine?.unitPrice ?? product?.price ?? service?.price ?? 0;
                                                const quotedBuild = pricedLine?.kind === "goods" ? pricedLine.build : undefined;
                                                return (
                                                    <li
                                                        key={lineKey(line)}
                                                        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2"
                                                    >
                                                        <div className="min-w-0 flex-1 basis-40">
                                                            <p className="truncate text-sm font-medium">{name}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {line.kind === "service" ? "Service · " : ""}
                                                                {money(unit)} each
                                                            </p>
                                                            {line.kind === "build" ? (
                                                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                                                    <span>
                                                                        {quotedBuild?.filling ?? line.build.filling} ·{" "}
                                                                        {line.build.pieces} piece
                                                                        {line.build.pieces === 1 ? "" : "s"}
                                                                        {quotedBuild && quotedBuild.placedExtras > 0
                                                                            ? ` · includes ${money(quotedBuild.placedExtras)} for Ear Comfort Pads`
                                                                            : ""}
                                                                        {partsLabel(quotedBuild ?? line.build)}
                                                                    </span>
                                                                    <Button
                                                                        type="button"
                                                                        variant="link"
                                                                        className="h-auto p-0 text-xs"
                                                                        onClick={() =>
                                                                            setBuildTarget({ variantId: line.id, editing: line.key })
                                                                        }
                                                                        aria-label={`Change the build of ${name}`}
                                                                    >
                                                                        Change build
                                                                    </Button>
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="outline"
                                                                className="h-8 w-8"
                                                                onClick={() => setQuantity(i, line.quantity - 1)}
                                                                disabled={line.quantity <= 1}
                                                                aria-label={`One fewer ${name}`}
                                                            >
                                                                <Minus className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <span
                                                                className="w-8 text-center text-sm tabular-nums"
                                                                aria-label="Quantity"
                                                            >
                                                                {line.quantity}
                                                            </span>
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="outline"
                                                                className="h-8 w-8"
                                                                onClick={() => setQuantity(i, line.quantity + 1)}
                                                                aria-label={`One more ${name}`}
                                                            >
                                                                <Plus className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                        <span className="w-24 text-right text-base font-semibold tabular-nums">
                                                            {money(unit * line.quantity)}
                                                        </span>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8"
                                                            onClick={() => removeLine(i)}
                                                            aria-label={`Remove ${name}`}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </section>

                                <section className="space-y-3" aria-labelledby="delivery">
                                    <p id="delivery" className="text-sm font-medium">
                                        Where it goes
                                    </p>
                                    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Delivery">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={effectiveDelivery === "studio" ? "secondary" : "ghost"}
                                            aria-pressed={effectiveDelivery === "studio"}
                                            onClick={() => setDeliveryKind("studio")}
                                        >
                                            At a studio
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={effectiveDelivery === "ship" ? "secondary" : "ghost"}
                                            aria-pressed={effectiveDelivery === "ship"}
                                            onClick={() => setDeliveryKind("ship")}
                                            disabled={!hasGoods}
                                            title={hasGoods ? undefined : "Nothing in this order ships"}
                                        >
                                            Deliver to an address
                                        </Button>
                                    </div>

                                    {effectiveDelivery === "studio" ? (
                                        options.studios.length === 0 ? (
                                            <p className="text-sm text-destructive">
                                                No studio has an address. Add one under Settings → Locations.
                                            </p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                <Label>Studio</Label>
                                                <Select value={studioId} onValueChange={setStudioId}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder="Pick a studio" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {options.studios.map((s) => (
                                                            <SelectItem key={s.id} value={s.id}>
                                                                {s.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-muted-foreground">
                                                    Handed over or done there. No shipping charge, no courier label.
                                                </p>
                                            </div>
                                        )
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <div className="min-w-0 space-y-1.5">
                                                    <Label>Address</Label>
                                                    <Select
                                                        value={addressChoice}
                                                        onValueChange={(v) => {
                                                            setAddressChoice(v);
                                                            const saved = options.addresses.find((a) => a.id === v);
                                                            if (saved) setAddress(addressFromOption(saved));
                                                        }}
                                                    >
                                                        <SelectTrigger className="w-full min-w-0">
                                                            <SelectValue placeholder="Pick an address" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {options.addresses.map((a) => (
                                                                <SelectItem key={a.id} value={a.id}>
                                                                    {a.label || a.line1}
                                                                </SelectItem>
                                                            ))}
                                                            <SelectItem value={NEW_ADDRESS}>New address</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="min-w-0 space-y-1.5">
                                                    <Label>Delivery method</Label>
                                                    <Select value={methodId} onValueChange={setMethodId}>
                                                        <SelectTrigger className="w-full min-w-0">
                                                            <SelectValue placeholder="Pick a method" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {options.methods.map((m) => (
                                                                <SelectItem key={m.id} value={m.id}>
                                                                    {m.live ? `${m.name} (live rate)` : `${m.name} · ${money(m.baseRate)}`}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                {(
                                                    [
                                                        ["recipient", "Recipient"],
                                                        ["phone", "Phone (optional)"],
                                                        ["line1", "Address line 1"],
                                                        ["line2", "Address line 2 (optional)"],
                                                        ["city", "City"],
                                                        ["postal_code", "Postal code"],
                                                        ["country", "Country code"],
                                                    ] as Array<[keyof AddressForm, string]>
                                                ).map(([key, label]) => (
                                                    <div key={key} className="min-w-0 space-y-1.5">
                                                        <Label htmlFor={`addr-${key}`}>{label}</Label>
                                                        <Input
                                                            id={`addr-${key}`}
                                                            value={address[key]}
                                                            maxLength={key === "country" ? 2 : 200}
                                                            onChange={(e) => {
                                                                setAddressChoice(NEW_ADDRESS);
                                                                setAddress((a) => ({ ...a, [key]: e.target.value }));
                                                            }}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </section>

                                <section className="space-y-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="staff-order-code">Discount code (optional)</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                id="staff-order-code"
                                                value={codeInput}
                                                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                                                placeholder="e.g. WELCOME10"
                                            />
                                            {code ? (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setCode("");
                                                        setCodeInput("");
                                                    }}
                                                >
                                                    Remove
                                                </Button>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    disabled={!codeInput.trim()}
                                                    onClick={() => setCode(codeInput.trim())}
                                                >
                                                    Apply
                                                </Button>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Comes off the products only, never a service fee.
                                        </p>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="staff-order-note">Note for the customer (optional)</Label>
                                            <Textarea
                                                id="staff-order-note"
                                                value={note}
                                                maxLength={NOTE_MAX}
                                                rows={3}
                                                onChange={(e) => setNote(e.target.value)}
                                                placeholder="Shown in the email and on the payment page"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="staff-order-internal">Internal note (optional)</Label>
                                            <Textarea
                                                id="staff-order-internal"
                                                value={internalNote}
                                                rows={3}
                                                onChange={(e) => setInternalNote(e.target.value)}
                                                placeholder="Staff only"
                                            />
                                        </div>
                                    </div>
                                </section>

                                <section className="space-y-3" aria-labelledby="how-paid">
                                    <p id="how-paid" className="text-sm font-medium">
                                        Payment
                                    </p>
                                    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Payment">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={payBy === "link" ? "secondary" : "ghost"}
                                            aria-pressed={payBy === "link"}
                                            onClick={() => setPayBy("link")}
                                        >
                                            Send a payment link
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={payBy === "paid" ? "secondary" : "ghost"}
                                            aria-pressed={payBy === "paid"}
                                            onClick={() => setPayBy("paid")}
                                        >
                                            Already paid
                                        </Button>
                                    </div>
                                    {payBy === "link" ? (
                                        <p className="text-xs text-muted-foreground">
                                            The order waits for {customerName} to pay through a link, on their own
                                            phone.
                                        </p>
                                    ) : !quote ? (
                                        <p className="text-xs text-muted-foreground">
                                            Finish the order to say how it was paid.
                                        </p>
                                    ) : (
                                        <PaidHowFields
                                            id="staff-order-paid"
                                            amountLabel={money(quote.total)}
                                            stripe={stripePayments}
                                            value={paidDraft}
                                            onChange={setPaidDraft}
                                        />
                                    )}
                                </section>

                                <section
                                    className="space-y-1.5 rounded-md bg-muted/50 p-3 text-sm"
                                    aria-live="polite"
                                    aria-label="Order total"
                                >
                                    {!draft ? (
                                        <p className="text-muted-foreground">
                                            {lines.length === 0
                                                ? "The total shows here once something is in the order."
                                                : "Finish where it goes to see the total."}
                                        </p>
                                    ) : quoteError ? (
                                        <p className="text-destructive">{quoteError}</p>
                                    ) : !shownQuote ? (
                                        <p className="flex items-center gap-2 text-muted-foreground">
                                            <Loader2 className="h-4 w-4 animate-spin" /> Pricing…
                                        </p>
                                    ) : (
                                        <QuoteSummary quote={shownQuote} stale={quoting} />
                                    )}
                                </section>
                            </div>
                        )}

                        <DialogFooter className="items-center gap-3 sm:justify-between">
                            {payBy === "link" ? (
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={sendEmail}
                                        onCheckedChange={(v) => setSendEmail(v === true)}
                                        aria-label="Email the payment link"
                                    />
                                    <span className="min-w-0 break-all">Email the payment link to {customerEmail}</span>
                                </label>
                            ) : (
                                <p className="min-w-0 break-all text-sm text-muted-foreground">
                                    No payment link is sent. {customerEmail} gets the order confirmation.
                                </p>
                            )}
                            <Button
                                type="button"
                                onClick={() => void create()}
                                disabled={
                                    !quote || quoting || creating || !!quoteError || (payBy === "paid" && !paidHow)
                                }
                            >
                                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {payBy === "paid" ? "Create paid order" : "Create order"}
                                {quote ? ` · ${money(quote.total)}` : ""}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
            <OrderBuildDialog
                key={buildTarget ? `${buildTarget.variantId}-${buildTarget.editing ?? "new"}` : "closed"}
                open={buildTarget !== null}
                onOpenChange={(next) => {
                    if (!next) setBuildTarget(null);
                }}
                variantId={buildTarget?.variantId ?? null}
                title={
                    buildProduct
                        ? `${buildProduct.title}${buildProduct.variantTitle ? ` · ${buildProduct.variantTitle}` : ""}`
                        : "this build"
                }
                initial={editedBuild?.build ?? null}
                onSave={saveBuild}
            />
        </Dialog>
    );
}

function QuoteSummary({ quote, stale }: { quote: StaffOrderQuoteView; stale: boolean }) {
    return (
        <dl className={`space-y-1 ${stale ? "opacity-60" : ""}`}>
            <SummaryRow label="Subtotal" value={money(quote.subtotal)} />
            <SummaryRow
                label={quote.delivery.kind === "studio" ? `At ${quote.delivery.locationName}` : quote.delivery.label}
                value={quote.shippingAmount > 0 ? money(quote.shippingAmount) : "Free"}
            />
            {quote.discountAmount > 0 ? (
                <SummaryRow
                    label={`Discount${quote.discountCode ? ` (${quote.discountCode})` : ""}`}
                    value={`− ${money(quote.discountAmount)}`}
                />
            ) : null}
            {quote.taxAmount > 0 ? <SummaryRow label={quote.taxLabel ?? "Tax"} value={money(quote.taxAmount)} /> : null}
            <SummaryRow label="Total" value={money(quote.total)} strong />
        </dl>
    );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className={`flex items-baseline justify-between gap-3 ${strong ? "border-t pt-1.5 font-semibold" : ""}`}>
            <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
            <dd className="tabular-nums">{value}</dd>
        </div>
    );
}

function CreatedView({
    created,
    copied,
    onCopy,
    orderHref,
    onDone,
}: {
    created: Created;
    copied: boolean;
    onCopy: () => void;
    orderHref: string;
    onDone: () => void;
}) {
    const expires = new Intl.DateTimeFormat("en-SG", {
        timeZone: "Asia/Singapore",
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(created.expiresAt));
    if (created.paid?.ok) {
        return (
            <>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Check className="h-5 w-5 text-green-600" />
                        Order #{created.orderNumber} created and paid
                    </DialogTitle>
                    <DialogDescription>
                        Paid by {paymentMethodLabel(created.paid.method)}. It is confirmed, its stock is taken out and
                        the customer has been sent the confirmation.
                    </DialogDescription>
                </DialogHeader>
                {created.paid.warnings.length > 0 ? (
                    <ul className="space-y-1 text-sm text-destructive" role="alert">
                        {created.paid.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                        ))}
                    </ul>
                ) : null}
                <DialogFooter>
                    <Button asChild variant="outline">
                        <Link href={orderHref}>View order</Link>
                    </Button>
                    <Button type="button" onClick={onDone}>
                        Done
                    </Button>
                </DialogFooter>
            </>
        );
    }

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-600" />
                    Order #{created.orderNumber} created
                </DialogTitle>
                <DialogDescription>Awaiting payment. The link works until {expires}.</DialogDescription>
            </DialogHeader>
            <div className="min-w-0 space-y-4">
                {created.paid ? (
                    <p role="alert" className="text-sm text-destructive">
                        The order was made, but it could not be marked paid: {created.paid.error} It is awaiting
                        payment. Mark it paid from the order&apos;s page, or send its link.
                    </p>
                ) : null}
                {created.emailed ? (
                    created.emailed.ok ? (
                        <Badge variant="secondary">Emailed to {created.emailed.sentTo}</Badge>
                    ) : (
                        <p className="text-sm text-destructive">{created.emailed.error}</p>
                    )
                ) : (
                    <p className="text-sm text-muted-foreground">Not emailed. Copy the link to send it.</p>
                )}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <Label htmlFor="pay-link">Payment link</Label>
                        <div className="flex gap-2">
                            <Input
                                id="pay-link"
                                readOnly
                                value={created.url}
                                onFocus={(e) => e.currentTarget.select()}
                                className="text-sm"
                            />
                            <Button type="button" variant="outline" onClick={onCopy}>
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                {copied ? "Copied" : "Copy"}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Send it by WhatsApp, or let them scan the code to pay on their phone.
                        </p>
                    </div>
                    <div className="flex flex-col items-center gap-1 self-center">
                        <div className="rounded-md bg-white p-2">
                            <QrSvg text={created.url} px={128} label="Payment link QR code" />
                        </div>
                        <p className="text-xs text-muted-foreground">Scan to pay</p>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button asChild variant="outline">
                    <Link href={orderHref}>View order</Link>
                </Button>
                <Button type="button" onClick={onDone}>
                    Done
                </Button>
            </DialogFooter>
        </>
    );
}
