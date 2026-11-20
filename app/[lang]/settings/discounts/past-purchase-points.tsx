"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { PastPurchasePreview } from "@/lib/points/server";
import { formatDollars, formatPoints, formatPointsCount } from "@/lib/points/value";

const n = (v: number) => v.toLocaleString("en-SG");

export function PastPurchasePoints({
    savedRate,
    unsavedRate,
    pointsOn,
    onGranted,
}: {
    savedRate: number | null;
    unsavedRate: number | null;
    pointsOn: boolean;
    onGranted: () => void;
}) {
    const [preview, setPreview] = useState<PastPurchasePreview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [running, setRunning] = useState(false);

    useEffect(() => {
        let live = true;
        fetch("/api/settings/discounts/points/past-purchases")
            .then((r) => r.json())
            .then((json) => {
                if (!live) return;
                if (json?.ok) {
                    setPreview(json.preview as PastPurchasePreview);
                    setError(null);
                } else setError(json?.error ?? "Could not work out the past-purchase points.");
            })
            .catch(() => live && setError("Could not work out the past-purchase points."));
        return () => {
            live = false;
        };
    }, [savedRate]);

    const run = async () => {
        if (!preview) return;
        setRunning(true);
        try {
            const res = await fetch("/api/settings/discounts/points/past-purchases", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customers: preview.customers, points: preview.points }),
            });
            const json = await res.json().catch(() => null);
            if (json?.preview) setPreview(json.preview as PastPurchasePreview);
            if (!res.ok || !json?.ok) {
                toast.error(json?.error ?? "Could not give the past-purchase points.");
                return;
            }
            setConfirming(false);
            toast.success(`Gave ${formatPointsCount(json.granted.points)} to ${n(json.granted.customers)} customers.`);
            onGranted();
        } finally {
            setRunning(false);
        }
    };

    const rateChanged = unsavedRate !== null && savedRate !== null && unsavedRate !== savedRate;

    return (
        <section aria-labelledby="past-purchase-points" className="space-y-3 border-t pt-4">
            <div>
                <p id="past-purchase-points" className="flex items-center gap-2 text-sm font-medium">
                    <History className="h-4 w-4" />
                    Points for past purchases
                </p>
                <p className="text-xs text-muted-foreground">
                    Customers imported from Shopify get points once for what they spent on the old shop, at the rate
                    above. They don&apos;t count towards milestones, and partners get none.
                    {pointsOn ? null : " Points are off: customers see them once points are on."}
                </p>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {!preview ? (
                !error ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null
            ) : (
                <>
                    {preview.customers > 0 ? (
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                            <div>
                                <dt className="text-xs text-muted-foreground">Customers</dt>
                                <dd className="font-medium tabular-nums">{n(preview.customers)}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-muted-foreground">Spent on the old shop</dt>
                                <dd className="font-medium tabular-nums">{formatDollars(preview.spend)}</dd>
                            </div>
                            <div className="col-span-2">
                                <dt className="text-xs text-muted-foreground">
                                    Points, at {preview.earnPerDollar} per S$1
                                </dt>
                                <dd className="font-medium tabular-nums">{formatPoints(preview.points)}</dd>
                            </div>
                            <p className="col-span-full text-xs text-muted-foreground">
                                Half get {formatPoints(preview.median)} or fewer; the most anyone gets is{" "}
                                {formatPoints(preview.largest)}.
                            </p>
                        </dl>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {preview.grantedCustomers > 0
                                ? "Every imported customer has their points for past purchases."
                                : "No imported customer has spending on the old shop to give points for."}
                        </p>
                    )}

                    {preview.grantedCustomers > 0 ? (
                        <p className="text-xs text-muted-foreground">
                            Given so far: {formatPoints(preview.grantedPoints)} to {n(preview.grantedCustomers)}{" "}
                            {preview.grantedCustomers === 1 ? "customer" : "customers"}.
                            {preview.customers > 0 ? " Giving again reaches only customers imported since." : null}
                        </p>
                    ) : null}
                    {preview.partnersLeftOut > 0 ? (
                        <p className="text-xs text-muted-foreground">
                            {n(preview.partnersLeftOut)} imported {preview.partnersLeftOut === 1 ? "customer is a partner" : "customers are partners"}, so
                            {preview.partnersLeftOut === 1 ? " gets" : " get"} none.
                        </p>
                    ) : null}
                    {rateChanged ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                            These use the saved rate, {savedRate} per S$1. Save first to give them at {unsavedRate}.
                        </p>
                    ) : null}

                    {preview.customers > 0 ? (
                        <Button variant="outline" onClick={() => setConfirming(true)} disabled={rateChanged}>
                            Give points for past purchases…
                        </Button>
                    ) : null}
                </>
            )}

            <Dialog open={confirming} onOpenChange={(o) => (running ? null : setConfirming(o))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Give points for past purchases?</DialogTitle>
                        <DialogDescription>
                            {preview
                                ? `${formatPoints(preview.points)} to ${n(preview.customers)} customers imported from Shopify, for the ${formatDollars(preview.spend)} they spent on the old shop.`
                                : null}
                        </DialogDescription>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        This can&apos;t be undone in one step. Points given can be taken back only one customer at a
                        time, with an adjustment on their page.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirming(false)} disabled={running}>
                            Cancel
                        </Button>
                        <Button onClick={run} disabled={running || !preview}>
                            {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                            Give {preview ? formatPointsCount(preview.points) : "points"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}
