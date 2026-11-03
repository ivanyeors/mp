"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Printer, Truck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/i18n/currencies";
import type { Order } from "@/lib/types/ecommerce";
import type { CourierRate } from "@/lib/shipping/types";
import { isSelfCollectAddress } from "@/lib/shipping/self-collect";

type ShipmentInfo = {
    courier_service_id: string | null;
    quoted_carrier_cost: number | null;
    carrier_cost: number | null;
    label_state: string | null;
    /** Cancelled after a refund: nothing to print. */
    label_voided?: boolean;
    has_label: boolean;
    purchase_pending: boolean;
    easyship_shipment_id: string | null;
};

/** The courier the customer's choice comes to today, from the rates endpoint. */
type CustomerPick = {
    courierServiceId: string | null;
    by: "checkout" | "method" | "cheapest" | null;
    methodName: string | null;
    paidForUnavailable: string | null;
};

const NO_PICK: CustomerPick = { courierServiceId: null, by: null, methodName: null, paidForUnavailable: null };

/** Orders a label can still be made for: paid, not shipped, not unwound. */
const SHIPPABLE = new Set(["confirmed", "processing"]);

function transit(r: CourierRate): string {
    if (r.min_days == null) return "";
    const max = r.max_days ?? r.min_days;
    return r.min_days === max ? `${max} ${max === 1 ? "day" : "days"}` : `${r.min_days}–${max} days`;
}

/**
 * The Easyship half of the order's Fulfillment card: what the shopper chose and
 * "Print label", the PDF for the box. The label is made when the order is paid
 * (ADR 0044); when it was not, "Create label" shows today's rates for this
 * order's parcels with the customer's courier preselected.
 */
export function EasyshipFulfilment({
    order,
    onChanged,
}: {
    order: Order;
    /** Refetch the order and timeline after a label is made. */
    onChanged: () => Promise<unknown>;
}) {
    const [open, setOpen] = useState(false);
    const [loadingRates, setLoadingRates] = useState(false);
    const [rates, setRates] = useState<CourierRate[] | null>(null);
    const [ratesError, setRatesError] = useState<string | null>(null);
    const [selected, setSelected] = useState<string>("");
    const [pick, setPick] = useState<CustomerPick>(NO_PICK);
    const [buying, setBuying] = useState(false);
    // Server-only shipment data (courier cost, label) comes from its own endpoint.
    const [shipment, setShipment] = useState<ShipmentInfo | null>(null);
    const [connected, setConnected] = useState(false);

    const loadShipment = useCallback(async () => {
        try {
            const res = await fetch(`/api/shop/orders/${order.id}/easyship`);
            const json = await res.json().catch(() => null);
            if (res.ok && json?.ok) {
                setShipment(json.shipment ?? null);
                setConnected(json.connected === true);
            }
        } catch {
            /* the card still offers manual fulfilment */
        }
    }, [order.id]);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/shop/orders/${order.id}/easyship`)
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                if (cancelled || !json?.ok) return;
                setShipment(json.shipment ?? null);
                setConnected(json.connected === true);
            })
            .catch(() => {
                /* the card still offers manual fulfilment */
            });
        return () => {
            cancelled = true;
        };
    }, [order.id, order.status, order.tracking_number]);

    const labelHref = `/api/shop/orders/${order.id}/easyship/label`;
    const carrierCost = shipment?.carrier_cost ?? shipment?.quoted_carrier_cost ?? null;

    const openDialog = async () => {
        setOpen(true);
        setLoadingRates(true);
        setRates(null);
        setRatesError(null);
        setPick(NO_PICK);
        try {
            const res = await fetch(`/api/shop/orders/${order.id}/easyship/rates`, { method: "POST" });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setRatesError(typeof json?.error === "string" ? json.error : "Couldn't get courier rates.");
                return;
            }
            const list = json.rates as CourierRate[];
            setRates(list);
            // The customer's courier: the one they paid for, else what their method picks today.
            const preselected = json.selected_courier_service_id as string | null;
            setPick({
                courierServiceId: preselected,
                by: json.selected_by ?? null,
                methodName: json.method_name ?? null,
                paidForUnavailable: json.paid_for_unavailable ?? null,
            });
            setSelected(
                preselected && list.some((r) => r.courier_service_id === preselected)
                    ? preselected
                    : (list[0]?.courier_service_id ?? ""),
            );
        } catch {
            setRatesError("Couldn't reach the server. Try again.");
        } finally {
            setLoadingRates(false);
        }
    };

    const createLabel = async () => {
        if (!selected) return;
        setBuying(true);
        try {
            const res = await fetch(`/api/shop/orders/${order.id}/easyship`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ courier_service_id: selected }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                toast.error(typeof json?.error === "string" ? json.error : "Couldn't make the label.");
                return;
            }
            toast.success(
                json.label_ready
                    ? "Label ready. Print it from this order."
                    : "Easyship is still making the label. Print label appears here when it's ready.",
            );
            setOpen(false);
            await Promise.all([onChanged(), loadShipment()]);
        } catch {
            toast.error("Couldn't reach the server. Try again.");
        } finally {
            setBuying(false);
        }
    };

    return (
        <div className="space-y-3">
            {(order.shipping_courier || carrierCost != null || order.shipping_tracking_status) && (
                <div className="space-y-1 text-sm">
                    {order.shipping_courier && (
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Courier</span>
                            <span className="text-right font-medium">{order.shipping_courier}</span>
                        </div>
                    )}
                    {carrierCost != null && (
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">
                                {shipment?.carrier_cost != null ? "Label cost" : "Quoted courier cost"}
                            </span>
                            <span>
                                {formatCurrency(Number(carrierCost), order.currency)}
                                <span className="text-muted-foreground">
                                    {" "}
                                    (charged {formatCurrency(Number(order.shipping_amount), order.currency)})
                                </span>
                            </span>
                        </div>
                    )}
                    {order.shipping_tracking_status && (
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Tracking</span>
                            <Badge variant="outline">{order.shipping_tracking_status}</Badge>
                        </div>
                    )}
                </div>
            )}

            {shipment?.has_label ? (
                <div className="space-y-1.5">
                    <Button asChild size="sm" variant="outline" className="w-full">
                        <a href={labelHref} target="_blank" rel="noopener noreferrer">
                            <Printer className="mr-2 h-4 w-4" />
                            Print label
                            <ExternalLink className="ml-auto h-3.5 w-3.5" />
                        </a>
                    </Button>
                    {SHIPPABLE.has(order.status) && !order.shipped_at && (
                        <p className="text-xs text-muted-foreground">
                            Stick it on the box. The order is marked shipped, and the customer emailed, when the
                            courier collects the parcel.
                        </p>
                    )}
                </div>
            ) : shipment?.label_voided ? (
                <p className="text-xs text-muted-foreground">
                    The label was cancelled when the order was refunded. Don&apos;t send the parcel.
                </p>
            ) : connected &&
              SHIPPABLE.has(order.status) &&
              order.shipping_address &&
              !isSelfCollectAddress(order.shipping_address) ? (
                <Button
                    size="sm"
                    className="w-full"
                    onClick={openDialog}
                    disabled={shipment?.purchase_pending === true}
                >
                    <Truck className="mr-2 h-4 w-4" />
                    {shipment?.purchase_pending ? "Making the label…" : "Create label"}
                </Button>
            ) : null}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create label</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        {loadingRates ? (
                            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Getting today&apos;s rates for this order…
                            </div>
                        ) : ratesError ? (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                {ratesError}
                            </div>
                        ) : rates && rates.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No courier serves this address for these parcels. Mark it shipped manually instead.
                            </p>
                        ) : (
                            <div className="space-y-2">
                            {pick.paidForUnavailable && (
                                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                                    {pick.paidForUnavailable}, which the customer paid for, isn&apos;t offered for
                                    this order today. Choose another courier.
                                </div>
                            )}
                            {pick.by === "method" && pick.methodName && !pick.paidForUnavailable && (
                                <p className="text-xs text-muted-foreground">
                                    Preselected from the customer&apos;s shipping method, {pick.methodName}.
                                </p>
                            )}
                            <div className="max-h-80 space-y-2 overflow-y-auto">
                                {rates?.map((r) => {
                                    // Paid for at checkout, or what the customer's method picks today.
                                    const badge =
                                        r.courier_service_id !== pick.courierServiceId
                                            ? null
                                            : pick.by === "checkout"
                                              ? "Customer's choice"
                                              : pick.by === "method"
                                                ? "Customer's method"
                                                : null;
                                    return (
                                        <label
                                            key={r.courier_service_id}
                                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                                                selected === r.courier_service_id
                                                    ? "border-primary bg-primary/5"
                                                    : "border-input hover:bg-accent/50"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="easyship_courier"
                                                value={r.courier_service_id}
                                                checked={selected === r.courier_service_id}
                                                onChange={() => setSelected(r.courier_service_id)}
                                                className="mt-0.5 accent-primary"
                                            />
                                            <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium">
                                                        {r.courier_name}
                                                        {badge && (
                                                            <Badge variant="secondary" className="ml-2">
                                                                {badge}
                                                            </Badge>
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">{transit(r)}</p>
                                                </div>
                                                <span className="shrink-0 text-sm font-semibold">
                                                    {formatCurrency(r.total_charge, r.currency)}
                                                </span>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            The courier&apos;s fee is charged to your Easyship account. The order is marked
                            shipped, and the customer emailed, when the courier collects the parcel.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={createLabel} disabled={buying || loadingRates || !selected}>
                            {buying ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Printer className="mr-2 h-4 w-4" />
                            )}
                            Create label
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
