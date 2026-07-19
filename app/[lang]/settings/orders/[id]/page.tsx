"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
    Package,
    Truck,
    CreditCard,
    User,
    Mail,
    Phone,
    MapPin,
    Plus,
    Save,
    Send,
    Clock,
    Loader2,
    ChevronLeft,
    ClipboardList,
    Link2,
    Unlink,
    Search,
    ExternalLink,
    RotateCcw,
    Ban,
    TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { useSettingsBreadcrumbDetail } from "@/components/settings/settings-breadcrumb-context";
import { formatCurrency } from "@/lib/i18n/currencies";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { Order, OrderItem, OrderMargin, OrderTimelineEvent, OrderStatus } from "@/lib/types/ecommerce";
import {
    groupBuildLinesByRole,
    isResultOrderBuildSnapshot,
} from "@/lib/results/order-build-snapshot";
import { CELLS } from "@/components/spatial/pillow-cell-grid";
import { isResultCustomisedOrder } from "@/lib/results/post-delivery-refund";

// ─── Constants ────────────────────────────────────────────────────────────────

const ORDER_STATUSES: OrderStatus[] = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
    "partially_refunded",
    "refunded",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSGD(amount: number): string {
    return formatCurrency(amount);
}

function formatDate(dateStr: string): string {
    return new Intl.DateTimeFormat("en-MY", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(dateStr));
}

function orderHasRestockableLines(order: Order): boolean {
    return (order.items ?? []).some(
        (item) => item.quantity - (item.returned_quantity ?? 0) > 0
    );
}

function shouldPromptRestock(order: Order): boolean {
    const refunded =
        order.status === "refunded" ||
        order.status === "partially_refunded" ||
        Number(order.amount_refunded ?? 0) > 0;
    return refunded && orderHasRestockableLines(order);
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

function orderStatusBadgeVariant(status: OrderStatus): BadgeVariant {
    switch (status) {
        case "pending":
            return "secondary";
        case "confirmed":
            return "default";
        case "cancelled":
            return "destructive";
        case "refunded":
        case "partially_refunded":
            return "outline";
        default:
            return "default";
    }
}

function orderStatusBadgeClass(status: OrderStatus): string {
    switch (status) {
        case "processing":
            return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
        case "shipped":
            return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800";
        case "delivered":
            return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
        default:
            return "";
    }
}

function formatMarginPct(pct: number | null | undefined): string {
    if (pct == null || Number.isNaN(pct)) return "—";
    return `${pct.toFixed(1)}%`;
}


export default function OrderDetailPage() {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = useCallback((href: string) => withLocale(href, locale), [locale]);
    const params = useParams<{ id: string }>();
    const orderId = params.id;

    const [order, setOrder] = useState<Order | null>(null);
    const [margin, setMargin] = useState<OrderMargin | null>(null);
    const [timeline, setTimeline] = useState<OrderTimelineEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [timelineLoading, setTimelineLoading] = useState(true);

    useSettingsBreadcrumbDetail(order ? `#${order.order_number}` : null);

    // Status update
    const [newStatus, setNewStatus] = useState<OrderStatus | "">("");
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // Notes
    const [internalNotes, setInternalNotes] = useState("");
    const [savingNotes, setSavingNotes] = useState(false);

    // Timeline note
    const [timelineNote, setTimelineNote] = useState("");
    const [addingNote, setAddingNote] = useState(false);

    // Fulfill dialog
    const [fulfillOpen, setFulfillOpen] = useState(false);
    const [trackingNumber, setTrackingNumber] = useState("");
    const [trackingUrl, setTrackingUrl] = useState("");
    const [fulfilling, setFulfilling] = useState(false);

    // Mp-config link
    type MpConfigLinked = { id: string; data: Record<string, unknown> | null; is_final: boolean; source: string; created_at: string };
    const [mpConfigResponses, setMpConfigResponses] = useState<MpConfigLinked[]>([]);
    const [mpConfigLoading, setMpConfigLoading] = useState(true);
    const [linkDialogOpen, setLinkDialogOpen] = useState(false);
    const [linkSearch, setLinkSearch] = useState("");
    const [linkCandidates, setLinkCandidates] = useState<MpConfigLinked[]>([]);
    const [linkCandidatesLoading, setLinkCandidatesLoading] = useState(false);
    const [linking, setLinking] = useState(false);
    const [creating, setCreating] = useState(false);

    // Inventory deduction status
    const [inventoryDeducted, setInventoryDeducted] = useState<boolean | null>(null);

    // Refund / cancel / restock
    const [refundOpen, setRefundOpen] = useState(false);
    const [refundAmount, setRefundAmount] = useState("");
    const [refunding, setRefunding] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [restockOpen, setRestockOpen] = useState(false);
    const [restockQty, setRestockQty] = useState<Record<string, string>>({});
    const [restocking, setRestocking] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [returnAcknowledged, setReturnAcknowledged] = useState(false);
    const [decidingRefund, setDecidingRefund] = useState(false);

    const fetchOrder = useCallback(async (): Promise<Order | null> => {
        setLoading(true);
        try {
            const res = await fetch(`/api/shop/orders/${orderId}`);
            const json = await res.json();
            const row = json.row ?? json;
            const normalized = {
                ...row,
                items: row.order_items ?? row.items ?? [],
            };
            setOrder(normalized);
            setMargin(json.margin ?? null);
            setInternalNotes(normalized.internal_notes ?? "");
            setNewStatus(normalized.status ?? "");
            return normalized;
        } catch {
            setOrder(null);
            setMargin(null);
            return null;
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    const fetchTimeline = useCallback(async () => {
        setTimelineLoading(true);
        try {
            const res = await fetch(`/api/shop/orders/${orderId}/timeline`);
            const json = await res.json();
            setTimeline(json.events ?? json.rows ?? []);
        } catch {
            setTimeline([]);
        } finally {
            setTimelineLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        fetchOrder();
        fetchTimeline();
    }, [fetchOrder, fetchTimeline]);

    // Derive inventory deduction status from timeline
    useEffect(() => {
        if (timeline.length > 0 && order) {
            const hasPaymentConfirmed = timeline.some((e) => e.event_type === "payment_confirmed");
            setInventoryDeducted(hasPaymentConfirmed && order.status !== "pending");
        }
    }, [timeline, order]);

    const updateStatus = async () => {
        if (!newStatus || !order) return;
        setUpdatingStatus(true);
        try {
            await fetch(`/api/shop/orders/${orderId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            await fetchOrder();
            await fetchTimeline();
        } finally {
            setUpdatingStatus(false);
        }
    };

    const saveNotes = async () => {
        setSavingNotes(true);
        try {
            await fetch(`/api/shop/orders/${orderId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ internal_notes: internalNotes }),
            });
        } finally {
            setSavingNotes(false);
        }
    };

    const addTimelineNote = async () => {
        if (!timelineNote.trim()) return;
        setAddingNote(true);
        try {
            await fetch(`/api/shop/orders/${orderId}/timeline`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ event_type: "note", message: timelineNote }),
            });
            setTimelineNote("");
            await fetchTimeline();
        } finally {
            setAddingNote(false);
        }
    };

    const handleFulfill = async () => {
        setFulfilling(true);
        try {
            await fetch(`/api/shop/orders/${orderId}/fulfill`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tracking_number: trackingNumber, tracking_url: trackingUrl }),
            });
            setFulfillOpen(false);
            setTrackingNumber("");
            setTrackingUrl("");
            await fetchOrder();
            await fetchTimeline();
        } finally {
            setFulfilling(false);
        }
    };

    const fetchMpConfigLinks = useCallback(async () => {
        setMpConfigLoading(true);
        try {
            const res = await fetch(`/api/shop/orders/${orderId}/mp-config-link`);
            const json = await res.json();
            setMpConfigResponses(json.responses ?? []);
        } catch {
            setMpConfigResponses([]);
        } finally {
            setMpConfigLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        fetchMpConfigLinks();
    }, [fetchMpConfigLinks]);

    const searchUnlinkedResults = useCallback(async (query: string) => {
        setLinkCandidatesLoading(true);
        try {
            const res = await fetch(`/api/mp-config/responses?limit=50&offset=0`);
            const json = await res.json();
            const all = (json.rows ?? []) as MpConfigLinked[];
            // Filter to unlinked results matching the search
            const q = query.trim().toLowerCase();
            const candidates = all.filter((r) => {
                if ((r as Record<string, unknown>).order_id) return false;
                if (!q) return true;
                const name = String((r.data as Record<string, unknown>)?.name ?? "").toLowerCase();
                return name.includes(q) || r.id.toLowerCase().includes(q);
            });
            setLinkCandidates(candidates);
        } catch {
            setLinkCandidates([]);
        } finally {
            setLinkCandidatesLoading(false);
        }
    }, []);

    const handleLinkResult = useCallback(async (responseId: string) => {
        setLinking(true);
        try {
            await fetch(`/api/shop/orders/${orderId}/mp-config-link`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ response_id: responseId }),
            });
            setLinkDialogOpen(false);
            await fetchMpConfigLinks();
        } finally {
            setLinking(false);
        }
    }, [orderId, fetchMpConfigLinks]);

    const handleCreateResult = useCallback(async () => {
        setCreating(true);
        try {
            const res = await fetch(`/api/shop/orders/${orderId}/mp-config-link`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ create: true }),
            });
            const json = await res.json();
            await fetchMpConfigLinks();
            if (json.created) {
                window.open(to(`/settings/results/${json.created}`), "_blank");
            }
        } finally {
            setCreating(false);
        }
    }, [orderId, fetchMpConfigLinks, to]);

    const handleUnlinkResult = useCallback(async (responseId: string) => {
        try {
            await fetch(`/api/shop/orders/${orderId}/mp-config-link`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ response_id: responseId }),
            });
            await fetchMpConfigLinks();
        } catch {
            // ignore
        }
    }, [orderId, fetchMpConfigLinks]);

    const refundableRemaining = order
        ? Math.max(0, Number(order.total) - Number(order.amount_refunded ?? 0))
        : 0;

    const isResultOrder = order
        ? isResultCustomisedOrder(order.items ?? [])
        : false;
    const pendingRefundRequest = order?.refund_request_status === "requested";

    // Accessory orders: direct staff refund. Result orders: only via request approve.
    const canRefund =
        !!order?.payment_reference &&
        order.status !== "refunded" &&
        order.status !== "pending" &&
        order.status !== "payment_failed" &&
        refundableRemaining > 0 &&
        !isResultOrder;

    const canCancel =
        !!order &&
        order.status !== "cancelled" &&
        order.status !== "refunded" &&
        !isResultOrder;

    const canRestock =
        !!order &&
        (order.status === "refunded" ||
            order.status === "partially_refunded" ||
            Number(order.amount_refunded ?? 0) > 0);

    const handleRefund = async () => {
        if (!order) return;
        setRefunding(true);
        setActionError(null);
        try {
            const trimmed = refundAmount.trim();
            const body =
                trimmed.length > 0
                    ? { amount: Number.parseFloat(trimmed) }
                    : {};
            const res = await fetch(`/api/shop/orders/${orderId}/refund`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Refund failed");
            setRefundOpen(false);
            setRefundAmount("");
            const updated = await fetchOrder();
            await fetchTimeline();
            if (updated && shouldPromptRestock(updated)) {
                setRestockOpen(true);
            }
        } catch (e) {
            setActionError(e instanceof Error ? e.message : "Refund failed");
        } finally {
            setRefunding(false);
        }
    };

    const handleCancel = async () => {
        setCancelling(true);
        setActionError(null);
        try {
            const res = await fetch(`/api/shop/orders/${orderId}/cancel`, {
                method: "POST",
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Cancel failed");
            setCancelOpen(false);
            await fetchOrder();
            await fetchTimeline();
        } catch (e) {
            setActionError(e instanceof Error ? e.message : "Cancel failed");
        } finally {
            setCancelling(false);
        }
    };

    const handleRefundRequestDecide = async (action: "approve" | "reject") => {
        setDecidingRefund(true);
        setActionError(null);
        try {
            const res = await fetch(`/api/shop/orders/${orderId}/refund-request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    in_person_return_acknowledged:
                        action === "approve" ? returnAcknowledged : undefined,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Request failed");
            setReturnAcknowledged(false);
            const updated = await fetchOrder();
            await fetchTimeline();
            if (action === "approve" && updated && shouldPromptRestock(updated)) {
                setRestockOpen(true);
            }
        } catch (e) {
            setActionError(e instanceof Error ? e.message : "Request failed");
        } finally {
            setDecidingRefund(false);
        }
    };

    const handleRestock = async () => {
        if (!order) return;
        const items = (order.items ?? [])
            .map((item) => {
                const qty = Number.parseInt(restockQty[item.id] ?? "0", 10);
                if (!qty || qty <= 0) return null;
                return { order_item_id: item.id, quantity: qty };
            })
            .filter(Boolean) as Array<{ order_item_id: string; quantity: number }>;

        if (items.length === 0) {
            setActionError("Enter a quantity to restock for at least one line");
            return;
        }

        setRestocking(true);
        setActionError(null);
        try {
            const res = await fetch(`/api/shop/orders/${orderId}/restock`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Restock failed");
            setRestockOpen(false);
            setRestockQty({});
            await fetchOrder();
            await fetchTimeline();
        } catch (e) {
            setActionError(e instanceof Error ? e.message : "Restock failed");
        } finally {
            setRestocking(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" size="sm" asChild>
                    <Link href={to("/settings/orders")}>
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Back to Orders
                    </Link>
                </Button>
                <p className="text-muted-foreground">Order not found.</p>
            </div>
        );
    }

    const customClass = orderStatusBadgeClass(order.status);
    const badgeVariant = orderStatusBadgeVariant(order.status);
    const hasUnitCost = (order.items ?? []).some(
        (item) => item.unit_cost != null && item.unit_cost > 0
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" asChild>
                    <Link href={to("/settings/orders")}>
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Orders
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Order #{order.order_number}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Placed {formatDate(order.created_at)}
                    </p>
                </div>
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ── Left: Items + Timeline ── */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Order Items */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Order Items</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                        <TableHead className="px-4 w-12" />
                                        <TableHead className="px-4">Product</TableHead>
                                        <TableHead className="px-4 hidden sm:table-cell">SKU</TableHead>
                                        <TableHead className="px-4 text-right">Qty</TableHead>
                                        <TableHead className="px-4 text-right hidden md:table-cell">Returned</TableHead>
                                        <TableHead className="px-4 text-right hidden sm:table-cell">
                                            Unit Price
                                        </TableHead>
                                        {hasUnitCost && (
                                            <TableHead className="px-4 text-right hidden lg:table-cell">
                                                Unit Cost
                                            </TableHead>
                                        )}
                                        <TableHead className="px-4 text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(order.items ?? []).map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="px-4 py-2 w-12">
                                                {item.image_url ? (
                                                    <div className="relative h-10 w-10 overflow-hidden rounded-md border bg-muted shrink-0">
                                                        <Image
                                                            src={item.image_url}
                                                            alt={item.product_title}
                                                            fill
                                                            className="object-cover"
                                                            sizes="40px"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted shrink-0">
                                                        <Package className="h-4 w-4 text-muted-foreground/50" />
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="px-4 py-3">
                                                <p className="font-medium text-sm">
                                                    {item.product_title}
                                                </p>
                                                {item.variant_title && (
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {item.variant_title}
                                                    </p>
                                                )}
                                            </TableCell>
                                            <TableCell className="px-4 hidden sm:table-cell text-xs font-mono text-muted-foreground">
                                                {item.sku || "—"}
                                            </TableCell>
                                            <TableCell className="px-4 text-right text-sm">
                                                {item.quantity}
                                            </TableCell>
                                            <TableCell className="px-4 text-right text-sm hidden md:table-cell text-muted-foreground">
                                                {item.returned_quantity ?? 0}
                                            </TableCell>
                                            <TableCell className="px-4 text-right text-sm hidden sm:table-cell text-muted-foreground">
                                                {formatSGD(item.unit_price)}
                                            </TableCell>
                                            {hasUnitCost && (
                                                <TableCell className="px-4 text-right text-sm hidden lg:table-cell text-muted-foreground">
                                                    {item.unit_cost != null && item.unit_cost > 0
                                                        ? formatSGD(item.unit_cost)
                                                        : "—"}
                                                </TableCell>
                                            )}
                                            <TableCell className="px-4 text-right text-sm font-medium">
                                                {formatSGD(item.total_price)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {/* Totals */}
                            <div className="border-t px-4 py-3 space-y-1.5 text-sm">
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Subtotal</span>
                                    <span>{formatSGD(order.subtotal)}</span>
                                </div>
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Shipping</span>
                                    <span>{formatSGD(order.shipping_amount)}</span>
                                </div>
                                {order.discount_amount > 0 && (
                                    <div className="flex justify-between text-green-600 dark:text-green-400">
                                        <span>Discount</span>
                                        <span>-{formatSGD(order.discount_amount)}</span>
                                    </div>
                                )}
                                {order.tax_amount > 0 && (
                                    <div className="flex justify-between text-muted-foreground">
                                        <span>Tax</span>
                                        <span>{formatSGD(order.tax_amount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-semibold border-t pt-1.5 mt-1">
                                    <span>Total</span>
                                    <span>{formatSGD(order.total)}</span>
                                </div>
                                {Number(order.amount_refunded ?? 0) > 0 && (
                                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                                        <span>Refunded</span>
                                        <span>-{formatSGD(Number(order.amount_refunded))}</span>
                                    </div>
                                )}
                            </div>
                            {canRestock && (
                                <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" variant="outline" className="w-full mt-3">
                                            <RotateCcw className="mr-2 h-4 w-4" />
                                            Restock returned items
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Restock returned items</DialogTitle>
                                        </DialogHeader>
                                        <p className="text-sm text-muted-foreground">
                                            Manual restock — inventory is not restored automatically on refund.
                                            Confirming restores each product&apos;s BOM parts back into inventory.
                                        </p>
                                        <div className="space-y-3 py-2">
                                            {(order.items ?? []).map((item) => {
                                                const remaining =
                                                    item.quantity - (item.returned_quantity ?? 0);
                                                if (remaining <= 0) return null;
                                                return (
                                                    <div key={item.id} className="flex items-center gap-2">
                                                        <Label className="flex-1 text-sm truncate">
                                                            {item.product_title}
                                                            <span className="text-muted-foreground ml-1">
                                                                (max {remaining})
                                                            </span>
                                                        </Label>
                                                        <Input
                                                            type="number"
                                                            min={1}
                                                            max={remaining}
                                                            className="w-20"
                                                            placeholder="0"
                                                            value={restockQty[item.id] ?? ""}
                                                            onChange={(e) =>
                                                                setRestockQty((prev) => ({
                                                                    ...prev,
                                                                    [item.id]: e.target.value,
                                                                }))
                                                            }
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {actionError && restockOpen && (
                                            <p className="text-sm text-destructive">{actionError}</p>
                                        )}
                                        <DialogFooter>
                                            <Button
                                                onClick={handleRestock}
                                                disabled={restocking}
                                            >
                                                {restocking ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <RotateCcw className="mr-2 h-4 w-4" />
                                                )}
                                                Confirm restock
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            )}
                        </CardContent>
                    </Card>

                    {/* Build snapshot / customization (Result path + legacy cart path) */}
                    {(order.items ?? []).some(
                        (item: OrderItem) =>
                            item.customization_id ||
                            isResultOrderBuildSnapshot(item.customization_snapshot),
                    ) && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <ClipboardList className="h-4 w-4" />
                                    Build snapshot
                                    {inventoryDeducted === true && (
                                        <Badge variant="outline" className="ml-auto text-xs text-green-600 border-green-300">
                                            Inventory deducted
                                        </Badge>
                                    )}
                                    {inventoryDeducted === false && order.status !== "pending" && (
                                        <Badge variant="outline" className="ml-auto text-xs text-red-600 border-red-300">
                                            Deduction missing
                                        </Badge>
                                    )}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {(order.items ?? [])
                                    .filter(
                                        (item: OrderItem) =>
                                            item.customization_id ||
                                            isResultOrderBuildSnapshot(item.customization_snapshot),
                                    )
                                    .map((item: OrderItem) => {
                                        const snapshot = item.customization_snapshot;
                                        const resultSnap = isResultOrderBuildSnapshot(snapshot)
                                            ? snapshot
                                            : null;

                                        if (resultSnap) {
                                            const assignment =
                                                resultSnap.product_type === "bolster"
                                                    ? `Length: ${resultSnap.assigned_length ?? "—"}`
                                                    : `Size ${resultSnap.assigned_size ?? "—"} · ${resultSnap.assigned_tier ?? "—"} tier`;
                                            const groups = groupBuildLinesByRole(resultSnap.build_lines);
                                            const nameByItem = new Map(
                                                resultSnap.build_lines.map((l) => [l.item_id, l.name]),
                                            );
                                            const placements = resultSnap.filling_placements ?? [];

                                            return (
                                                <div key={item.id} className="rounded-lg border p-4 space-y-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="font-medium text-sm">
                                                            {item.product_title}
                                                            {item.variant_title ? ` — ${item.variant_title}` : ""}
                                                        </div>
                                                        <Badge variant="secondary" className="text-xs shrink-0">
                                                            Result build
                                                        </Badge>
                                                    </div>
                                                    <div className="grid gap-2 sm:grid-cols-2 text-xs">
                                                        <div>
                                                            <span className="text-muted-foreground">Assignment</span>
                                                            <div className="font-medium capitalize">{assignment}</div>
                                                        </div>
                                                        <div>
                                                            <span className="text-muted-foreground">Filling Template</span>
                                                            <div className="font-medium">
                                                                {resultSnap.filling_template_name ??
                                                                    (resultSnap.filling_template_id != null
                                                                        ? `#${resultSnap.filling_template_id}`
                                                                        : "Custom mix")}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {placements.length > 0 && (
                                                        <div>
                                                            <div className="text-xs font-medium text-muted-foreground mb-1">
                                                                Placement breakdown
                                                            </div>
                                                            <div className="space-y-1">
                                                                {CELLS.map(({ section, subSection }) => {
                                                                    const pieces = placements
                                                                        .filter(
                                                                            (p) =>
                                                                                p.section === section &&
                                                                                p.sub_section === subSection,
                                                                        )
                                                                        .sort((a, b) => a.slot - b.slot)
                                                                        .map(
                                                                            (p) =>
                                                                                nameByItem.get(p.item_id) ??
                                                                                `Item #${p.item_id}`,
                                                                        );
                                                                    return (
                                                                        <div
                                                                            key={`${section}-${subSection}`}
                                                                            className="flex justify-between text-xs gap-2"
                                                                        >
                                                                            <span className="capitalize text-muted-foreground">
                                                                                {section} · {subSection}
                                                                            </span>
                                                                            <span className="text-right">
                                                                                {pieces.length ? pieces.join(", ") : "—"}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {groups.map((group) => (
                                                        <div key={group.role}>
                                                            <div className="text-xs font-medium text-muted-foreground mb-1">
                                                                {group.label}
                                                            </div>
                                                            <div className="space-y-1">
                                                                {group.lines.map((line) => (
                                                                    <div
                                                                        key={`${group.role}-${line.item_id}`}
                                                                        className="flex justify-between text-xs gap-2"
                                                                    >
                                                                        <span>
                                                                            {line.name ?? `Item #${line.item_id}`}
                                                                            {line.category ? (
                                                                                <span className="text-muted-foreground">
                                                                                    {" "}
                                                                                    ({line.category})
                                                                                </span>
                                                                            ) : null}
                                                                        </span>
                                                                        <span className="tabular-nums shrink-0">
                                                                            ×{line.quantity}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div className="flex flex-wrap items-center gap-3 pt-1 border-t text-xs">
                                                        <Link
                                                            href={to(`/settings/results/${resultSnap.result_id}`)}
                                                            className="text-primary hover:underline inline-flex items-center gap-1"
                                                        >
                                                            Open Result
                                                            <ExternalLink className="h-3 w-3" />
                                                        </Link>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={item.id} className="rounded-lg border p-4 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="font-medium text-sm">
                                                        {item.product_title} — {item.variant_title}
                                                    </div>
                                                    <Badge variant="secondary" className="text-xs">
                                                        Customized
                                                    </Badge>
                                                </div>

                                                {snapshot?.summary && (
                                                    <p className="text-sm text-muted-foreground">{snapshot.summary}</p>
                                                )}

                                                {snapshot?.filling_lines && snapshot.filling_lines.length > 0 && (
                                                    <div>
                                                        <div className="text-xs font-medium text-muted-foreground mb-1">Fillings</div>
                                                        <div className="flex flex-wrap gap-1">
                                                            {snapshot.filling_lines.map((fl, idx) => (
                                                                <span key={idx} className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs">
                                                                    {fl.quantity}x {fl.subtype || fl.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {snapshot?.config_lines && snapshot.config_lines.length > 0 && (
                                                    <div>
                                                        <div className="text-xs font-medium text-muted-foreground mb-1">Components</div>
                                                        <div className="space-y-1">
                                                            {snapshot.config_lines.map((cl, idx) => (
                                                                <div key={idx} className="flex justify-between text-xs">
                                                                    <span>{cl.name} ({cl.category})</span>
                                                                    <span>x{cl.quantity}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {(snapshot?.total_addon_price ?? 0) > 0 && (
                                                    <div className="text-xs text-primary font-medium">
                                                        Add-on price: {formatSGD(snapshot!.total_addon_price!)}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </CardContent>
                        </Card>
                    )}

                    {/* Order Timeline */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Order Timeline
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {timelineLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading timeline…
                                </div>
                            ) : timeline.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No events yet.</p>
                            ) : (
                                <ol className="relative border-l border-border ml-3 space-y-4">
                                    {timeline.map((event) => (
                                        <li key={event.id} className="pl-4">
                                            <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground/60" />
                                            <p className="text-xs text-muted-foreground">
                                                {formatDate(event.created_at)}
                                            </p>
                                            <p className="text-sm font-medium capitalize mt-0.5">
                                                {event.event_type.replace(/_/g, " ")}
                                            </p>
                                            {event.message && (
                                                <p className="text-sm text-muted-foreground mt-0.5">
                                                    {event.message}
                                                </p>
                                            )}
                                        </li>
                                    ))}
                                </ol>
                            )}

                            {/* Add note */}
                            <div className="flex gap-2 pt-2 border-t">
                                <Input
                                    placeholder="Add a note to this order..."
                                    value={timelineNote}
                                    onChange={(e) => setTimelineNote(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            addTimelineNote();
                                        }
                                    }}
                                    className="flex-1"
                                />
                                <Button
                                    size="sm"
                                    onClick={addTimelineNote}
                                    disabled={addingNote || !timelineNote.trim()}
                                >
                                    {addingNote ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* ── Right: Meta cards ── */}
                <div className="space-y-4">
                    {/* Status */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Status</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Badge
                                variant={customClass ? "outline" : badgeVariant}
                                className={`capitalize ${customClass}`}
                            >
                                {order.status}
                            </Badge>
                            <div className="flex gap-2">
                                <Select
                                    value={newStatus}
                                    onValueChange={(v) => setNewStatus(v as OrderStatus)}
                                >
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Change status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ORDER_STATUSES.map((s) => (
                                            <SelectItem key={s} value={s} className="capitalize">
                                                {s.charAt(0).toUpperCase() + s.slice(1)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    size="sm"
                                    onClick={updateStatus}
                                    disabled={
                                        updatingStatus ||
                                        !newStatus ||
                                        newStatus === order.status
                                    }
                                >
                                    {updatingStatus ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        "Update"
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Customer */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <User className="h-4 w-4" />
                                Customer
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            {order.customer && (
                                <p className="font-medium">
                                    {[order.customer.first_name, order.customer.last_name]
                                        .filter(Boolean)
                                        .join(" ") || "—"}
                                </p>
                            )}
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Mail className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{order.email}</span>
                            </div>
                            {order.phone && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Phone className="h-3.5 w-3.5 shrink-0" />
                                    <span>{order.phone}</span>
                                </div>
                            )}
                            {order.customer_id && (
                                <Link
                                    href={to(`/settings/customers/${order.customer_id}`)}
                                    className="text-xs text-primary hover:underline mt-1 inline-block"
                                >
                                    View customer profile →
                                </Link>
                            )}
                        </CardContent>
                    </Card>

                    {/* Mp-config Result */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <ClipboardList className="h-4 w-4" />
                                Mp-config Result
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {mpConfigLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading…
                                </div>
                            ) : mpConfigResponses.length > 0 ? (
                                <div className="space-y-2">
                                    {mpConfigResponses.map((r) => {
                                        const name = String((r.data as Record<string, unknown>)?.name ?? "") || "—";
                                        const size = String((r.data as Record<string, unknown>)?.online_recommended_size ?? "");
                                        const kind = String((r.data as Record<string, unknown>)?.online_recommended_kind ?? "");
                                        return (
                                            <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium truncate">{name}</p>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                            {r.source === "online_customization" ? "Online" : "In-store"}
                                                        </Badge>
                                                        {size && (
                                                            <span className="text-xs text-muted-foreground">
                                                                {kind} · {size}
                                                            </span>
                                                        )}
                                                        <Badge variant={r.is_final ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                                                            {r.is_final ? "Released" : "Active"}
                                                        </Badge>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1 shrink-0">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="min-h-11 min-w-11"
                                                        asChild
                                                    >
                                                        <Link href={to(`/settings/results/${r.id}`)}>
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                        </Link>
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="min-h-11 min-w-11 text-muted-foreground hover:text-destructive"
                                                        onClick={() => handleUnlinkResult(r.id)}
                                                    >
                                                        <Unlink className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No linked result.</p>
                            )}
                            <div className="flex gap-2">
                                <Dialog open={linkDialogOpen} onOpenChange={(open) => {
                                    setLinkDialogOpen(open);
                                    if (open) {
                                        setLinkSearch("");
                                        searchUnlinkedResults("");
                                    }
                                }}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" variant="outline" className="flex-1">
                                            <Link2 className="mr-1.5 h-3.5 w-3.5" />
                                            Link Existing
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-lg">
                                        <DialogHeader>
                                            <DialogTitle>Link Mp-config Result</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-3">
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="Search by name or ID…"
                                                    value={linkSearch}
                                                    onChange={(e) => {
                                                        setLinkSearch(e.target.value);
                                                        searchUnlinkedResults(e.target.value);
                                                    }}
                                                    className="flex-1"
                                                />
                                                <Button size="icon" variant="outline" disabled={linkCandidatesLoading} onClick={() => searchUnlinkedResults(linkSearch)}>
                                                    <Search className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            <div className="max-h-60 overflow-y-auto space-y-1">
                                                {linkCandidatesLoading ? (
                                                    <div className="flex items-center gap-2 py-4 justify-center text-sm text-muted-foreground">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Loading…
                                                    </div>
                                                ) : linkCandidates.length === 0 ? (
                                                    <p className="text-sm text-muted-foreground text-center py-4">
                                                        No unlinked results found.
                                                    </p>
                                                ) : (
                                                    linkCandidates.map((c) => {
                                                        const cName = String((c.data as Record<string, unknown>)?.name ?? "") || "—";
                                                        return (
                                                            <button
                                                                key={c.id}
                                                                type="button"
                                                                className="w-full text-left rounded-md border p-2 hover:bg-accent transition-colors"
                                                                disabled={linking}
                                                                onClick={() => handleLinkResult(c.id)}
                                                            >
                                                                <p className="text-sm font-medium">{cName}</p>
                                                                <p className="text-xs text-muted-foreground font-mono truncate">{c.id}</p>
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={handleCreateResult}
                                    disabled={creating}
                                >
                                    {creating ? (
                                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                                    )}
                                    Create Result
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Shipping */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                Shipping
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="text-muted-foreground leading-relaxed">
                                <p>{order.shipping_address.recipient}</p>
                                <p>{order.shipping_address.line1}</p>
                                {order.shipping_address.line2 && (
                                    <p>{order.shipping_address.line2}</p>
                                )}
                                <p>
                                    {order.shipping_address.city}
                                    {order.shipping_address.state
                                        ? `, ${order.shipping_address.state}`
                                        : ""}{" "}
                                    {order.shipping_address.postal_code}
                                </p>
                                <p>{order.shipping_address.country}</p>
                            </div>
                            {order.tracking_number && (
                                <div className="pt-2 border-t">
                                    <p className="text-xs font-medium text-muted-foreground mb-1">
                                        Tracking
                                    </p>
                                    {order.tracking_url ? (
                                        <a
                                            href={order.tracking_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-mono text-xs text-primary hover:underline"
                                        >
                                            {order.tracking_number}
                                        </a>
                                    ) : (
                                        <span className="font-mono text-xs">
                                            {order.tracking_number}
                                        </span>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Fulfillment */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Truck className="h-4 w-4" />
                                Fulfillment
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Dialog open={fulfillOpen} onOpenChange={setFulfillOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" variant="outline" className="w-full">
                                        <Truck className="mr-2 h-4 w-4" />
                                        Mark as Shipped
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Mark as Shipped</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 py-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="tracking-number">
                                                Tracking Number
                                            </Label>
                                            <Input
                                                id="tracking-number"
                                                placeholder="e.g. POS1234567MY"
                                                value={trackingNumber}
                                                onChange={(e) => setTrackingNumber(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="tracking-url">
                                                Tracking URL{" "}
                                                <span className="text-muted-foreground font-normal">
                                                    (optional)
                                                </span>
                                            </Label>
                                            <Input
                                                id="tracking-url"
                                                placeholder="https://..."
                                                value={trackingUrl}
                                                onChange={(e) => setTrackingUrl(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            variant="outline"
                                            onClick={() => setFulfillOpen(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={handleFulfill}
                                            disabled={fulfilling || !trackingNumber.trim()}
                                        >
                                            {fulfilling ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Truck className="mr-2 h-4 w-4" />
                                            )}
                                            Confirm Shipment
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </CardContent>
                    </Card>

                    {/* Payment */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <CreditCard className="h-4 w-4" />
                                Payment
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Method</span>
                                <span className="font-medium capitalize">
                                    {order.payment_method ?? "—"}
                                </span>
                            </div>
                            {order.payment_reference && (
                                <div className="flex justify-between gap-2">
                                    <span className="text-muted-foreground shrink-0">Reference</span>
                                    <span className="font-mono text-xs truncate text-right">
                                        {order.payment_reference}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Paid at</span>
                                <span>
                                    {order.paid_at ? formatDate(order.paid_at) : "—"}
                                </span>
                            </div>
                            {Number(order.amount_refunded ?? 0) > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Refunded</span>
                                    <span className="font-medium text-amber-600 dark:text-amber-400">
                                        {formatSGD(Number(order.amount_refunded))}
                                    </span>
                                </div>
                            )}
                            {isResultOrder && order.refund_request_status && (
                                <div className="rounded-md border p-3 space-y-2 text-sm">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-medium">Refund request</span>
                                        <Badge variant="secondary" className="text-xs capitalize">
                                            {order.refund_request_status}
                                        </Badge>
                                    </div>
                                    {order.refund_requested_at && (
                                        <p className="text-xs text-muted-foreground">
                                            Requested {formatDate(order.refund_requested_at)}
                                        </p>
                                    )}
                                    {order.refund_request_note && (
                                        <p className="text-xs">{order.refund_request_note}</p>
                                    )}
                                    {pendingRefundRequest && (
                                        <>
                                            <label className="flex items-start gap-2 text-xs cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5"
                                                    checked={returnAcknowledged}
                                                    onChange={(e) =>
                                                        setReturnAcknowledged(e.target.checked)
                                                    }
                                                />
                                                <span>
                                                    Customer returned the product in person
                                                </span>
                                            </label>
                                            {actionError && (
                                                <p className="text-sm text-destructive">{actionError}</p>
                                            )}
                                            <div className="flex flex-col gap-2">
                                                <Button
                                                    size="sm"
                                                    className="w-full"
                                                    disabled={decidingRefund || !returnAcknowledged}
                                                    onClick={() => handleRefundRequestDecide("approve")}
                                                >
                                                    {decidingRefund ? (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : null}
                                                    Approve refund
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full"
                                                    disabled={decidingRefund}
                                                    onClick={() => handleRefundRequestDecide("reject")}
                                                >
                                                    Reject request
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                            {isResultOrder && !order.refund_request_status && (
                                <p className="text-xs text-muted-foreground pt-1">
                                    Customised orders: customer requests refund after delivery;
                                    approve only after in-person return.
                                </p>
                            )}
                            {actionError && (refundOpen || cancelOpen) && (
                                <p className="text-sm text-destructive pt-1">{actionError}</p>
                            )}
                            <div className="flex flex-col gap-2 pt-2 border-t">
                                {canRefund && (
                                    <Dialog open={refundOpen} onOpenChange={(open) => {
                                        setRefundOpen(open);
                                        if (open) {
                                            setRefundAmount("");
                                            setActionError(null);
                                        }
                                    }}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" variant="outline" className="w-full">
                                                Issue refund
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Issue refund</DialogTitle>
                                            </DialogHeader>
                                            <p className="text-sm text-muted-foreground">
                                                Refundable balance: {formatSGD(refundableRemaining)}.
                                                Leave amount blank for a full refund. Stripe webhook updates the ledger.
                                            </p>
                                            <div className="space-y-1.5 py-2">
                                                <Label htmlFor="refund-amount">Amount (optional)</Label>
                                                <Input
                                                    id="refund-amount"
                                                    type="number"
                                                    min={0.01}
                                                    max={refundableRemaining}
                                                    step={0.01}
                                                    placeholder={String(refundableRemaining)}
                                                    value={refundAmount}
                                                    onChange={(e) => setRefundAmount(e.target.value)}
                                                />
                                            </div>
                                            {actionError && refundOpen && (
                                                <p className="text-sm text-destructive">{actionError}</p>
                                            )}
                                            <DialogFooter>
                                                <Button onClick={handleRefund} disabled={refunding}>
                                                    {refunding ? (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : null}
                                                    Confirm refund
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                )}
                                {canCancel && (
                                    <Dialog open={cancelOpen} onOpenChange={(open) => {
                                        setCancelOpen(open);
                                        if (open) setActionError(null);
                                    }}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" variant="destructive" className="w-full">
                                                <Ban className="mr-2 h-4 w-4" />
                                                Cancel order
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Cancel order</DialogTitle>
                                            </DialogHeader>
                                            <p className="text-sm text-muted-foreground">
                                                {order.payment_reference && order.paid_at
                                                    ? "This paid order will receive a full refund via Stripe."
                                                    : "This unpaid order will be cancelled with no money moved."}
                                            </p>
                                            {actionError && cancelOpen && (
                                                <p className="text-sm text-destructive">{actionError}</p>
                                            )}
                                            <DialogFooter>
                                                <Button
                                                    variant="destructive"
                                                    onClick={handleCancel}
                                                    disabled={cancelling}
                                                >
                                                    {cancelling ? (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Ban className="mr-2 h-4 w-4" />
                                                    )}
                                                    Confirm cancel
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Realized margin */}
                    {margin && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4" />
                                    Realized Margin
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Revenue (subtotal)</span>
                                    <span>{formatSGD(margin.revenue)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">COGS</span>
                                    <span>{formatSGD(margin.cogs)}</span>
                                </div>
                                {margin.discount > 0 && (
                                    <div className="flex justify-between text-green-600 dark:text-green-400">
                                        <span>Discount</span>
                                        <span>-{formatSGD(margin.discount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Shipping</span>
                                    <span>{formatSGD(margin.shipping)}</span>
                                </div>
                                {margin.tax > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Tax</span>
                                        <span>{formatSGD(margin.tax)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-semibold border-t pt-2 mt-1">
                                    <span>Gross margin</span>
                                    <span
                                        className={
                                            margin.gross_margin >= 0
                                                ? "text-green-600 dark:text-green-400"
                                                : "text-destructive"
                                        }
                                    >
                                        {formatSGD(margin.gross_margin)}
                                        {margin.margin_pct != null && (
                                            <span className="ml-1.5 font-normal text-muted-foreground">
                                                ({formatMarginPct(margin.margin_pct)})
                                            </span>
                                        )}
                                    </span>
                                </div>
                                {margin.net_revenue !== order.total && (
                                    <p className="text-xs text-muted-foreground pt-1">
                                        Net revenue after refunds: {formatSGD(margin.net_revenue)}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Notes */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Internal Notes</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Textarea
                                placeholder="Add internal notes visible only to staff..."
                                value={internalNotes}
                                onChange={(e) => setInternalNotes(e.target.value)}
                                rows={4}
                                className="resize-none"
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={saveNotes}
                                disabled={savingNotes}
                                className="w-full"
                            >
                                {savingNotes ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Save Notes
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
