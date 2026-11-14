"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
    User,
    Mail,
    Phone,
    MapPin,
    Plus,
    Save,
    Loader2,
    ChevronLeft,
    ShoppingCart,
    DollarSign,
    Clock,
    Package,
    CalendarCheck,
    Globe,
    type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { Customer, CustomerAddress, Order, OrderStatus } from "@/lib/types/ecommerce";
import { formatAdminDateMY } from "@/lib/format/admin-date";
import { orderStatusLabel } from "@/lib/shop/order-display";
import { useSettingsBreadcrumbDetail } from "@/components/settings/settings-breadcrumb-context";
import { toast } from "sonner";
import { changedCustomerFields } from "@/lib/crm/customer-patch";
import type { CustomerNote } from "@/lib/crm/note-rules";
import { CustomerNotesCard, type CustomerNotesViewer } from "./customer-notes-card";
import { CustomerTimelineCard } from "./customer-timeline-card";
import type { MigratedCustomerResult } from "@/lib/customer-migration/overview";
import { ContactCard, FromShopifyCard } from "./customer-account-cards";
import type { ContactFactsResult } from "@/lib/crm/contact-status";
import { AftercareCard } from "./aftercare-card";
import { MarketingConsentCard } from "./marketing-consent-card";
import { PointsCard } from "./points-card";
import { CustomerEntryCard } from "./customer-entry-card";
import type { CustomerEntryResult } from "@/lib/crm/customer-entry";
import { CustomerFollowUpsCard } from "./customer-followups-card";
import { CustomerReviewsCard } from "./customer-reviews-card";
import { CustomerFittingsCard, type CustomerFittingsResult } from "./customer-fittings-card";
import { CustomerPillowCard } from "./customer-pillow-card";
import { CreateOrderDialog } from "./create-order-dialog";
import type { CustomerPillowResult } from "@/lib/customer-pillow/view";
import type { AdminCustomerLifecycle } from "@/lib/ecommerce/admin/customers";
import type { CustomerUnsubscribeReason } from "@/lib/marketing-consent/unsubscribe-reasons-server";
import type { NextStep } from "@/lib/crm/next-step";
import { LifecycleStageBadge, UNENGAGED_TITLE, lifecycleNote } from "../lifecycle-stage-badge";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSGD(amount: number): string {
    return new Intl.NumberFormat("en-SG", {
        style: "currency",
        currency: "SGD",
    }).format(amount);
}

function formatDate(dateStr: string): string {
    return formatAdminDateMY(dateStr);
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

// ─── Address form initial state ───────────────────────────────────────────────

type AddressFormState = {
    label: string;
    recipient: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    phone: string;
};

/**
 * Exactly the JSON `GET /api/shop/customers/[id]` returns: the `{ ok, row }`
 * envelope on success, `{ error }` with a 404 when the row is missing.
 */
export type CustomerDetailResponse = { ok: true; row: Customer } | { error: string };

export type CustomerDetailInitialData = {
    customer: CustomerDetailResponse;
    /** The Customer's notes, or null when the server could not read them. */
    notes: CustomerNote[] | null;
    /** What the Shopify import holds for them (migration slice 12): the From Shopify card. */
    migration?: MigratedCustomerResult;
    /** WhatsApp and the other numbers seen, matched by phone on the server (CRM slice 11). */
    contact?: ContactFactsResult;
    /** The Lifecycle stage (PRD-crm-retention-loop slice 03); null when it could not be read. */
    lifecycle?: AdminCustomerLifecycle | null;
    /** Why they unsubscribed, when they said (slice 11); null otherwise. */
    unsubscribeReason?: CustomerUnsubscribeReason | null;
    /** What to do now (PRD-crm-retention-loop slice 05); null when nothing is due or it could not be read. */
    nextStep?: NextStep | null;
    /** Fitting records from the old Google Form (ADR 0042); null when they could not be read. */
    fittings?: CustomerFittingsResult;
    /** Their pillow, drawn in the x-ray (ADR 0042 j); null when it could not be read. */
    pillow?: CustomerPillowResult;
    /** How they found us: first Visit's Entry source, and their own answer. A failed read says so on the card. */
    entry?: CustomerEntryResult;
};

const emptyAddress: AddressFormState = {
    label: "",
    recipient: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
    phone: "",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomerDetailClient({
    initialData,
    canEdit,
    canImport = false,
    canCreateOrder = false,
    viewer,
}: {
    initialData?: CustomerDetailInitialData;
    /**
     * Holds `customers-edit` (CRM slice 10). Without it every edit control is
     * left out and the fields read as text; the write routes refuse regardless.
     * The same flag lets the Notes card add and delete notes, and the
     * Follow-ups card add, complete, reassign and delete follow-ups.
     */
    canEdit: boolean;
    /** Holds `customer-import`: the From Shopify card links its batch in the import history. */
    canImport?: boolean;
    /** Holds `orders`: Create order makes a Staff order for them, paid by link (ADR 0048). */
    canCreateOrder?: boolean;
    /** Who is looking: decides which notes they may delete (CRM 02). */
    viewer: Omit<CustomerNotesViewer, "canEdit">;
}) {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const params = useParams<{ id: string }>();
    const customerId = params.id;

    // The route answers `{ ok: true, row }` (or `{ error }` on a miss); unwrap
    // the row so the header, dates and editable fields read real values.
    const initialRow: Customer | null =
        initialData?.customer && "ok" in initialData.customer && initialData.customer.ok
            ? (initialData.customer.row as Customer)
            : null;
    const [customer, setCustomer] = useState<Customer | null>(initialRow);
    const lifecycle = initialData?.lifecycle ?? null;
    const [loading, setLoading] = useState(!initialData);

    // The RSC page already read the customer — skip that mount fetch once. The
    // orders and addresses fetches still run on mount as before.
    const hydratedFromServer = useRef(Boolean(initialData));

    // Orders
    const [orders, setOrders] = useState<Order[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(true);

    // Addresses
    const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
    const [addressesLoading, setAddressesLoading] = useState(true);

    // Editable fields
    const [firstName, setFirstName] = useState(initialRow?.first_name ?? "");
    const [lastName, setLastName] = useState(initialRow?.last_name ?? "");
    const [phone, setPhone] = useState(initialRow?.phone ?? "");
    const [tags, setTags] = useState<string[]>(initialRow?.tags ?? []);
    const [tagInput, setTagInput] = useState("");

    useSettingsBreadcrumbDetail(
        [firstName, lastName].filter(Boolean).join(" ") || customer?.email || null,
    );

    // Saving
    const [saving, setSaving] = useState(false);

    // Create order (ADR 0048)
    const [createOrderOpen, setCreateOrderOpen] = useState(false);

    // Add address dialog
    const [addAddressOpen, setAddAddressOpen] = useState(false);
    const [addressForm, setAddressForm] = useState<AddressFormState>(emptyAddress);
    const [savingAddress, setSavingAddress] = useState(false);

    const fetchCustomer = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}`);
            const json = await res.json();
            if (!res.ok || !json?.ok || !json.row) {
                setCustomer(null);
                return;
            }
            const row = json.row as Customer;
            setCustomer(row);
            setFirstName(row.first_name ?? "");
            setLastName(row.last_name ?? "");
            setPhone(row.phone ?? "");
            setTags(row.tags ?? []);
        } catch {
            setCustomer(null);
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    const fetchOrders = useCallback(async () => {
        setOrdersLoading(true);
        try {
            const res = await fetch(
                `/api/shop/orders?customer_id=${customerId}&limit=50`
            );
            const json = await res.json();
            setOrders(json.rows ?? []);
        } catch {
            setOrders([]);
        } finally {
            setOrdersLoading(false);
        }
    }, [customerId]);

    const fetchAddresses = useCallback(async () => {
        setAddressesLoading(true);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/addresses`);
            const json = await res.json();
            // The route answers `{ ok, rows }`; anything else (an error body)
            // must not reach `addresses.map`.
            setAddresses(res.ok && Array.isArray(json?.rows) ? json.rows : []);
        } catch {
            setAddresses([]);
        } finally {
            setAddressesLoading(false);
        }
    }, [customerId]);

    useEffect(() => {
        if (hydratedFromServer.current) {
            hydratedFromServer.current = false;
        } else {
            fetchCustomer();
        }
        fetchOrders();
        fetchAddresses();
    }, [fetchCustomer, fetchOrders, fetchAddresses]);

    // Sends only the fields that changed; an empty name or phone clears it.
    // Notes save on their own, from the Notes card.
    const saveChanges = async () => {
        if (!customer) return;
        const { after } = changedCustomerFields(customer, {
            first_name: firstName,
            last_name: lastName,
            phone,
            tags,
        });
        if (Object.keys(after).length === 0) {
            toast.info("Nothing to save.");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(after),
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok || !payload?.row) {
                throw new Error(
                    typeof payload?.error === "string" ? payload.error : "Couldn't save the customer.",
                );
            }
            const row = payload.row as Customer;
            setCustomer(row);
            setFirstName(row.first_name ?? "");
            setLastName(row.last_name ?? "");
            setPhone(row.phone ?? "");
            setTags(row.tags ?? []);
            toast.success("Saved");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't save the customer.");
        } finally {
            setSaving(false);
        }
    };

    const addTag = () => {
        const trimmed = tagInput.trim();
        if (!trimmed || tags.includes(trimmed)) {
            setTagInput("");
            return;
        }
        setTags((prev) => [...prev, trimmed]);
        setTagInput("");
    };

    const removeTag = (tag: string) => {
        setTags((prev) => prev.filter((t) => t !== tag));
    };

    const saveAddress = async () => {
        setSavingAddress(true);
        try {
            await fetch(`/api/shop/customers/${customerId}/addresses`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(addressForm),
            });
            setAddAddressOpen(false);
            setAddressForm(emptyAddress);
            await fetchAddresses();
        } finally {
            setSavingAddress(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" size="sm" asChild>
                    <Link href={to("/settings/customers")}>
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Back to customers
                    </Link>
                </Button>
                <p className="text-muted-foreground">Customer not found.</p>
            </div>
        );
    }

    const displayName =
        [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
        customer.email;

    const note = lifecycle ? lifecycleNote(lifecycle, { unsubscribeReason: initialData?.unsubscribeReason?.reason ?? null }) : null;

    // Stats and columns follow the width the page has, not the window (a
    // container query), so a collapsed sidebar counts.
    return (
        <div className="@container space-y-4 md:space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" asChild className="max-md:hidden">
                    <Link href={to("/settings/customers")}>
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Customers
                    </Link>
                </Button>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
                        {lifecycle ? (
                            <LifecycleStageBadge stage={lifecycle.lifecycle_stage} undated={lifecycle.lifecycle_undated} />
                        ) : null}
                        {note ? (
                            <span className="text-xs text-muted-foreground" title={lifecycle?.unengaged ? UNENGAGED_TITLE : undefined}>
                                {note}
                            </span>
                        ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Customer since {formatDate(customer.created_at)}
                    </p>
                </div>
            </div>

            {/* PRD-crm-retention-loop slice 05: what now. Nothing due, no line. */}
            {initialData?.nextStep ? (
                <div
                    role="note"
                    aria-label="Next step"
                    className="flex flex-col gap-2 rounded-lg border border-dashed px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-3"
                >
                    <p className="min-w-0 flex-1">
                        <span className="font-medium">Next step</span>{" "}
                        <span className="text-muted-foreground">{initialData.nextStep.text}</span>
                    </p>
                    {initialData.nextStep.addFollowUp && canEdit ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="self-start sm:self-auto"
                            onClick={() => {
                                document.getElementById("follow-ups")?.scrollIntoView({ behavior: "smooth", block: "start" });
                                document.getElementById("followup-title")?.focus({ preventScroll: true });
                            }}
                        >
                            Add a follow-up
                        </Button>
                    ) : null}
                </div>
            ) : null}

            {/* Stats: one strip across the page, so the columns below hold only cards */}
            <Card className="py-4">
                <CardContent>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 @xl:grid-cols-3 @5xl:grid-cols-6">
                        {lifecycle ? (
                            <>
                                <Stat
                                    icon={Package}
                                    label="Purchases"
                                    title="Paid orders with a product on them, Shopify-era orders included. A re-adjustment fee is not one."
                                >
                                    {lifecycle.purchases}
                                </Stat>
                                <Stat
                                    icon={CalendarCheck}
                                    label="Bookings attended"
                                    title="Re-adjustment bookings they came in for, including ones booked from the check-up reminder."
                                >
                                    {lifecycle.attended_bookings}
                                </Stat>
                                <Stat
                                    icon={Clock}
                                    label="Last purchase"
                                    title={
                                        lifecycle.last_purchase_dated_by_fitting
                                            ? "A Shopify-era purchase, dated by their latest fitting record: the in-store visit such an order almost always was."
                                            : undefined
                                    }
                                >
                                    {lifecycle.last_purchase_at ? (
                                        <>
                                            {formatDate(lifecycle.last_purchase_at)}
                                            {lifecycle.last_purchase_dated_by_fitting ? (
                                                <span className="block text-xs font-normal text-muted-foreground">
                                                    Fitting, on Shopify
                                                </span>
                                            ) : null}
                                        </>
                                    ) : lifecycle.lifecycle_undated ? (
                                        "On Shopify"
                                    ) : (
                                        "None"
                                    )}
                                </Stat>
                                <Stat icon={Clock} label="Last booking">
                                    {lifecycle.last_readjusted_at ? formatDate(lifecycle.last_readjusted_at) : "None"}
                                </Stat>
                            </>
                        ) : null}
                        <Stat icon={ShoppingCart} label="Total orders">
                            {customer.total_orders}
                        </Stat>
                        <Stat icon={DollarSign} label="Total spent">
                            {formatSGD(customer.total_spent)}
                        </Stat>
                    </dl>
                </CardContent>
            </Card>

            {/*
              The cards in three groups: who they are, what happened, and the
              relationship since. One column; then what happened beside the
              other two, stacked; then all three side by side. `auto 1fr` rows
              keep the stacked pair together however long the timeline runs.
            */}
            <div className="grid grid-cols-1 items-start gap-4 md:gap-6 @3xl:grid-cols-5 @3xl:grid-rows-[auto_1fr] @5xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_minmax(0,2fr)] @5xl:grid-rows-1">
                {/* ── Who they are: details, contact, addresses, where the record came from ── */}
                <div className="min-w-0 space-y-4 md:space-y-6 @3xl:col-span-2 @3xl:col-start-4 @3xl:row-start-1 @5xl:col-span-1 @5xl:col-start-1">
                    {/* Info Card: details and tags, saved together. Notes save on their own. */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <User className="h-4 w-4" />
                                Customer info
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {canEdit ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="first-name">First name</Label>
                                        <Input
                                            id="first-name"
                                            value={firstName}
                                            onChange={(e) => setFirstName(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="last-name">Last name</Label>
                                        <Input
                                            id="last-name"
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm font-medium">
                                    {[firstName, lastName].filter(Boolean).join(" ") || "—"}
                                </p>
                            )}
                            <div className="space-y-1 text-sm">
                                <div className="flex items-center gap-1.5 text-muted-foreground py-1">
                                    <Mail className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">{customer.email}</span>
                                </div>
                            </div>
                            {canEdit ? (
                                <div className="space-y-1.5">
                                    <Label htmlFor="phone">
                                        Phone{" "}
                                        <span className="text-muted-foreground font-normal">
                                            (optional)
                                        </span>
                                    </Label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                        <Input
                                            id="phone"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            className="pl-9"
                                            placeholder="+60…"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Phone className="h-3.5 w-3.5 shrink-0" />
                                    <span>{phone || "No phone"}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Globe className="h-3.5 w-3.5" />
                                <span>Locale: {customer.locale}</span>
                            </div>
                            <div className="space-y-2 border-t pt-3">
                                <p className="text-sm font-medium">Tags</p>
                            {!canEdit && tags.length === 0 && (
                                <p className="text-sm text-muted-foreground">No tags.</p>
                            )}
                            {!canEdit && tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {tags.map((tag) => (
                                        <Badge key={tag} variant="secondary">
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                            {canEdit && tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 max-md:gap-2">
                                    {tags.map((tag) => (
                                        // The whole tag removes it: a 44px chip on a phone.
                                        <Badge
                                            key={tag}
                                            variant="secondary"
                                            className="cursor-pointer group pr-1.5 transition-colors active:bg-press max-md:min-h-11 max-md:px-3 max-md:text-sm"
                                            onClick={() => removeTag(tag)}
                                            title="Click to remove"
                                        >
                                            {tag}
                                            <span className="ml-1 text-xs leading-none opacity-100">
                                                ×
                                            </span>
                                        </Badge>
                                    ))}
                                </div>
                            )}
                            {canEdit && (
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Add a tag…"
                                        value={tagInput}
                                        onChange={(e) => setTagInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                addTag();
                                            }
                                        }}
                                        className="flex-1"
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={addTag}
                                        disabled={!tagInput.trim()}
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                            </div>
                            {canEdit && (
                                <Button
                                    className="w-full"
                                    onClick={saveChanges}
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="mr-2 h-4 w-4" />
                                    )}
                                    Save changes
                                </Button>
                            )}
                        </CardContent>
                    </Card>

                    {/* Contact status, for every Customer (CRM slice 11; migration slice 12's Account card) */}
                    <ContactCard
                        customer={customer}
                        createdByImport={
                            initialData?.migration?.ok ? initialData.migration.facts?.createdByImport : null
                        }
                        contact={initialData?.contact}
                    />

                    {/* Addresses */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                Addresses
                            </CardTitle>
                            {canEdit && (
                                <Dialog open={addAddressOpen} onOpenChange={setAddAddressOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" variant="outline">
                                            <Plus className="mr-2 h-4 w-4" />
                                            Add address
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-lg">
                                        <DialogHeader>
                                            <DialogTitle>Add address</DialogTitle>
                                        </DialogHeader>
                                        <div className="grid grid-cols-2 gap-3 py-2">
                                            <div className="col-span-2 space-y-1.5">
                                                <Label>Label</Label>
                                                <Input
                                                    placeholder="e.g. Home, Office"
                                                    value={addressForm.label}
                                                    onChange={(e) =>
                                                        setAddressForm((f) => ({
                                                            ...f,
                                                            label: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="col-span-2 space-y-1.5">
                                                <Label>Recipient</Label>
                                                <Input
                                                    placeholder="Full name"
                                                    value={addressForm.recipient}
                                                    onChange={(e) =>
                                                        setAddressForm((f) => ({
                                                            ...f,
                                                            recipient: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="col-span-2 space-y-1.5">
                                                <Label>Address line 1</Label>
                                                <Input
                                                    value={addressForm.line1}
                                                    onChange={(e) =>
                                                        setAddressForm((f) => ({
                                                            ...f,
                                                            line1: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="col-span-2 space-y-1.5">
                                                <Label>
                                                    Address line 2{" "}
                                                    <span className="text-muted-foreground font-normal">
                                                        (optional)
                                                    </span>
                                                </Label>
                                                <Input
                                                    value={addressForm.line2}
                                                    onChange={(e) =>
                                                        setAddressForm((f) => ({
                                                            ...f,
                                                            line2: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>City</Label>
                                                <Input
                                                    value={addressForm.city}
                                                    onChange={(e) =>
                                                        setAddressForm((f) => ({
                                                            ...f,
                                                            city: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>State</Label>
                                                <Input
                                                    value={addressForm.state}
                                                    onChange={(e) =>
                                                        setAddressForm((f) => ({
                                                            ...f,
                                                            state: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Postal code</Label>
                                                <Input
                                                    value={addressForm.postal_code}
                                                    onChange={(e) =>
                                                        setAddressForm((f) => ({
                                                            ...f,
                                                            postal_code: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Country</Label>
                                                <Input
                                                    value={addressForm.country}
                                                    onChange={(e) =>
                                                        setAddressForm((f) => ({
                                                            ...f,
                                                            country: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="col-span-2 space-y-1.5">
                                                <Label>
                                                    Phone{" "}
                                                    <span className="text-muted-foreground font-normal">
                                                        (optional)
                                                    </span>
                                                </Label>
                                                <Input
                                                    value={addressForm.phone}
                                                    onChange={(e) =>
                                                        setAddressForm((f) => ({
                                                            ...f,
                                                            phone: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <Button
                                                variant="outline"
                                                onClick={() => setAddAddressOpen(false)}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                onClick={saveAddress}
                                                disabled={
                                                    savingAddress ||
                                                    !addressForm.recipient.trim() ||
                                                    !addressForm.line1.trim() ||
                                                    !addressForm.city.trim() ||
                                                    !addressForm.postal_code.trim() ||
                                                    !addressForm.country.trim()
                                                }
                                            >
                                                {savingAddress ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Plus className="mr-2 h-4 w-4" />
                                                )}
                                                Add address
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            )}
                        </CardHeader>
                        <CardContent>
                            {addressesLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading addresses…
                                </div>
                            ) : addresses.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No saved addresses.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {addresses.map((addr) => (
                                        // Phones: rows split by a rule, not boxes inside the card.
                                        <div
                                            key={addr.id}
                                            className="rounded-lg border p-3 text-sm space-y-1 max-md:rounded-none max-md:border-x-0 max-md:border-t-0 max-md:p-0 max-md:pb-3 max-md:last:border-b-0 max-md:last:pb-0"
                                        >
                                            <div className="flex items-center gap-2">
                                                {addr.label && (
                                                    <span className="font-medium">{addr.label}</span>
                                                )}
                                                {addr.is_default && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        Default
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="font-medium">{addr.recipient}</p>
                                            <p className="text-muted-foreground">
                                                {addr.line1}
                                                {addr.line2 && `, ${addr.line2}`},{" "}
                                                {addr.city}
                                                {addr.state && `, ${addr.state}`}{" "}
                                                {addr.postal_code}, {addr.country}
                                            </p>
                                            {addr.phone && (
                                                <p className="text-muted-foreground">
                                                    {addr.phone}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Shopify-era facts, only for a Migrated customer */}
                    <FromShopifyCard
                        migration={initialData?.migration}
                        importHistoryHref={canImport ? to("/settings/customers/import") : null}
                    />
                </div>

                {/* ── What happened: orders, the to-dos and notes about them, then the timeline ── */}
                <div className="min-w-0 space-y-4 md:space-y-6 @3xl:col-span-3 @3xl:col-start-1 @3xl:row-span-2 @3xl:row-start-1 @5xl:col-span-1 @5xl:col-start-2 @5xl:row-span-1">
                    {/* Order History */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                            <CardTitle className="text-base flex items-center gap-2">
                                <ShoppingCart className="h-4 w-4" />
                                Order history
                            </CardTitle>
                            {canCreateOrder ? (
                                <Button size="sm" onClick={() => setCreateOrderOpen(true)}>
                                    <Plus className="h-4 w-4" />
                                    Create order
                                </Button>
                            ) : null}
                        </CardHeader>
                        <CardContent className="p-0">
                            {ordersLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                            ) : orders.length === 0 ? (
                                <div className="px-4 py-8 text-center">
                                    <p className="text-sm text-muted-foreground">
                                        No orders yet.
                                        {canCreateOrder
                                            ? " Create one to sell them a product or a service, paid by link."
                                            : ""}
                                    </p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                                            <TableHead className="px-4">Order #</TableHead>
                                            <TableHead className="px-4 hidden sm:table-cell">
                                                Date
                                            </TableHead>
                                            <TableHead className="px-4">Status</TableHead>
                                            <TableHead className="px-4 text-right">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {orders.map((order) => {
                                            const customClass = orderStatusBadgeClass(order.status);
                                            const variant = orderStatusBadgeVariant(order.status);
                                            return (
                                                <TableRow key={order.id}>
                                                    <TableCell className="px-4 py-3">
                                                        <Link
                                                            href={to(`/settings/orders/${order.id}`)}
                                                            className="font-bold text-sm text-primary hover:underline active:opacity-60 max-md:inline-flex max-md:min-h-11 max-md:items-center"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            #{order.order_number}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell className="px-4 hidden sm:table-cell text-sm text-muted-foreground whitespace-nowrap">
                                                        {formatDate(order.created_at)}
                                                    </TableCell>
                                                    <TableCell className="px-4">
                                                        <Badge
                                                            variant={
                                                                customClass ? "outline" : variant
                                                            }
                                                            className={customClass}
                                                        >
                                                            {orderStatusLabel(order.status)}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="px-4 text-right text-sm font-medium">
                                                        {formatSGD(order.total)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    {canCreateOrder ? (
                        <CreateOrderDialog
                            open={createOrderOpen}
                            onOpenChange={setCreateOrderOpen}
                            customerId={customer.id}
                            customerName={displayName}
                            customerEmail={customer.email}
                            ordersHref={(orderId) => to(`/settings/orders/${orderId}`)}
                            onCreated={() => void fetchOrders()}
                        />
                    ) : null}

                    {/* Pillow (ADR 0042 j): the x-ray of what they have, from a Staff link or their latest fitting */}
                    <CustomerPillowCard customerId={customer.id} pillow={initialData?.pillow} canEdit={canEdit} />

                    {/* Fitting history (ADR 0042): in-store fittings from the old Google Form, with their Drive photos */}
                    <CustomerFittingsCard customerId={customer.id} fittings={initialData?.fittings} />

                    {/* Follow-ups (CRM 06): dated to-dos, each assigned to a Staff profile */}
                    <CustomerFollowUpsCard customerId={customer.id} canEdit={canEdit} />

                    {/* Notes Card */}
                    <CustomerNotesCard
                        customerId={customer.id}
                        initialNotes={initialData ? initialData.notes : null}
                        viewer={{ ...viewer, canEdit }}
                    />

                    {/* Timeline (CRM 03): everything that happened, newest first */}
                    <CustomerTimelineCard customerId={customer.id} />
                </div>

                {/* ── The relationship: points, reviews, and what they agreed to receive ── */}
                <div className="min-w-0 space-y-4 md:space-y-6 @3xl:col-span-2 @3xl:col-start-4 @3xl:row-start-2 @5xl:col-span-1 @5xl:col-start-3 @5xl:row-start-1">
                    {/* Points (PRD-loyalty-points slice 02): balance, pending, history; Adjust needs customers-edit */}
                    <PointsCard customerId={customer.id} canEdit={canEdit} />
                    {/* Reviews (CRM slice 12): Google (Staff-linked), shop, and the review request */}
                    <CustomerReviewsCard customerId={customer.id} canEdit={canEdit} />

                    {/* How they found us: first Visit's Entry source beside their own answer (ADR 0007) */}
                    <CustomerEntryCard entry={initialData?.entry} />

                    {/* Aftercare switches (CRM slice 13): their own card, since the Contact card only reads */}
                    <AftercareCard customerId={customer.id} canEdit={canEdit} />

                    {/* Marketing consent, read-only but for a support unsubscribe (migration slice 07) */}
                    <MarketingConsentCard customerId={customer.id} canEdit={canEdit} />
                </div>
            </div>
        </div>
    );
}

/** One number in the Stats strip; `title` explains a count on hover. */
function Stat({
    icon: Icon,
    label,
    title,
    children,
}: {
    icon: LucideIcon;
    label: string;
    title?: string;
    children: ReactNode;
}) {
    return (
        <div className="min-w-0 space-y-1">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate" title={title}>
                    {label}
                </span>
            </dt>
            <dd className="text-lg font-semibold tabular-nums">{children}</dd>
        </div>
    );
}
