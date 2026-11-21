"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
    BedDouble,
    ChevronLeft,
    Gift,
    KeyRound,
    ListTodo,
    Loader2,
    MapPin,
    Pencil,
    Plus,
    Route,
    Save,
    Search,
    SlidersHorizontal,
    Star,
    StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { Customer, CustomerAddress } from "@/lib/types/ecommerce";
import { formatAdminDateMY } from "@/lib/format/admin-date";
import { useSettingsBreadcrumbDetail } from "@/components/settings/settings-breadcrumb-context";
import { toast } from "sonner";
import { changedCustomerFields } from "@/lib/crm/customer-patch";
import type { CustomerNote } from "@/lib/crm/note-rules";
import type { MigratedCustomerResult } from "@/lib/customer-migration/overview";
import { ContactCard, SignInFacts, signInSummary } from "./customer-account-cards";
import type { ContactFactsResult } from "@/lib/crm/contact-status";
import { AftercareCard } from "./aftercare-card";
import { MarketingConsentCard } from "./marketing-consent-card";
import { PointsCard } from "./points-card";
import { CustomerEntryCard } from "./customer-entry-card";
import type { CustomerEntryResult } from "@/lib/crm/customer-entry";
import { CustomerReviewsCard } from "./customer-reviews-card";
import { CustomerFittingsCard, type CustomerFittingsResult } from "./customer-fittings-card";
import { CustomerPillowCard } from "./customer-pillow-card";
import { CreateOrderDialog } from "./create-order-dialog";
import { CustomerJourney, type JourneyViewer } from "./customer-journey";
import type { ComposerMode } from "./journey-composer";
import { CallButton, CopyButton, CustomerShortcutsProvider, EmailButton, WhatsAppButton } from "./customer-shortcuts";
import { RailRow, RailRows } from "./rail-rows";
import type { CustomerPillowResult } from "@/lib/customer-pillow/view";
import type { AdminCustomerLifecycle } from "@/lib/ecommerce/admin/customers";
import type { CustomerUnsubscribeReason } from "@/lib/marketing-consent/unsubscribe-reasons-server";
import type { NextStep } from "@/lib/crm/next-step";
import { LIFECYCLE_STAGE_LABEL } from "@/lib/crm/lifecycle-stage";
import { parseCustomerTab, type CustomerTab } from "@/lib/crm/customer-tabs";
import { LifecycleStageBadge, UNENGAGED_TITLE, lifecycleNote } from "../lifecycle-stage-badge";

function formatSGD(amount: number): string {
    return new Intl.NumberFormat("en-SG", {
        style: "currency",
        currency: "SGD",
    }).format(amount);
}

function formatDate(dateStr: string): string {
    return formatAdminDateMY(dateStr);
}

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

export type CustomerDetailResponse = { ok: true; row: Customer } | { error: string };

export type CustomerDetailInitialData = {
    customer: CustomerDetailResponse;
    notes: CustomerNote[] | null;
    migration?: MigratedCustomerResult;
    contact?: ContactFactsResult;
    lifecycle?: AdminCustomerLifecycle | null;
    unsubscribeReason?: CustomerUnsubscribeReason | null;
    nextStep?: NextStep | null;
    fittings?: CustomerFittingsResult;
    pillow?: CustomerPillowResult;
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

export function CustomerDetailClient({
    initialData,
    canEdit,
    canImport = false,
    canCreateOrder = false,
    viewer,
    initialTab = "journey",
}: {
    initialData?: CustomerDetailInitialData;
    canEdit: boolean;
    canImport?: boolean;
    canCreateOrder?: boolean;
    viewer: JourneyViewer;
    initialTab?: CustomerTab;
}) {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const params = useParams<{ id: string }>();
    const customerId = params.id;

    const initialRow: Customer | null =
        initialData?.customer && "ok" in initialData.customer && initialData.customer.ok
            ? (initialData.customer.row as Customer)
            : null;
    const [customer, setCustomer] = useState<Customer | null>(initialRow);
    const lifecycle = initialData?.lifecycle ?? null;
    const [loading, setLoading] = useState(!initialData);

    const hydratedFromServer = useRef(Boolean(initialData));

    const [tab, setTab] = useState<CustomerTab>(initialTab);
    const [composerMode, setComposerMode] = useState<ComposerMode>("note");
    const [composerFocus, setComposerFocus] = useState(0);
    const [journeyReload, setJourneyReload] = useState(0);
    const [reviewCount, setReviewCount] = useState<number | null>(null);
    const [editing, setEditing] = useState(false);

    const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
    const [addressesLoading, setAddressesLoading] = useState(true);

    const [firstName, setFirstName] = useState(initialRow?.first_name ?? "");
    const [lastName, setLastName] = useState(initialRow?.last_name ?? "");
    const [phone, setPhone] = useState(initialRow?.phone ?? "");
    const [tags, setTags] = useState<string[]>(initialRow?.tags ?? []);
    const [tagInput, setTagInput] = useState("");

    useSettingsBreadcrumbDetail(
        [firstName, lastName].filter(Boolean).join(" ") || customer?.email || null,
    );

    const [saving, setSaving] = useState(false);

    const [createOrderOpen, setCreateOrderOpen] = useState(false);

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

    const fetchAddresses = useCallback(async () => {
        setAddressesLoading(true);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/addresses`);
            const json = await res.json();
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
        fetchAddresses();
    }, [fetchCustomer, fetchAddresses]);

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
            setEditing(false);
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

    const changeTab = (value: string) => {
        const next = parseCustomerTab(value);
        setTab(next);
        const url = new URL(window.location.href);
        if (next === "journey") url.searchParams.delete("tab");
        else url.searchParams.set("tab", next);
        window.history.replaceState(window.history.state, "", url);
    };

    const compose = (mode: ComposerMode) => {
        changeTab("journey");
        setComposerMode(mode);
        setComposerFocus((n) => n + 1);
        requestAnimationFrame(() => document.getElementById("composer")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };

    const cancelEdit = () => {
        setFirstName(customer.first_name ?? "");
        setLastName(customer.last_name ?? "");
        setPhone(customer.phone ?? "");
        setTags(customer.tags ?? []);
        setTagInput("");
        setEditing(false);
    };

    const fittings = initialData?.fittings;
    const hasPillowSection =
        initialData?.pillow !== undefined || fittings === null || (Array.isArray(fittings) && fittings.length > 0);

    const editForm = (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="first-name">First name</Label>
                    <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="last-name">Last name</Label>
                    <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="phone">
                    Mobile <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+65…" />
            </div>
            <div className="space-y-2">
                <p className="text-sm font-medium">Tags</p>
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-md:gap-2">
                        {tags.map((tag) => (
                            <Badge
                                key={tag}
                                variant="secondary"
                                className="cursor-pointer group pr-1.5 transition-colors active:bg-press max-md:min-h-11 max-md:px-3 max-md:text-sm"
                                onClick={() => removeTag(tag)}
                                title="Click to remove"
                            >
                                {tag}
                                <span className="ml-1 text-xs leading-none opacity-100">×</span>
                            </Badge>
                        ))}
                    </div>
                )}
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
                    <Button size="sm" variant="outline" onClick={addTag} disabled={!tagInput.trim()} aria-label="Add tag">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={cancelEdit} disabled={saving}>
                    Cancel
                </Button>
                <Button className="flex-1" onClick={saveChanges} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save changes
                </Button>
            </div>
        </div>
    );

    return (
        <CustomerShortcutsProvider
            customerId={customer.id}
            email={customer.email}
            phone={customer.phone ?? null}
            canLog={canEdit}
            onLogged={() => setJourneyReload((n) => n + 1)}
        >
            <div className="@container space-y-4 md:space-y-6">
                <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-start @3xl:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
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
                    <div className="flex flex-wrap gap-2 @3xl:justify-end">
                        <EmailButton size="default" />
                        <WhatsAppButton size="default" />
                        {canEdit ? (
                            <>
                                <Button variant="outline" onClick={() => compose("note")}>
                                    <StickyNote className="h-4 w-4" />
                                    Note
                                </Button>
                                <Button variant="outline" onClick={() => compose("followup")}>
                                    <ListTodo className="h-4 w-4" />
                                    Follow-up
                                </Button>
                            </>
                        ) : null}
                        {canCreateOrder ? (
                            <Button onClick={() => setCreateOrderOpen(true)}>
                                <Plus className="h-4 w-4" />
                                Create order
                            </Button>
                        ) : null}
                    </div>
                </div>

                <dl className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                    {lifecycle ? (
                        <>
                            <Stat
                                label="Purchases"
                                title="Paid orders with a product on them, Shopify-era orders included. A re-adjustment fee is not one."
                            >
                                {lifecycle.purchases}
                            </Stat>
                            <Stat
                                label="Bookings attended"
                                title="Re-adjustment bookings they came in for, including ones booked from the check-up reminder."
                            >
                                {lifecycle.attended_bookings}
                            </Stat>
                            <Stat
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
                                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">Fitting, on Shopify</span>
                                        ) : null}
                                    </>
                                ) : lifecycle.lifecycle_undated ? (
                                    "On Shopify"
                                ) : (
                                    "None"
                                )}
                            </Stat>
                            <Stat label="Last booking">
                                {lifecycle.last_readjusted_at ? formatDate(lifecycle.last_readjusted_at) : "None"}
                            </Stat>
                        </>
                    ) : null}
                    <Stat label="Total orders">{customer.total_orders}</Stat>
                    <Stat label="Total spent">{formatSGD(customer.total_spent)}</Stat>
                </dl>

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
                            <Button size="sm" variant="outline" className="self-start sm:self-auto" onClick={() => compose("followup")}>
                                Add a follow-up
                            </Button>
                        ) : null}
                    </div>
                ) : null}

                <div className="grid grid-cols-1 items-start gap-4 md:gap-6 @4xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
                    <aside className="min-w-0 space-y-4 md:space-y-6">
                        <ContactCard
                            customer={customer}
                            createdByImport={initialData?.migration?.ok ? initialData.migration.facts?.createdByImport : null}
                            contact={initialData?.contact}
                            headerAction={
                                canEdit && !editing ? (
                                    <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                                        <Pencil className="h-4 w-4" />
                                        Edit
                                    </Button>
                                ) : null
                            }
                            emailActions={
                                <>
                                    <EmailButton />
                                    <CopyButton text={customer.email} />
                                </>
                            }
                            mobileActions={
                                <>
                                    <WhatsAppButton />
                                    <CallButton />
                                    <CopyButton text={customer.phone ?? ""} />
                                </>
                            }
                            editForm={editing ? editForm : undefined}
                        >
                            <div className="space-y-1.5">
                                <dt className="text-xs text-muted-foreground">Tags</dt>
                                <dd>
                                    {tags.length > 0 ? (
                                        <span className="flex flex-wrap gap-1.5">
                                            {tags.map((tag) => (
                                                <Badge key={tag} variant="secondary">
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </span>
                                    ) : (
                                        <span className="text-sm text-muted-foreground">No tags.</span>
                                    )}
                                </dd>
                            </div>
                            {customer.locale ? <p className="text-xs text-muted-foreground">Locale: {customer.locale}</p> : null}
                        </ContactCard>

                        <RailRows>
                            <RailRow icon={KeyRound} label="Sign-in" summary={signInSummary(customer)}>
                                <SignInFacts customer={customer} />
                            </RailRow>

                            <RailRow
                                icon={MapPin}
                                label="Addresses"
                                summary={addressesLoading ? "…" : addresses.length === 0 ? "None saved" : `${addresses.length} saved`}
                            >
                                {addressesLoading ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading addresses…
                                    </div>
                                ) : addresses.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No saved addresses.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {addresses.map((addr) => (
                                            <div key={addr.id} className="space-y-1 border-b pb-3 text-sm last:border-b-0 last:pb-0">
                                                <div className="flex items-center gap-2">
                                                    {addr.label && <span className="font-medium">{addr.label}</span>}
                                                    {addr.is_default && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            Default
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="font-medium">{addr.recipient}</p>
                                                <p className="text-muted-foreground">
                                                    {addr.line1}
                                                    {addr.line2 && `, ${addr.line2}`}, {addr.city}
                                                    {addr.state && `, ${addr.state}`} {addr.postal_code}, {addr.country}
                                                </p>
                                                {addr.phone && <p className="text-muted-foreground">{addr.phone}</p>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {canEdit && (
                                    <Dialog open={addAddressOpen} onOpenChange={setAddAddressOpen}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" variant="outline">
                                                <Plus className="h-4 w-4" />
                                                Add address
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-lg">
                                            <DialogHeader>
                                                <DialogTitle>Add address</DialogTitle>
                                            </DialogHeader>
                                            <div className="grid grid-cols-2 gap-3 py-2">
                                                <AddressField className="col-span-2" label="Label" placeholder="e.g. Home, Office" value={addressForm.label} onChange={(v) => setAddressForm((f) => ({ ...f, label: v }))} />
                                                <AddressField className="col-span-2" label="Recipient" placeholder="Full name" value={addressForm.recipient} onChange={(v) => setAddressForm((f) => ({ ...f, recipient: v }))} />
                                                <AddressField className="col-span-2" label="Address line 1" value={addressForm.line1} onChange={(v) => setAddressForm((f) => ({ ...f, line1: v }))} />
                                                <AddressField className="col-span-2" label="Address line 2" optional value={addressForm.line2} onChange={(v) => setAddressForm((f) => ({ ...f, line2: v }))} />
                                                <AddressField label="City" value={addressForm.city} onChange={(v) => setAddressForm((f) => ({ ...f, city: v }))} />
                                                <AddressField label="State" value={addressForm.state} onChange={(v) => setAddressForm((f) => ({ ...f, state: v }))} />
                                                <AddressField label="Postal code" value={addressForm.postal_code} onChange={(v) => setAddressForm((f) => ({ ...f, postal_code: v }))} />
                                                <AddressField label="Country" value={addressForm.country} onChange={(v) => setAddressForm((f) => ({ ...f, country: v }))} />
                                                <AddressField className="col-span-2" label="Phone" optional value={addressForm.phone} onChange={(v) => setAddressForm((f) => ({ ...f, phone: v }))} />
                                            </div>
                                            <DialogFooter>
                                                <Button variant="outline" onClick={() => setAddAddressOpen(false)}>
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
                                                    {savingAddress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                                    Add address
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                )}
                            </RailRow>

                            <RailRow
                                icon={SlidersHorizontal}
                                label="Preferences"
                                summary={
                                    customer.marketing_email
                                        ? customer.marketing_email === "subscribed"
                                            ? "Marketing email on"
                                            : "Marketing email off"
                                        : undefined
                                }
                            >
                                <RowPart title="Aftercare">
                                    <AftercareCard customerId={customer.id} canEdit={canEdit} />
                                </RowPart>
                                <RowPart title="Marketing consent">
                                    <MarketingConsentCard customerId={customer.id} canEdit={canEdit} />
                                </RowPart>
                            </RailRow>

                            <RailRow icon={Gift} label="Points" summary="Balance and history">
                                <PointsCard customerId={customer.id} canEdit={canEdit} />
                            </RailRow>

                            {initialData?.entry ? (
                                <RailRow icon={Search} label="How they found us">
                                    <CustomerEntryCard entry={initialData.entry} />
                                </RailRow>
                            ) : null}
                        </RailRows>
                    </aside>

                    <Tabs value={tab} onValueChange={changeTab} className="min-w-0 gap-4 md:gap-6">
                        <div className="sticky top-0 z-20 -mx-1 bg-background/95 px-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                            <TabsList variant="line" size="lg" collapsible={false} aria-label="Customer sections">
                                <TabsTrigger value="journey" className="min-w-0 max-md:flex-1 max-md:px-2">
                                    <Route className="max-[420px]:hidden" />
                                    <span className="truncate">Journey</span>
                                </TabsTrigger>
                                <TabsTrigger value="pillow" className="min-w-0 max-md:flex-1 max-md:px-2">
                                    <BedDouble className="max-[420px]:hidden" />
                                    <span className="truncate md:hidden">Pillow</span>
                                    <span className="truncate max-md:hidden">Pillow and fittings</span>
                                </TabsTrigger>
                                <TabsTrigger value="reviews" className="min-w-0 max-md:flex-1 max-md:px-2">
                                    <Star className="max-[420px]:hidden" />
                                    <span className="truncate">Reviews</span>
                                    {reviewCount ? (
                                        <Badge variant="secondary" className="px-1.5 tabular-nums" aria-label={`${reviewCount} on record`}>
                                            {reviewCount}
                                        </Badge>
                                    ) : null}
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="journey" forceMount className="data-[state=inactive]:hidden">
                            <CustomerJourney
                                customerId={customer.id}
                                canEdit={canEdit}
                                viewer={viewer}
                                initialNotes={initialData ? initialData.notes : null}
                                migration={initialData?.migration}
                                importHistoryHref={canImport ? to("/settings/customers/import") : null}
                                nextStepText={initialData?.nextStep?.text ?? null}
                                stageLabel={lifecycle ? LIFECYCLE_STAGE_LABEL[lifecycle.lifecycle_stage] : null}
                                composerMode={composerMode}
                                onComposerModeChange={setComposerMode}
                                composerFocus={composerFocus}
                                reloadSignal={journeyReload}
                                onAnswerReview={() => {
                                    changeTab("reviews");
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                            />
                        </TabsContent>

                        <TabsContent value="pillow" forceMount className="space-y-4 data-[state=inactive]:hidden md:space-y-6">
                            <CustomerPillowCard
                                customerId={customer.id}
                                pillow={initialData?.pillow}
                                canEdit={canEdit}
                                customer={customer}
                                fittings={initialData?.fittings ?? []}
                            />
                            <CustomerFittingsCard customerId={customer.id} fittings={initialData?.fittings} />
                            {!hasPillowSection ? (
                                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                                    No pillow or fitting is on record for this customer yet.
                                </p>
                            ) : null}
                        </TabsContent>

                        <TabsContent value="reviews" forceMount className="data-[state=inactive]:hidden">
                            <CustomerReviewsCard customerId={customer.id} canEdit={canEdit} onCount={setReviewCount} />
                        </TabsContent>
                    </Tabs>
                </div>

                {canCreateOrder ? (
                    <CreateOrderDialog
                        open={createOrderOpen}
                        onOpenChange={setCreateOrderOpen}
                        customerId={customer.id}
                        customerName={displayName}
                        customerEmail={customer.email}
                        ordersHref={(orderId) => to(`/settings/orders/${orderId}`)}
                        onCreated={() => setJourneyReload((n) => n + 1)}
                    />
                ) : null}
            </div>
        </CustomerShortcutsProvider>
    );
}

function RowPart({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
            {children}
        </section>
    );
}

function AddressField({
    label,
    value,
    onChange,
    placeholder,
    optional = false,
    className,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    optional?: boolean;
    className?: string;
}) {
    return (
        <div className={`space-y-1.5 ${className ?? ""}`}>
            <Label>
                {label}
                {optional ? <span className="text-muted-foreground font-normal"> (optional)</span> : null}
            </Label>
            <Input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
    );
}

function Stat({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
    return (
        <div className="flex min-w-0 items-baseline gap-1.5">
            <dt className="text-muted-foreground" title={title}>
                {label}
            </dt>
            <dd className="font-semibold tabular-nums">{children}</dd>
        </div>
    );
}
