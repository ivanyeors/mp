"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/i18n/currencies";
import {
    STAFF_REFUND_REASONS,
    STAFF_REFUND_REASON_LABELS,
    lineRefundAmount,
    refundableAmount,
    selectionRefundAmount,
    type StaffRefundReason,
} from "@/lib/ecommerce/admin-refund";
import { isPostDelivery, staffRefundDeniedReason } from "@/lib/results/post-delivery-refund";
import type { Order } from "@/lib/types/ecommerce";
import { cn } from "@/lib/utils";

type RefundMode = "full" | "items" | "amount";

const MODES: Array<{ value: RefundMode; label: string; hint: string }> = [
    { value: "full", label: "Full refund", hint: "Everything left" },
    { value: "items", label: "Choose items", hint: "Lines or shipping" },
    { value: "amount", label: "Custom amount", hint: "Any figure" },
];

export interface RefundIssued {
    reason: StaffRefundReason;
    returnedQuantities: Record<string, number>;
    stripeRefundId: string | null;
}

function newRequestId(): string {
    return crypto.randomUUID();
}

function toCents(raw: string): number | null {
    const n = Number.parseFloat(raw.trim());
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function RefundDialog({
    order,
    isResultOrder,
    onRefunded,
}: {
    order: Order;
    isResultOrder: boolean;
    onRefunded: (issued: RefundIssued) => void | Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [requestId, setRequestId] = useState(newRequestId);
    const [mode, setMode] = useState<RefundMode>("full");
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [shipping, setShipping] = useState(false);
    const [amountDraft, setAmountDraft] = useState<string | null>(null);
    const [reason, setReason] = useState<StaffRefundReason>("charged_in_error");
    const [note, setNote] = useState("");
    const [returnAcknowledged, setReturnAcknowledged] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const currency = order.currency ?? "SGD";
    const money = (n: number) => formatCurrency(n, currency);
    const items = order.items ?? [];
    const remaining = refundableAmount(order);
    const remainingCents = Math.round(remaining * 100);
    const paid = Number(order.amount_captured ?? 0) > 0 ? Number(order.amount_captured) : Number(order.total);
    const refunded = Number(order.amount_refunded ?? 0);
    const shippingCharged = Number(order.shipping_amount ?? 0);

    const selection = useMemo(
        () => ({
            items: Object.entries(quantities)
                .filter(([, q]) => q > 0)
                .map(([order_item_id, quantity]) => ({ order_item_id, quantity })),
            shipping,
        }),
        [quantities, shipping],
    );
    const worked = selectionRefundAmount(order, items, selection);
    const workedCapped = Math.min(worked, remaining);

    const amountText =
        mode === "items" ? (amountDraft ?? (workedCapped > 0 ? workedCapped.toFixed(2) : "")) : (amountDraft ?? "");
    const amountCents = mode === "full" ? remainingCents : toCents(amountText);

    const nothingChosen = mode === "items" && selection.items.length === 0 && !shipping;
    const overLimit = amountCents != null && amountCents > remainingCents;
    const returnDenied = staffRefundDeniedReason(order, items, {
        returned: reason === "returned",
        inPersonReturnAcknowledged: returnAcknowledged,
    });
    const askReturnInPerson = isResultOrder && reason === "returned" && isPostDelivery(order);
    const needsNote = reason === "other" && note.trim().length === 0;
    const canSubmit =
        !submitting && !nothingChosen && amountCents != null && !overLimit && !returnDenied && !needsNote;

    const reset = () => {
        setRequestId(newRequestId());
        setMode("full");
        setQuantities({});
        setShipping(false);
        setAmountDraft(null);
        setReason("charged_in_error");
        setNote("");
        setReturnAcknowledged(false);
        setError(null);
    };

    const setLineQuantity = (id: string, quantity: number) => {
        setQuantities((prev) => ({ ...prev, [id]: quantity }));
        setAmountDraft(null);
    };

    const submit = async () => {
        if (!canSubmit || amountCents == null) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`/api/shop/orders/${order.id}/refund`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    request_id: requestId,
                    mode,
                    ...(mode === "full" ? {} : { amount: amountCents / 100 }),
                    items: mode === "items" ? selection.items : [],
                    shipping: mode === "items" && shipping,
                    reason,
                    ...(note.trim() ? { note: note.trim() } : {}),
                    in_person_return_acknowledged: isResultOrder && reason === "returned" ? returnAcknowledged : undefined,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (json.amount) setRequestId(newRequestId());
                throw new Error(json.error ?? "Couldn't issue the refund.");
            }
            setOpen(false);
            await onRefunded({
                reason,
                stripeRefundId: json.stripe_refund_id ?? null,
                returnedQuantities:
                    mode === "items" ? Object.fromEntries(selection.items.map((i) => [i.order_item_id, i.quantity])) : {},
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't issue the refund.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) reset();
            }}
        >
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="w-full">
                    Issue refund
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Refund order #{order.order_number}</DialogTitle>
                    <DialogDescription>
                        Paid {money(paid)}
                        {refunded > 0 ? ` · Refunded ${money(refunded)}` : ""} · Left to refund{" "}
                        <span className="font-medium text-foreground">{money(remaining)}</span>
                    </DialogDescription>
                </DialogHeader>

                <div role="radiogroup" aria-label="Refund" className="grid grid-cols-3 gap-2">
                    {MODES.map((m) => {
                        const selected = mode === m.value;
                        return (
                            <button
                                key={m.value}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => {
                                    setMode(m.value);
                                    setAmountDraft(null);
                                    setError(null);
                                }}
                                className={cn(
                                    "flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-lg border-2 px-3 py-2 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    selected ? "border-primary bg-primary/5" : "border-border",
                                )}
                            >
                                <span className="text-sm font-medium leading-tight">{m.label}</span>
                                <span className="text-xs text-muted-foreground leading-tight max-sm:hidden">
                                    {m.hint}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {mode === "full" && (
                    <p className="text-sm text-muted-foreground">
                        Refunds the {money(remaining)} left, all of it, to the payment method the customer used.
                    </p>
                )}

                {mode === "items" && (
                    <div className="space-y-3">
                        <ul className="divide-y rounded-lg border">
                            {items.map((item) => {
                                const qty = quantities[item.id] ?? 0;
                                const checked = qty > 0;
                                const share = lineRefundAmount(order, item, item.quantity);
                                return (
                                    <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                                        <Checkbox
                                            id={`refund-line-${item.id}`}
                                            checked={checked}
                                            onCheckedChange={(on) => setLineQuantity(item.id, on ? item.quantity : 0)}
                                        />
                                        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
                                            <Label
                                                htmlFor={`refund-line-${item.id}`}
                                                className="min-w-0 flex-col items-start gap-0.5 font-normal sm:flex-1"
                                            >
                                                <span className="block w-full truncate text-sm font-medium">
                                                    {item.product_title}
                                                </span>
                                                <span className="block w-full truncate text-xs text-muted-foreground">
                                                    {[
                                                        item.variant_title,
                                                        item.kind === "service" ? "Service" : null,
                                                        `${item.quantity} × paid ${money(share / item.quantity)}`,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" · ")}
                                                </span>
                                            </Label>
                                            {checked && item.quantity > 1 && (
                                                <div
                                                    role="group"
                                                    aria-label={`Quantity of ${item.product_title} to refund`}
                                                    className="mt-1.5 flex shrink-0 items-center gap-1 sm:mt-0"
                                                >
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        className="size-8"
                                                        aria-label="One fewer"
                                                        disabled={qty <= 1}
                                                        onClick={() => setLineQuantity(item.id, qty - 1)}
                                                    >
                                                        <Minus className="size-3.5" />
                                                    </Button>
                                                    <span className="w-5 text-center text-sm tabular-nums">{qty}</span>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        className="size-8"
                                                        aria-label="One more"
                                                        disabled={qty >= item.quantity}
                                                        onClick={() => setLineQuantity(item.id, qty + 1)}
                                                    >
                                                        <Plus className="size-3.5" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        <span className="w-20 shrink-0 text-right text-sm tabular-nums">
                                            {money(checked ? lineRefundAmount(order, item, qty) : share)}
                                        </span>
                                    </li>
                                );
                            })}
                            {shippingCharged > 0 && (
                                <li className="flex items-center gap-3 px-3 py-2.5">
                                    <Checkbox
                                        id="refund-shipping"
                                        checked={shipping}
                                        onCheckedChange={(on) => {
                                            setShipping(on === true);
                                            setAmountDraft(null);
                                        }}
                                    />
                                    <Label htmlFor="refund-shipping" className="flex-1 text-sm font-medium">
                                        Shipping
                                    </Label>
                                    <span className="w-20 shrink-0 text-right text-sm tabular-nums">
                                        {money(shippingCharged)}
                                    </span>
                                </li>
                            )}
                        </ul>
                        <p className="text-xs text-muted-foreground">
                            Each line refunds its share of what the customer paid, after any discount and points.
                        </p>
                    </div>
                )}

                {mode !== "full" && (
                    <div className="space-y-1.5">
                        <Label htmlFor="refund-amount">Amount to refund</Label>
                        <Input
                            id="refund-amount"
                            type="number"
                            inputMode="decimal"
                            min={0.01}
                            max={remaining}
                            step={0.01}
                            placeholder={mode === "amount" ? remaining.toFixed(2) : undefined}
                            value={amountText}
                            aria-invalid={overLimit || undefined}
                            onChange={(e) => setAmountDraft(e.target.value)}
                        />
                        <p className={cn("text-xs", overLimit ? "text-destructive" : "text-muted-foreground")}>
                            {overLimit
                                ? `That's more than the ${money(remaining)} left to refund.`
                                : nothingChosen
                                  ? "Tick what to refund above."
                                  : mode === "items" && worked > remaining
                                    ? `These come to ${money(worked)}; only ${money(remaining)} is left to refund.`
                                    : mode === "items" && amountDraft != null && workedCapped > 0
                                      ? `Changed from ${money(workedCapped)}.`
                                      : `Up to ${money(remaining)}.`}
                        </p>
                    </div>
                )}

                <div className="space-y-2">
                    <div className="text-sm font-medium">Reason</div>
                    <div role="radiogroup" aria-label="Reason" className="grid grid-cols-2 gap-2">
                        {STAFF_REFUND_REASONS.map((r) => {
                            const selected = reason === r;
                            return (
                                <button
                                    key={r}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => setReason(r)}
                                    className={cn(
                                        "flex min-h-11 items-center justify-between gap-2 rounded-lg border-2 px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        selected ? "border-primary bg-primary/5 font-medium" : "border-border",
                                    )}
                                >
                                    {STAFF_REFUND_REASON_LABELS[r]}
                                    {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                                </button>
                            );
                        })}
                    </div>
                    {askReturnInPerson && (
                        <label className="flex items-start gap-2 text-sm cursor-pointer max-md:min-h-11 max-md:items-center max-md:gap-3">
                            <Checkbox
                                className="mt-0.5 max-md:mt-0"
                                checked={returnAcknowledged}
                                onCheckedChange={(on) => setReturnAcknowledged(on === true)}
                            />
                            <span>The customer returned the product in person</span>
                        </label>
                    )}
                    {isResultOrder && reason === "returned" && !askReturnInPerson && returnDenied && (
                        <p className="text-sm text-muted-foreground">
                            {returnDenied} To fix a charge, pick Charged in error.
                        </p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="refund-note">
                        Note{reason === "other" ? "" : " (optional)"}
                    </Label>
                    <Textarea
                        id="refund-note"
                        rows={2}
                        maxLength={500}
                        className="resize-none"
                        placeholder={reason === "charged_in_error" ? "e.g. Charged the King price for a Queen" : undefined}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Kept on the order timeline. The customer doesn&apos;t see it.</p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <DialogFooter className="flex-col gap-2 sm:flex-col">
                    <Button className="w-full" onClick={submit} disabled={!canSubmit}>
                        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {amountCents != null && !overLimit ? `Refund ${money(amountCents / 100)}` : "Refund"}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                        Stripe sends it back to the card or PayNow it was paid with. The order updates once Stripe confirms.
                    </p>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
