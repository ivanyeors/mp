"use client";

import { useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { EMPTY_PAID_HOW, PaidHowFields, paidHowFromDraft, type PaidHowDraft } from "@/components/settings/paid-how-fields";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useMatchingStripePayments } from "@/hooks/use-matching-stripe-payments";
import { formatCurrency } from "@/lib/i18n/currencies";

export function MarkPaidDialog({
    orderId,
    orderNumber,
    total,
    onPaid,
}: {
    orderId: string;
    orderNumber: string;
    total: number;
    onPaid: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<PaidHowDraft>(EMPTY_PAID_HOW);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const stripe = useMatchingStripePayments(open ? total : null);
    const how = paidHowFromDraft(draft, stripe.payments);

    const submit = async () => {
        if (!how) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/staff-orders/${orderId}/mark-paid`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(how),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setError(typeof json?.error === "string" ? json.error : "Could not mark the order paid.");
                return;
            }
            const warnings = (json.warnings ?? []) as string[];
            if (warnings.length > 0) toast.warning(warnings.join(" "));
            else toast.success(`Order #${orderNumber} marked paid.`);
            setOpen(false);
            setDraft(EMPTY_PAID_HOW);
            onPaid();
        } catch {
            setError("Could not mark the order paid. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => (busy ? undefined : setOpen(next))}>
            <DialogTrigger asChild>
                <Button type="button" className="w-full">
                    <BadgeCheck className="h-4 w-4" />
                    Mark as paid
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Mark order #{orderNumber} as paid</DialogTitle>
                    <DialogDescription>
                        {formatCurrency(total)} has already been paid. The order is confirmed, its stock is taken out,
                        the customer gets the confirmation email, and its payment link stops working.
                    </DialogDescription>
                </DialogHeader>
                <PaidHowFields
                    id="mark-paid"
                    amountLabel={formatCurrency(total)}
                    stripe={stripe}
                    value={draft}
                    onChange={setDraft}
                />
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={() => void submit()} disabled={busy || !how}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                        Mark as paid
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
