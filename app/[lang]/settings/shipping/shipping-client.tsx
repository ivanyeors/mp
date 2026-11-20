"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Truck, Loader2, Save, ChevronRight, AlertTriangle, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Card,
    CardContent,
} from "@/components/ui/card";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { formatCurrency, CURRENCY_CONFIG, BASE_CURRENCY } from "@/lib/i18n/currencies";
import type { EasyshipStrategy, ShippingRateSource } from "@/lib/types/ecommerce";
import { apiErrorMessage } from "./couriers/easyship-panel";
import { InfoTip } from "@/components/ui/info-tip";
import { findCountry, summarizeCountries } from "@/lib/shipping/countries";
import { methodDeliveryTime } from "@/lib/shipping/delivery-time";
import { CountryPicker } from "./country-picker";
import { CoverageCheck } from "./coverage-check";
import { CourierServicePicker } from "./courier-service-picker";
import { EmptyState } from "@/components/settings/empty-state";

const CURRENCY_SYMBOL = CURRENCY_CONFIG[BASE_CURRENCY].symbol;

type LocaleContent = {
    name?: string;
    description?: string;
    estimated_days?: string;
};

export type ShippingMethod = {
    id: string;
    slug: string;
    content: Record<string, LocaleContent>;
    base_rate: number;
    free_above: number | null;
    currency: string;
    countries: string[];
    is_active: boolean;
    position: number;
    rate_source?: ShippingRateSource;
    easyship_strategy?: EasyshipStrategy;
    easyship_courier_service_id?: string | null;
    markup_percent?: number;
    markup_fixed?: number;
    rate_rounding?: number;
    collect_location_id?: string | null;
};

export type CollectStudio = { id: string; name: string };

const DELIVERED = "deliver";

type ShippingForm = {
    slug: string;
    base_rate: string;
    free_above: string;
    countries: string[];
    is_active: boolean;
    rate_source: ShippingRateSource;
    easyship_strategy: EasyshipStrategy;
    easyship_courier_service_id: string;
    markup_percent: string;
    markup_fixed: string;
    rate_rounding: string;
    collect_location_id: string;
    had_collect: boolean;
    en: LocaleContent;
    zh: LocaleContent;
};

const LOCALES = [
    { key: "en-US", label: "English", short: "en" },
    { key: "zh-CN", label: "中文", short: "zh" },
] as const;

const STRATEGY_LABELS: Record<EasyshipStrategy, string> = {
    cheapest: "Cheapest courier",
    fastest: "Fastest courier",
    best_value: "Best value",
    courier: "A specific courier",
};

const ROUNDING_OPTIONS = [
    { value: "0", label: "No rounding" },
    { value: "0.1", label: "Up to the next 0.10" },
    { value: "0.5", label: "Up to the next 0.50" },
    { value: "1", label: "Up to the next 1.00" },
];

function getMethodName(method: ShippingMethod): string {
    const content =
        method.content?.["en-US"] ??
        method.content?.["en"] ??
        Object.values(method.content ?? {})[0];
    return content?.name ?? method.slug;
}

function methodToForm(m: ShippingMethod): ShippingForm {
    const en =
        m.content?.["en-US"] ??
        m.content?.["en"] ??
        ({} as LocaleContent);
    const zh =
        m.content?.["zh-CN"] ??
        m.content?.["zh"] ??
        ({} as LocaleContent);
    return {
        slug: m.slug,
        base_rate: String(m.base_rate),
        free_above: m.free_above !== null ? String(m.free_above) : "",
        countries: [...(m.countries ?? [])],
        is_active: m.is_active,
        rate_source: m.rate_source ?? "flat",
        easyship_strategy: m.easyship_strategy ?? "cheapest",
        easyship_courier_service_id: m.easyship_courier_service_id ?? "",
        markup_percent: String(m.markup_percent ?? 0),
        markup_fixed: String(m.markup_fixed ?? 0),
        rate_rounding: String(m.rate_rounding ?? 0),
        collect_location_id: m.collect_location_id ?? "",
        had_collect: Boolean(m.collect_location_id),
        en: { name: en.name ?? "", description: en.description ?? "", estimated_days: en.estimated_days ?? "" },
        zh: { name: zh.name ?? "", description: zh.description ?? "", estimated_days: zh.estimated_days ?? "" },
    };
}

const DEFAULT_FORM: ShippingForm = {
    slug: "",
    base_rate: "",
    free_above: "",
    countries: ["SG"],
    is_active: true,
    rate_source: "easyship",
    easyship_strategy: "cheapest",
    easyship_courier_service_id: "",
    markup_percent: "0",
    markup_fixed: "0",
    rate_rounding: "0",
    collect_location_id: "",
    had_collect: false,
    en: { name: "", description: "", estimated_days: "" },
    zh: { name: "", description: "", estimated_days: "" },
};

function formToPayload(form: ShippingForm): Record<string, unknown> {
    const content: Record<string, LocaleContent> = {};
    if (form.en.name || form.en.description || form.en.estimated_days) {
        content["en-US"] = form.en;
    }
    if (form.zh.name || form.zh.description || form.zh.estimated_days) {
        content["zh-CN"] = form.zh;
    }
    const countries = [...new Set(form.countries.map((c) => c.trim().toUpperCase()).filter(Boolean))];

    return {
        slug: form.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        content,
        base_rate: parseFloat(form.base_rate) || 0,
        free_above: form.free_above !== "" ? parseFloat(form.free_above) : null,
        countries,
        is_active: form.is_active,
        rate_source: form.collect_location_id ? "flat" : form.rate_source,
        easyship_strategy: form.easyship_strategy,
        easyship_courier_service_id: form.easyship_courier_service_id.trim() || null,
        markup_percent: parseFloat(form.markup_percent) || 0,
        markup_fixed: parseFloat(form.markup_fixed) || 0,
        rate_rounding: parseFloat(form.rate_rounding) || 0,
        ...(form.collect_location_id || form.had_collect
            ? { collect_location_id: form.collect_location_id || null }
            : {}),
    };
}

function liveRateSummary(m: ShippingMethod): string {
    const parts = [STRATEGY_LABELS[m.easyship_strategy ?? "cheapest"].toLowerCase()];
    const pct = Number(m.markup_percent ?? 0);
    const fixed = Number(m.markup_fixed ?? 0);
    if (pct) parts.push(`${pct > 0 ? "+" : ""}${pct}%`);
    if (fixed) parts.push(`${fixed > 0 ? "+" : "−"}${formatCurrency(Math.abs(fixed), m.currency)}`);
    if (Number(m.rate_rounding ?? 0) > 0) parts.push(`rounded up to ${Number(m.rate_rounding).toFixed(2)}`);
    return parts.join(", ");
}

function CountryBadges({ countries }: { countries: string[] }) {
    const labels = summarizeCountries(countries);
    const shown = labels.slice(0, 6);
    const rest = labels.length - shown.length;
    return (
        <div className="flex flex-wrap gap-1">
            {shown.map((label) => (
                <Badge key={label} variant="outline" className="text-xs px-1.5 py-0">
                    {label}
                </Badge>
            ))}
            {rest > 0 && (
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                    +{rest}
                </Badge>
            )}
        </div>
    );
}

export type ShippingInitialData = { ok: true; rows: ShippingMethod[] };

export type CouriersStatus = {
    environment: "sandbox" | "production" | null;
    boxes: number | null;
    unboxed: string[];
    unreadable: string | null;
    href: string;
};

function couriersSummary(c: CouriersStatus): string {
    if (!c.environment) return "Not connected";
    const parts = ["Connected", c.environment === "production" ? "Production" : "Sandbox"];
    if (c.boxes !== null) parts.push(`${c.boxes} box${c.boxes === 1 ? "" : "es"}`);
    return parts.join(", ");
}

export default function SettingsShippingPage({
    initialData,
    couriers,
    studios,
}: {
    initialData?: ShippingInitialData;
    couriers: CouriersStatus;
    studios: CollectStudio[];
}) {
    const [methods, setMethods] = useState<ShippingMethod[]>(initialData?.rows ?? []);
    const [loading, setLoading] = useState(!initialData);
    const skipFirstFetch = useRef(initialData != null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [sheetOpen, setSheetOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<ShippingForm>(DEFAULT_FORM);

    const [coverageOpen, setCoverageOpen] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<ShippingMethod | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchMethods = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/shop/shipping?include_inactive=1");
            const json = await res.json();
            setMethods(json.rows ?? []);
        } catch {
            setMethods([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (skipFirstFetch.current) {
            skipFirstFetch.current = false;
            return;
        }
        fetchMethods();
    }, [fetchMethods]);

    const openCreate = () => {
        setEditingId(null);
        setForm(DEFAULT_FORM);
        setError(null);
        setSheetOpen(true);
    };

    const openEdit = (method: ShippingMethod) => {
        setEditingId(method.id);
        setForm(methodToForm(method));
        setError(null);
        setSheetOpen(true);
    };

    const setField = <K extends keyof Omit<ShippingForm, "en" | "zh">>(field: K, value: ShippingForm[K]) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const setLocale = (
        locale: "en" | "zh",
        field: keyof LocaleContent,
        value: string
    ) =>
        setForm((prev) => ({
            ...prev,
            [locale]: { ...prev[locale], [field]: value },
        }));

    const handleSave = async () => {
        setError(null);
        setSaving(true);
        const payload = formToPayload(form);
        if (form.countries.length === 0) {
            setError("Choose at least one country this method delivers to.");
            setSaving(false);
            return;
        }

        try {
            const url = editingId
                ? `/api/shop/shipping/${editingId}`
                : "/api/shop/shipping";
            const method = editingId ? "PATCH" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) {
                setError(apiErrorMessage(json.error, "Couldn't save."));
            } else {
                setSheetOpen(false);
                await fetchMethods();
            }
        } catch {
            setError("Couldn't reach the server. Try again.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await fetch(`/api/shop/shipping/${deleteTarget.id}`, {
                method: "DELETE",
            });
            setDeleteTarget(null);
            await fetchMethods();
        } catch {} finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Shipping
                    </h1>
                    <InfoTip label="About Shipping">
                        Set up shipping methods and delivery areas, with live courier rates and labels.
                    </InfoTip>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setCoverageOpen(true)}>
                        <Globe className="mr-2 h-4 w-4" />
                        Coverage
                    </Button>
                    <Button size="sm" onClick={openCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add method
                    </Button>
                </div>
            </div>

            <CoverageCheck
                open={coverageOpen}
                onOpenChange={setCoverageOpen}
                methods={methods}
                environment={couriers.environment}
                onMethodsChanged={fetchMethods}
            />

            <Link href={couriers.href} className="group block">
                <Card className="transition-colors hover:bg-accent/50 group-active:bg-press">
                    <CardContent className="flex items-center gap-3 py-4 max-md:py-0">
                        <Truck className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                            <p className="font-medium">Couriers</p>
                            <p className="text-sm text-muted-foreground">{couriersSummary(couriers)}</p>
                            {couriers.unreadable && (
                                <p className="text-sm text-destructive">
                                    Courier settings can&apos;t be read, so live rates are off: {couriers.unreadable}
                                </p>
                            )}
                            {couriers.unboxed.length > 0 && (
                                <p className="text-sm text-amber-700 dark:text-amber-400">
                                    No box for {couriers.unboxed.join(", ")}: live rates are off for these. Set one under Boxes › Used for.
                                </p>
                            )}
                        </div>
                        <span className="flex shrink-0 items-center gap-1 text-sm font-medium">
                            Manage <ChevronRight className="h-4 w-4" />
                        </span>
                    </CardContent>
                </Card>
            </Link>

            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : methods.length === 0 ? (
                <EmptyState
                    icon={Truck}
                    action={
                        <Button size="sm" onClick={openCreate}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add method
                        </Button>
                    }
                >
                    No shipping methods yet.
                </EmptyState>
            ) : (
                <div className="space-y-3">
                    {!methods.some(
                        (m) => m.is_active && (m.rate_source ?? "flat") !== "easyship" && !m.collect_location_id,
                    ) && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                            <p>If couriers can&apos;t be reached, checkout shows no shipping option.</p>
                        </div>
                    )}
                    {methods.map((method) => (
                        <Card key={method.id}>
                            <CardContent className="flex flex-row items-start justify-between gap-3 py-4 max-md:py-0">
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">
                                            {getMethodName(method)}
                                        </span>
                                        <Badge
                                            variant={method.is_active ? "default" : "secondary"}
                                        >
                                            {method.is_active ? "Active" : "Inactive"}
                                        </Badge>
                                        {method.rate_source === "easyship" && (
                                            <Badge variant="outline">Live rate</Badge>
                                        )}
                                        {method.collect_location_id && (
                                            <Badge variant="outline">
                                                Self-collect
                                                {(() => {
                                                    const studio = studios.find((st) => st.id === method.collect_location_id);
                                                    return studio ? `, ${studio.name}` : "";
                                                })()}
                                            </Badge>
                                        )}
                                    </div>

                                    {method.rate_source === "easyship" && (
                                        <p className="text-sm text-muted-foreground">
                                            {liveRateSummary(method)}
                                        </p>
                                    )}

                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                        {method.rate_source !== "easyship" && (
                                            <span className="font-medium text-foreground">
                                                {formatCurrency(method.base_rate, method.currency)}
                                            </span>
                                        )}
                                        <span>
                                            {method.free_above !== null
                                                ? `Free above ${formatCurrency(method.free_above, method.currency)}`
                                                : "No free shipping"}
                                        </span>
                                        {methodDeliveryTime(method.content, "en-US") && (
                                            <span>Delivery time: {methodDeliveryTime(method.content, "en-US")}</span>
                                        )}
                                        <span className="text-xs">{method.slug}</span>
                                    </div>

                                    {method.countries && method.countries.length > 0 && (
                                        <CountryBadges countries={method.countries} />
                                    )}
                                </div>

                                <div className="flex shrink-0 gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="max-md:min-w-11"
                                        onClick={() => openEdit(method)}
                                    >
                                        <Pencil className="mr-1.5 h-3.5 w-3.5 max-md:mr-0" />
                                        <span className="max-md:sr-only">Edit</span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        aria-label={`Delete ${getMethodName(method)}`}
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10 max-md:min-w-11"
                                        onClick={() => setDeleteTarget(method)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>
                            {editingId ? "Edit shipping method" : "New shipping method"}
                        </SheetTitle>
                    </SheetHeader>

                    <div className="mt-2 space-y-6 px-4 md:mt-6">
                        {error && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                {error}
                            </div>
                        )}

                        <Tabs defaultValue="en-US">
                            <TabsList className="w-full">
                                {LOCALES.map((loc) => (
                                    <TabsTrigger key={loc.key} value={loc.key} className="flex-1">
                                        {loc.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>

                            {LOCALES.map((loc) => (
                                <TabsContent key={loc.key} value={loc.key} className="space-y-4 pt-4">
                                    <div className="space-y-1.5">
                                        <Label>Name</Label>
                                        <Input
                                            value={form[loc.short]?.name ?? ""}
                                            onChange={(e) =>
                                                setLocale(loc.short, "name", e.target.value)
                                            }
                                            placeholder={
                                                loc.short === "en"
                                                    ? "e.g. Standard Delivery"
                                                    : "e.g. 标准快递"
                                            }
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label>Description</Label>
                                        <Textarea
                                            value={form[loc.short]?.description ?? ""}
                                            onChange={(e) =>
                                                setLocale(loc.short, "description", e.target.value)
                                            }
                                            rows={2}
                                            placeholder={
                                                loc.short === "en"
                                                    ? "e.g. Delivered via Pos Malaysia"
                                                    : ""
                                            }
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor={`estimated_days_${loc.short}`}>Delivery time</Label>
                                        <Input
                                            id={`estimated_days_${loc.short}`}
                                            value={form[loc.short]?.estimated_days ?? ""}
                                            onChange={(e) =>
                                                setLocale(
                                                    loc.short,
                                                    "estimated_days",
                                                    e.target.value
                                                )
                                            }
                                            placeholder={loc.short === "en" ? "e.g. About 2 weeks" : "e.g. 约2周"}
                                            className="text-base md:text-sm"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            {form.rate_source === "easyship" && !form.collect_location_id
                                                ? "Shown to shoppers instead of the courier's estimate. Leave empty to show the courier's."
                                                : "Shown to shoppers under the method's name."}
                                        </p>
                                    </div>
                                </TabsContent>
                            ))}
                        </Tabs>

                        <div className="space-y-1.5">
                            <Label htmlFor="slug">Slug</Label>
                            <Input
                                id="slug"
                                value={form.slug}
                                onChange={(e) => setField("slug", e.target.value)}
                                placeholder="e.g. standard-delivery"
                                className="text-base md:text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                                Lowercase letters, numbers and hyphens only.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Delivery</Label>
                            <Select
                                value={form.collect_location_id || DELIVERED}
                                onValueChange={(v) =>
                                    setForm((prev) =>
                                        v === DELIVERED
                                            ? { ...prev, collect_location_id: "" }
                                            : { ...prev, collect_location_id: v, rate_source: "flat" },
                                    )
                                }
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={DELIVERED}>Delivered to the customer&apos;s address</SelectItem>
                                    {studios.map((st) => (
                                        <SelectItem key={st.id} value={st.id}>
                                            Self-collect at {st.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {form.collect_location_id
                                    ? "Offered on customisations only. The customer gives a name instead of an address, and the order carries the studio's address, so no courier label is bought."
                                    : studios.length === 0
                                      ? "Self-collect needs one of your own studios with an address. Add it on the Partners page."
                                      : "Self-collect is offered on customisations only, never in shop checkout."}
                            </p>
                        </div>

                        {!form.collect_location_id && (
                            <div className="space-y-4 rounded-lg border p-4">
                                <div className="space-y-1.5">
                                    <Label>Pricing</Label>
                                    <Select
                                        value={form.rate_source}
                                        onValueChange={(v) => setField("rate_source", v as ShippingRateSource)}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="flat">Flat rate</SelectItem>
                                            <SelectItem value="easyship">Live courier rate</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        {form.rate_source === "easyship"
                                            ? "Priced per cart and address from live courier rates. Set up the connection in Shipping › Couriers."
                                            : "Everyone in the method's countries pays the same rate."}
                                    </p>
                                </div>

                                {form.rate_source === "easyship" && (
                                    <>
                                        <div className="space-y-1.5">
                                            <Label>Courier</Label>
                                            <Select
                                                value={form.easyship_strategy}
                                                onValueChange={(v) => setField("easyship_strategy", v as EasyshipStrategy)}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {(Object.keys(STRATEGY_LABELS) as EasyshipStrategy[]).map((k) => (
                                                        <SelectItem key={k} value={k}>
                                                            {STRATEGY_LABELS[k]}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {form.easyship_strategy === "courier" && (
                                            <CourierServicePicker
                                                value={form.easyship_courier_service_id}
                                                onChange={(id) => setField("easyship_courier_service_id", id)}
                                                country={form.countries[0] ?? "SG"}
                                            />
                                        )}

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="markup_percent">Markup (%)</Label>
                                                <Input
                                                    id="markup_percent"
                                                    type="number"
                                                    step="1"
                                                    value={form.markup_percent}
                                                    onChange={(e) => setField("markup_percent", e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="markup_fixed">Markup ({CURRENCY_SYMBOL})</Label>
                                                <Input
                                                    id="markup_fixed"
                                                    type="number"
                                                    step="0.5"
                                                    value={form.markup_fixed}
                                                    onChange={(e) => setField("markup_fixed", e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <p className="-mt-2 text-xs text-muted-foreground">
                                            Negative values subsidise shipping; the price never goes below zero.
                                        </p>

                                        <div className="space-y-1.5">
                                            <Label>Rounding</Label>
                                            <Select
                                                value={form.rate_rounding}
                                                onValueChange={(v) => setField("rate_rounding", v)}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {ROUNDING_OPTIONS.map((o) => (
                                                        <SelectItem key={o.value} value={o.value}>
                                                            {o.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            {form.rate_source !== "easyship" && (
                            <div className="space-y-1.5">
                                <Label htmlFor="base_rate">Base rate ({CURRENCY_SYMBOL})</Label>
                                <Input
                                    id="base_rate"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.base_rate}
                                    onChange={(e) => setField("base_rate", e.target.value)}
                                    placeholder="e.g. 8.00"
                                />
                            </div>
                            )}

                            <div className="space-y-1.5">
                                <Label htmlFor="free_above">Free shipping above ({CURRENCY_SYMBOL})</Label>
                                <Input
                                    id="free_above"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.free_above}
                                    onChange={(e) => setField("free_above", e.target.value)}
                                    placeholder="e.g. 150.00"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Leave empty for no free shipping.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Countries</Label>
                            <CountryPicker key={editingId ?? "new"} value={form.countries} onChange={(next) => setField("countries", next)} />
                            {form.rate_source === "flat" &&
                                new Set(form.countries.map((c) => findCountry(c)?.region)).size > 1 && (
                                    <p className="text-xs text-amber-700 dark:text-amber-400">
                                        A flat rate charges every one of these countries the same, and couriers charge
                                        far countries several times more. Use a live courier rate for these.
                                    </p>
                                )}
                            <p className="text-xs text-muted-foreground">
                                Checkout offers every country an active method lists. Use Coverage to see where your
                                couriers deliver.
                            </p>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                            <div className="space-y-0.5">
                                <Label htmlFor="is_active" className="font-medium">
                                    Active
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Show this method to customers at checkout.
                                </p>
                            </div>
                            <Switch
                                id="is_active"
                                checked={form.is_active}
                                onCheckedChange={(v) => setField("is_active", v)}
                            />
                        </div>

                        <div className="max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-4 max-md:border-t max-md:bg-background/95 max-md:pt-3 max-md:pr-[4.25rem] max-md:pb-[calc(0.75rem+var(--safe-bottom))] max-md:pl-4 max-md:backdrop-blur">
                            <Button
                                className="w-full"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                {saving ? "Saving…" : "Save shipping method"}
                            </Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            <Dialog
                open={!!deleteTarget}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete shipping method?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Delete{" "}
                        <strong>{deleteTarget ? getMethodName(deleteTarget) : ""}</strong>?
                        This can&apos;t be undone.
                    </p>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteTarget(null)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={deleting}
                        >
                            {deleting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
