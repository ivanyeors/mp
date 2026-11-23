"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroupLabel, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MatchingStripePayments } from "@/hooks/use-matching-stripe-payments";
import {
    OUTSIDE_STRIPE_METHODS,
    OUTSIDE_STRIPE_METHOD_LABELS,
    isOutsideStripeMethod,
} from "@/lib/ecommerce/outside-stripe";
import { NOTE_MAX, type PaidHow, type StripePaymentOption } from "@/lib/staff-orders/shared";

export type PaidHowDraft = { choice: string; note: string };

export const EMPTY_PAID_HOW: PaidHowDraft = { choice: "", note: "" };

const STRIPE = "stripe:";
const OUTSIDE = "outside:";

export function paidHowFromDraft(draft: PaidHowDraft, payments: StripePaymentOption[]): PaidHow | null {
    if (draft.choice.startsWith(STRIPE)) {
        const id = draft.choice.slice(STRIPE.length);
        return payments.some((p) => p.id === id) ? { kind: "stripe", payment_intent_id: id } : null;
    }
    const method = draft.choice.slice(OUTSIDE.length);
    if (!draft.choice.startsWith(OUTSIDE) || !isOutsideStripeMethod(method)) return null;
    const note = draft.note.trim();
    if (method === "other" && !note) return null;
    return { kind: "outside", method, ...(note ? { note } : {}) };
}

const when = (iso: string) =>
    new Intl.DateTimeFormat("en-SG", {
        timeZone: "Asia/Singapore",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(iso));

function paymentLabel(p: StripePaymentOption): string {
    const who = p.email ?? p.description;
    return [p.method ?? "Stripe payment", when(p.paidAt), who, `…${p.id.slice(-6)}`].filter(Boolean).join(" · ");
}

export function PaidHowFields({
    id,
    amountLabel,
    stripe,
    value,
    onChange,
}: {
    id: string;
    amountLabel: string | null;
    stripe: MatchingStripePayments;
    value: PaidHowDraft;
    onChange: (next: PaidHowDraft) => void;
}) {
    const outside = value.choice.startsWith(OUTSIDE);
    const method = value.choice.slice(OUTSIDE.length);
    const staleStripe =
        value.choice.startsWith(STRIPE) &&
        !stripe.loading &&
        !stripe.payments.some((p) => p.id === value.choice.slice(STRIPE.length));

    return (
        <div className="min-w-0 space-y-3">
            <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${id}-how`}>How it was paid</Label>
                <Select value={value.choice} onValueChange={(choice) => onChange({ ...value, choice })}>
                    <SelectTrigger id={`${id}-how`} className="w-full min-w-0">
                        <SelectValue placeholder="Pick how it was paid" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroupLabel>
                            {amountLabel ? `Stripe payments of ${amountLabel}` : "Stripe payments of this amount"}
                        </SelectGroupLabel>
                        {stripe.loading ? (
                            <SelectItem value="stripe-loading" disabled>
                                Looking in Stripe…
                            </SelectItem>
                        ) : stripe.payments.length === 0 ? (
                            <SelectItem value="stripe-none" disabled>
                                {stripe.error ?? "No unclaimed payment of this amount in the last 7 days"}
                            </SelectItem>
                        ) : (
                            stripe.payments.map((p) => (
                                <SelectItem key={p.id} value={`${STRIPE}${p.id}`}>
                                    {paymentLabel(p)}
                                </SelectItem>
                            ))
                        )}
                        <SelectGroupLabel>Outside Stripe</SelectGroupLabel>
                        {OUTSIDE_STRIPE_METHODS.map((m) => (
                            <SelectItem key={m} value={`${OUTSIDE}${m}`}>
                                {OUTSIDE_STRIPE_METHOD_LABELS[m]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {staleStripe ? (
                    <p role="alert" className="text-xs text-destructive">
                        The total changed, so that Stripe payment no longer matches. Pick again.
                    </p>
                ) : value.choice.startsWith(STRIPE) ? (
                    <p className="text-xs text-muted-foreground">
                        The order is confirmed against this Stripe payment and dated by it. Refunds go back through
                        Stripe as usual.
                    </p>
                ) : outside ? (
                    <p className="text-xs text-muted-foreground">
                        No Stripe payment is linked. A refund is returned the way it came and recorded on the order by
                        hand.
                    </p>
                ) : null}
            </div>
            {outside ? (
                <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={`${id}-note`}>
                        {method === "other" ? "How it was paid" : "Note (optional)"}
                        {method === "other" ? <span className="text-muted-foreground"> (required)</span> : null}
                    </Label>
                    <Input
                        id={`${id}-note`}
                        value={value.note}
                        maxLength={NOTE_MAX}
                        autoComplete="off"
                        onChange={(e) => onChange({ ...value, note: e.target.value })}
                        placeholder={method === "other" ? "e.g. gift voucher 0042" : "e.g. receipt number, who took it"}
                    />
                </div>
            ) : null}
        </div>
    );
}
