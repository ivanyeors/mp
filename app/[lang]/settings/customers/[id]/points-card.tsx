"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { formatAdminDateMY } from "@/lib/format/admin-date";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import type { PendingOrderPoints, PointsBalance, PointsEntry } from "@/lib/points/server";
import { POINTS_KIND_LABEL } from "@/lib/points/kinds";
import { formatDollars, formatPoints, pointsToDollars } from "@/lib/points/value";

type PointsView = {
    balance: PointsBalance;
    pending: PendingOrderPoints[];
    history: PointsEntry[];
    partner: boolean;
    enabled: boolean;
    /** Points earned from orders, and how many of the bonus milestones they reach (slice 09); null if unread. */
    milestones: { earned: number; reached: number; total: number } | null;
};

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-SG")}`;

/**
 * Points (PRD-loyalty-points slice 02; ADR 0030): the balance, what is
 * pending and from which Order, and the latest ledger entries. Staff with `customers-edit` adjust it with a written reason, which
 * is audited; a partner holds no points, so the card says so and offers
 * nothing.
 */
export function PointsCard({ customerId, canEdit }: { customerId: string; canEdit: boolean }) {
    const locale = getLocaleFromPathname(usePathname() ?? "") ?? DEFAULT_LOCALE;
    const [view, setView] = useState<PointsView | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [direction, setDirection] = useState<"add" | "remove">("add");
    const [amount, setAmount] = useState("");
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // One read; its answer is applied by the caller, so the effect below sets
    // state only when the request returns.
    const read = useCallback(async (): Promise<{ view: PointsView } | { error: string }> => {
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/points`);
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) return { error: json?.error ?? "Could not load points." };
            return { view: json.view as PointsView };
        } catch {
            return { error: "Could not load points." };
        }
    }, [customerId]);

    const apply = useCallback((r: { view: PointsView } | { error: string }) => {
        if ("view" in r) {
            setView(r.view);
            setLoadError(null);
        } else setLoadError(r.error);
        setLoading(false);
    }, []);

    useEffect(() => {
        let live = true;
        void read().then((r) => live && apply(r));
        return () => {
            live = false;
        };
    }, [read, apply]);

    const points = Math.floor(Number(amount));
    const valid = Number.isInteger(points) && points > 0 && note.trim().length > 0;

    const adjust = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/points`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ points: direction === "add" ? points : -points, note: note.trim() }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setSaveError(json?.error ?? "Could not adjust the points.");
                return;
            }
            if (json.view) setView(json.view as PointsView);
            else apply(await read());
            setOpen(false);
            setAmount("");
            setNote("");
        } catch {
            setSaveError("Could not adjust the points.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Coins className="h-4 w-4" />
                    Points
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading && !view ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : loadError && !view ? (
                    <p className="text-sm text-destructive">{loadError}</p>
                ) : view?.partner ? (
                    <p className="text-sm text-muted-foreground">Partner: points don&apos;t apply. Partners have their own milestone tiers.</p>
                ) : view ? (
                    <>
                        <div className="space-y-1">
                            <p className="text-lg font-semibold">{formatPoints(view.balance.available)}</p>
                            {view.balance.pending > 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    {formatPoints(view.balance.pending)} pending, from {view.pending.length} order
                                    {view.pending.length === 1 ? "" : "s"}
                                </p>
                            ) : null}
                            {view.milestones && view.milestones.total > 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    {view.milestones.earned.toLocaleString("en-SG")} points earned from orders:{" "}
                                    {view.milestones.reached} of {view.milestones.total} bonus milestones reached
                                </p>
                            ) : null}
                            {!view.enabled ? (
                                <p className="text-xs text-muted-foreground">Points are switched off: customers don&apos;t see them yet.</p>
                            ) : null}
                        </div>

                        {view.pending.length ? (
                            <ul className="space-y-1 text-xs">
                                {view.pending.map((p) => (
                                    <li key={p.orderId} className="flex justify-between gap-2">
                                        <Link className="underline" href={withLocale(`/settings/orders?search=${encodeURIComponent(p.orderNumber)}`, locale)}>
                                            {p.orderNumber}
                                        </Link>
                                        <span className="text-muted-foreground">
                                            {p.points.toLocaleString("en-SG")} · {p.releaseAt ? `usable from ${formatAdminDateMY(p.releaseAt)}` : "after delivery"}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : null}

                        {view.history.length ? (
                            <ul className="divide-y text-xs">
                                {view.history.map((e) => (
                                    <li key={e.id} className="flex items-start justify-between gap-3 py-1.5">
                                        <span className="min-w-0">
                                            <span className="block font-medium">{POINTS_KIND_LABEL[e.kind]}</span>
                                            <span className="block text-muted-foreground">
                                                {formatAdminDateMY(e.createdAt)}
                                                {e.orderNumber ? ` · ${e.orderNumber}` : ""}
                                                {e.createdBy ? ` · ${e.createdBy}` : ""}
                                            </span>
                                            {e.note ? <span className="block break-words text-muted-foreground">{e.note}</span> : null}
                                        </span>
                                        <span className="shrink-0 text-right tabular-nums">
                                            {signed(e.points)}
                                            <span className="block text-muted-foreground">{formatDollars(pointsToDollars(e.points))}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-xs text-muted-foreground">No points yet.</p>
                        )}

                        <Button variant="outline" size="sm" disabled={!canEdit} onClick={() => setOpen(true)}>
                            Adjust points
                        </Button>
                        {!canEdit ? <p className="text-xs text-muted-foreground">Adjusting points needs permission to make changes.</p> : null}
                    </>
                ) : null}
            </CardContent>

            <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Adjust points</DialogTitle>
                        <DialogDescription>
                            Every adjustment is kept in the history with your name and reason. The balance can&apos;t go below zero.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <Button type="button" size="sm" variant={direction === "add" ? "default" : "outline"} onClick={() => setDirection("add")}>
                                Add
                            </Button>
                            <Button type="button" size="sm" variant={direction === "remove" ? "default" : "outline"} onClick={() => setDirection("remove")}>
                                Remove
                            </Button>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="points-amount">Points</Label>
                            <Input id="points-amount" type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
                            {Number.isInteger(points) && points > 0 ? (
                                <p className="text-xs text-muted-foreground">{formatDollars(pointsToDollars(points))}</p>
                            ) : null}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="points-note">Reason</Label>
                            <Textarea id="points-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
                        </div>
                        {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button onClick={adjust} disabled={!valid || saving}>
                            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                            {direction === "add" ? "Add" : "Remove"} {Number.isInteger(points) && points > 0 ? points.toLocaleString("en-SG") : ""} points
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
