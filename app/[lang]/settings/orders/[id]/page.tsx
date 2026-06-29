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
import { formatCurrency } from "@/lib/i18n/currencies";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { Order, OrderItem, OrderTimelineEvent, OrderStatus, ShippingAddress } from "@/lib/types/ecommerce";

// ─── Constants ────────────────────────────────────────────────────────────────

const ORDER_STATUSES: OrderStatus[] = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
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

function formatAddress(addr: ShippingAddress): string {
    const parts = [
        addr.recipient,
        addr.line1,
        addr.line2,
        `${addr.city}${addr.state ? `, ${addr.state}` : ""} ${addr.postal_code}`,
        addr.country,
    ].filter(Boolean);
    return parts.join(", ");
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const params = useParams<{ id: string }>();
    const orderId = params.id;

    const [order, setOrder] = useState<Order | null>(null);
    const [timeline, setTimeline] = useState<OrderTimelineEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [timelineLoading, setTimelineLoading] = useState(true);

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

    const fetchOrder = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/shop/orders/${orderId}`);
            const json = await res.json();
            setOrder(json);
            setInternalNotes(json.internal_notes ?? "");
            setNewStatus(json.status ?? "");
        } catch {
            setOrder(null);
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    const fetchTimeline = useCallback(async () => {
        setTimelineLoading(true);
        try {
            const res = await fetch(`/api/shop/orders/${orderId}/timeline`);
            const json = await res.json();
            setTimeline(json.events ?? json ?? []);
        } catch {
            setTimeline([]);
        } finally {
            setTimelineLoading(false);
        }
    }, [orderId]);

    // Check if inventory has been deducted for this order
    const checkInventoryDeduction = useCallback(async () => {
        try {
            const res = await fetch(`/api/shop/orders/${orderId}`);
            // We use a lightweight check — look for inventory_transactions via a dedicated query
            // For now, check if order status is confirmed+ and timeline has payment_confirmed event
            // A more robust check would query inventory_transactions directly
            setInventoryDeducted(null); // Will be computed from timeline
        } catch {
            setInventoryDeducted(null);
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
                                        <TableHead className="px-4 text-right hidden sm:table-cell">
                                            Unit Price
                                        </TableHead>
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
                                            <TableCell className="px-4 text-right text-sm hidden sm:table-cell text-muted-foreground">
                                                {formatSGD(item.unit_price)}
                                            </TableCell>
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
                            </div>
                        </CardContent>
                    </Card>

                    {/* Customization Details & Inventory Status */}
                    {(order.items ?? []).some((item: OrderItem) => item.customization_id) && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <ClipboardList className="h-4 w-4" />
                                    Customization Details
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
                                    .filter((item: OrderItem) => item.customization_id)
                                    .map((item: OrderItem) => {
                                        const snapshot = item.customization_snapshot;

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
                                                    <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                                                        <Link href={to(`/settings/results/${r.id}`)}>
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                        </Link>
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
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
                        </CardContent>
                    </Card>

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
