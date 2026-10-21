"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { formatAdminDateMY } from "@/lib/format/admin-date";
import {
    CONSENT_SOURCE_LABEL,
    MARKETING_EMAIL_STATE_LABEL,
    describeConsent,
    describeConsentChange,
    type MarketingConsentView,
    type MarketingEmailState,
} from "@/lib/marketing-consent/state";

const BADGE: Record<MarketingEmailState, "default" | "secondary" | "outline"> = {
    subscribed: "default",
    not_subscribed: "outline",
    unsubscribed: "secondary",
};

/**
 * Marketing consent (PRD-shopify-customer-migration slice 07): the state, its
 * source and date, and every change from `customer_consent_events`.
 *
 * Staff read it and do not set it: only the customer's own action, an
 * unsubscribe link or a complaint changes it, so the history stays
 * trustworthy. The one exception is a customer who asks Staff to stop: the
 * *Unsubscribe* button records that with source `support`, and needs
 * `customers-edit`. Nothing here subscribes anyone.
 *
 * Its own fetch, like the Aftercare card beside it, unless the page hands it
 * `initialView`.
 */
export function MarketingConsentCard({
    customerId,
    canEdit,
    initialView,
}: {
    customerId: string;
    canEdit: boolean;
    initialView?: MarketingConsentView;
}) {
    const [view, setView] = useState<MarketingConsentView | null>(initialView ?? null);
    const [loading, setLoading] = useState(!initialView);
    const hydrated = useRef(Boolean(initialView));
    const [loadError, setLoadError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/marketing-consent`);
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setLoadError(json?.error ?? "Could not load marketing consent.");
                return;
            }
            setView(json.view as MarketingConsentView);
        } catch {
            setLoadError("Could not load marketing consent.");
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    useEffect(() => {
        if (hydrated.current) {
            hydrated.current = false;
            return;
        }
        load();
    }, [load]);

    const unsubscribe = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/marketing-consent`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "unsubscribe" }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setSaveError(json?.error ?? "Could not unsubscribe them.");
                return;
            }
            if (json.view) setView(json.view as MarketingConsentView);
            else await load();
            setConfirming(false);
        } catch {
            setSaveError("Could not unsubscribe them.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Megaphone className="h-4 w-4" />
                    Marketing email
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading && !view ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : loadError && !view ? (
                    <p className="text-sm text-destructive">{loadError}</p>
                ) : view ? (
                    <>
                        <div className="space-y-1">
                            <Badge variant={BADGE[view.state]} className="text-xs font-normal">
                                {MARKETING_EMAIL_STATE_LABEL[view.state]}
                            </Badge>
                            <p className="text-xs text-muted-foreground">{describeConsent(view)}</p>
                        </div>

                        {view.state !== "unsubscribed" && (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!canEdit}
                                title={
                                    canEdit
                                        ? undefined
                                        : "Unsubscribing a customer needs the \"Customers: make changes\" permission"
                                }
                                onClick={() => {
                                    setSaveError(null);
                                    setConfirming(true);
                                }}
                            >
                                Unsubscribe
                            </Button>
                        )}

                        <div className="space-y-2 border-t pt-3">
                            <p className="text-xs font-medium text-muted-foreground">History</p>
                            {view.history.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No changes yet.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {view.history.map((e, i) => (
                                        <li key={`${e.createdAt}-${i}`} className="text-xs">
                                            <span className="font-medium">{describeConsentChange(e)}</span>{" "}
                                            <span className="text-muted-foreground">
                                                · {CONSENT_SOURCE_LABEL[e.source]} · {formatAdminDateMY(e.createdAt)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </>
                ) : null}
            </CardContent>

            <Dialog open={confirming} onOpenChange={(open) => !open && !saving && setConfirming(false)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Unsubscribe from marketing email?</DialogTitle>
                        <DialogDescription>
                            Use this when the customer has asked us to stop, by email, WhatsApp, phone or in
                            person. It is recorded as a support request. Only the customer can subscribe again,
                            from their account. Order, Result and aftercare emails continue.
                        </DialogDescription>
                    </DialogHeader>
                    {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirming(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button onClick={unsubscribe} disabled={saving}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Unsubscribe
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
