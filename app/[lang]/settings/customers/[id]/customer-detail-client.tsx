"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useSettingsBreadcrumbDetail } from "@/components/settings/settings-breadcrumb-context";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSGD(amount: number): string {
    return new Intl.NumberFormat("en-SG", {
        style: "currency",
        currency: "SGD",
    }).format(amount);
}

function formatDate(dateStr: string): string {
    return new Intl.DateTimeFormat("en-MY", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(new Date(dateStr));
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

export default function CustomerDetailPage() {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const params = useParams<{ id: string }>();
    const customerId = params.id;

    const [customer, setCustomer] = useState<Customer | null>(null);
    const [loading, setLoading] = useState(true);

    // Orders
    const [orders, setOrders] = useState<Order[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(true);

    // Addresses
    const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
    const [addressesLoading, setAddressesLoading] = useState(true);

    // Editable fields
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [phone, setPhone] = useState("");
    const [notes, setNotes] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");

    useSettingsBreadcrumbDetail(
        [firstName, lastName].filter(Boolean).join(" ") || customer?.email || null,
    );

    // Saving
    const [saving, setSaving] = useState(false);

    // Add address dialog
    const [addAddressOpen, setAddAddressOpen] = useState(false);
    const [addressForm, setAddressForm] = useState<AddressFormState>(emptyAddress);
    const [savingAddress, setSavingAddress] = useState(false);

    const fetchCustomer = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}`);
            const json = await res.json();
            setCustomer(json);
            setFirstName(json.first_name ?? "");
            setLastName(json.last_name ?? "");
            setPhone(json.phone ?? "");
            setNotes(json.notes ?? "");
            setTags(json.tags ?? []);
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
            setAddresses(json.addresses ?? json ?? []);
        } catch {
            setAddresses([]);
        } finally {
            setAddressesLoading(false);
        }
    }, [customerId]);

    useEffect(() => {
        fetchCustomer();
        fetchOrders();
        fetchAddresses();
    }, [fetchCustomer, fetchOrders, fetchAddresses]);

    const saveChanges = async () => {
        setSaving(true);
        try {
            await fetch(`/api/shop/customers/${customerId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    first_name: firstName,
                    last_name: lastName,
                    phone: phone || null,
                    notes: notes || null,
                    tags,
                }),
            });
            await fetchCustomer();
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
                        Back to Customers
                    </Link>
                </Button>
                <p className="text-muted-foreground">Customer not found.</p>
            </div>
        );
    }

    const displayName =
        [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
        customer.email;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" asChild>
                    <Link href={to("/settings/customers")}>
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Customers
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Customer since {formatDate(customer.created_at)}
                    </p>
                </div>
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ── Left: Orders + Addresses ── */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Order History */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <ShoppingCart className="h-4 w-4" />
                                Order History
                            </CardTitle>
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
                                                            className="font-bold font-mono text-sm text-primary hover:underline"
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
                                                            className={`capitalize ${customClass}`}
                                                        >
                                                            {order.status}
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

                    {/* Addresses */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                Addresses
                            </CardTitle>
                            <Dialog open={addAddressOpen} onOpenChange={setAddAddressOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" variant="outline">
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add Address
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-lg">
                                    <DialogHeader>
                                        <DialogTitle>Add Address</DialogTitle>
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
                                            <Label>Address Line 1</Label>
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
                                                Address Line 2{" "}
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
                                            <Label>Postal Code</Label>
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
                                            Add Address
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
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
                                        <div
                                            key={addr.id}
                                            className="rounded-lg border p-3 text-sm space-y-1"
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
                </div>

                {/* ── Right: Info + Stats + Tags + Notes ── */}
                <div className="space-y-4">
                    {/* Info Card */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <User className="h-4 w-4" />
                                Customer Info
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="first-name">First Name</Label>
                                    <Input
                                        id="first-name"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="last-name">Last Name</Label>
                                    <Input
                                        id="last-name"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1 text-sm">
                                <div className="flex items-center gap-1.5 text-muted-foreground py-1">
                                    <Mail className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">{customer.email}</span>
                                </div>
                            </div>
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
                                        placeholder="+60..."
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                                <Clock className="h-3.5 w-3.5" />
                                <span>Locale: {customer.locale}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="h-3.5 w-3.5" />
                                <span>Joined {formatDate(customer.created_at)}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Stats Card */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Stats</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <ShoppingCart className="h-4 w-4" />
                                    <span>Total Orders</span>
                                </div>
                                <span className="font-semibold">{customer.total_orders}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <DollarSign className="h-4 w-4" />
                                    <span>Total Spent</span>
                                </div>
                                <span className="font-semibold">
                                    {formatSGD(customer.total_spent)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Clock className="h-4 w-4" />
                                    <span>Member Since</span>
                                </div>
                                <span className="font-semibold">
                                    {formatDate(customer.created_at)}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tags Card */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Tags</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {tags.map((tag) => (
                                        <Badge
                                            key={tag}
                                            variant="secondary"
                                            className="cursor-pointer group pr-1.5"
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
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Add tag..."
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
                        </CardContent>
                    </Card>

                    {/* Notes Card */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Notes</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Textarea
                                placeholder="Internal notes about this customer..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={4}
                                className="resize-none"
                            />
                        </CardContent>
                    </Card>

                    {/* Save button */}
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
                        Save Changes
                    </Button>
                </div>
            </div>
        </div>
    );
}
