"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { paymentMethodLabel } from "@/lib/ecommerce/outside-stripe";
import { formatCurrency } from "@/lib/i18n/currencies";

export function RecordRefundDialog({
    orderId,
    paymentMethod,
    remaining,
    onRecorded,
}: {
    orderId: string;
    paymentMethod: string | null;
    remaining: number;
    onRecorded: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [amount, setAmount] = useState(remaining.toFixed(2));
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const value = Number(amount);
    const valid = Number.isFinite(value) && value >= 0.01 && value <= remaining && note.trim().length > 0;

    const submit = async () => {
        if (!valid) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/shop/orders/${orderId}/record-refund`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: value, note: note.trim() }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setError(typeof json?.error === "string" ? json.error : "Could not record the refund.");
                return;
            }
            toast.success(`Refund of ${formatCurrency(json.amount)} recorded.`);
            setOpen(false);
            setNote("");
            onRecorded();
        } catch {
            setError("Could not record the refund. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (busy) return;
                setOpen(next);
                if (next) {
                    setAmount(remaining.toFixed(2));
                    setError(null);
                }
            }}
        >
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="w-full">
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Record refund
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Record a refund</DialogTitle>
                    <DialogDescription>
                        This order was paid by {paymentMethodLabel(paymentMethod)}, so recording a refund here sends no
                        money. Return it the way it came first, then record it. Up to {formatCurrency(remaining)} is
                        left.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="record-refund-amount">Amount returned (SGD)</Label>
                        <Input
                            id="record-refund-amount"
                            type="number"
                            inputMode="decimal"
                            min="0.01"
                            max={remaining}
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="record-refund-note">
                            How it was returned <span className="text-muted-foreground">(required)</span>
                        </Label>
                        <Input
                            id="record-refund-note"
                            value={note}
                            maxLength={500}
                            autoComplete="off"
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="e.g. cash handed back at the studio"
                        />
                    </div>
                    {error ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={() => void submit()} disabled={busy || !valid}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Record refund
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
