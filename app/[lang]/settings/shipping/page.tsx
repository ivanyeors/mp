"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Truck, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
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
import { formatCurrency, CURRENCY_CONFIG, BASE_CURRENCY } from "@/lib/i18n/currencies";

const CURRENCY_SYMBOL = CURRENCY_CONFIG[BASE_CURRENCY].symbol;

// ─── Types ────────────────────────────────────────────────────────────────────

type LocaleContent = {
    name?: string;
    description?: string;
    estimated_days?: string;
};

type ShippingMethod = {
    id: string;
    slug: string;
    content: Record<string, LocaleContent>;
    base_rate: number;
    free_above: number | null;
    currency: string;
    countries: string[];
    is_active: boolean;
    position: number;
};

type ShippingForm = {
    slug: string;
    base_rate: string;
    free_above: string;
    countries: string;
    is_active: boolean;
    en: LocaleContent;
    zh: LocaleContent;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCALES = [
    { key: "en-US", label: "English", short: "en" },
    { key: "zh-CN", label: "中文", short: "zh" },
] as const;

const COMMON_COUNTRIES = [
    "MY", "SG", "ID", "TH", "PH", "BN", "VN", "MM", "KH", "LA",
    "HK", "TW", "CN", "JP", "KR", "AU", "NZ", "IN",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
        countries: (m.countries ?? []).join(", "),
        is_active: m.is_active,
        en: { name: en.name ?? "", description: en.description ?? "", estimated_days: en.estimated_days ?? "" },
        zh: { name: zh.name ?? "", description: zh.description ?? "", estimated_days: zh.estimated_days ?? "" },
    };
}

const DEFAULT_FORM: ShippingForm = {
    slug: "",
    base_rate: "",
    free_above: "",
    countries: "MY",
    is_active: true,
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
    const countries = form.countries
        .split(/[\s,]+/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);

    return {
        slug: form.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        content,
        base_rate: parseFloat(form.base_rate) || 0,
        free_above: form.free_above !== "" ? parseFloat(form.free_above) : null,
        countries: countries.length > 0 ? countries : ["MY"],
        is_active: form.is_active,
    };
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function CountryBadges({ countries }: { countries: string[] }) {
    const shown = countries.slice(0, 6);
    const rest = countries.length - shown.length;
    return (
        <div className="flex flex-wrap gap-1">
            {shown.map((c) => (
                <Badge key={c} variant="outline" className="text-xs px-1.5 py-0">
                    {c}
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsShippingPage() {
    const [methods, setMethods] = useState<ShippingMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sheet state
    const [sheetOpen, setSheetOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<ShippingForm>(DEFAULT_FORM);

    // Delete dialog state
    const [deleteTarget, setDeleteTarget] = useState<ShippingMethod | null>(null);
    const [deleting, setDeleting] = useState(false);

    // ── Fetch ──
    const fetchMethods = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/shop/shipping");
            const json = await res.json();
            setMethods(json.rows ?? []);
        } catch {
            setMethods([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMethods();
    }, [fetchMethods]);

    // ── Open sheet ──
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

    // ── Form field helpers ──
    const setField = (field: keyof Omit<ShippingForm, "en" | "zh">, value: string | boolean) =>
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

    // ── Save ──
    const handleSave = async () => {
        setError(null);
        setSaving(true);
        const payload = formToPayload(form);

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
                setError(
                    typeof json.error === "string" ? json.error : "Failed to save."
                );
            } else {
                setSheetOpen(false);
                await fetchMethods();
            }
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ──
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await fetch(`/api/shop/shipping/${deleteTarget.id}`, {
                method: "DELETE",
            });
            setDeleteTarget(null);
            await fetchMethods();
        } catch {
            // ignore
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Shipping Methods
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Configure shipping options, rates, and delivery areas.
                    </p>
                </div>
                <Button size="sm" onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Method
                </Button>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : methods.length === 0 ? (
                <div className="rounded-xl border border-dashed p-14 text-center">
                    <Truck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">
                        No shipping methods yet. Add your first shipping option.
                    </p>
                    <Button size="sm" className="mt-4" onClick={openCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Method
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {methods.map((method) => (
                        <Card key={method.id}>
                            <CardContent className="flex items-start justify-between gap-4 py-4">
                                {/* Info */}
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
                                    </div>

                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                        <span className="font-medium text-foreground">
                                            {formatCurrency(method.base_rate, method.currency)}
                                        </span>
                                        <span>
                                            {method.free_above !== null
                                                ? `Free above ${formatCurrency(method.free_above, method.currency)}`
                                                : "No free shipping"}
                                        </span>
                                        <span className="font-mono text-xs">{method.slug}</span>
                                    </div>

                                    {method.countries && method.countries.length > 0 && (
                                        <CountryBadges countries={method.countries} />
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex shrink-0 gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openEdit(method)}
                                    >
                                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                        Edit
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
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

            {/* ── Edit / Create Sheet ── */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>
                            {editingId ? "Edit Shipping Method" : "New Shipping Method"}
                        </SheetTitle>
                    </SheetHeader>

                    <div className="mt-6 space-y-6">
                        {error && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                {error}
                            </div>
                        )}

                        {/* Locale tabs */}
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
                                        <Label>Estimated days</Label>
                                        <Input
                                            value={form[loc.short]?.estimated_days ?? ""}
                                            onChange={(e) =>
                                                setLocale(
                                                    loc.short,
                                                    "estimated_days",
                                                    e.target.value
                                                )
                                            }
                                            placeholder="e.g. 3-5 days"
                                        />
                                    </div>
                                </TabsContent>
                            ))}
                        </Tabs>

                        {/* Slug */}
                        <div className="space-y-1.5">
                            <Label htmlFor="slug">Slug</Label>
                            <Input
                                id="slug"
                                value={form.slug}
                                onChange={(e) => setField("slug", e.target.value)}
                                placeholder="e.g. standard-delivery"
                                className="font-mono text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                                Lowercase letters, numbers and hyphens only.
                            </p>
                        </div>

                        {/* Rates */}
                        <div className="grid grid-cols-2 gap-4">
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

                        {/* Countries */}
                        <div className="space-y-2">
                            <Label htmlFor="countries">Countries</Label>
                            <Input
                                id="countries"
                                value={form.countries}
                                onChange={(e) => setField("countries", e.target.value)}
                                placeholder="MY, SG, ID, ..."
                                className="font-mono text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                                Comma-separated ISO country codes (e.g. MY, SG, ID).
                            </p>
                            {/* Quick-add common countries */}
                            <div className="flex flex-wrap gap-1">
                                {COMMON_COUNTRIES.map((c) => {
                                    const currentList = form.countries
                                        .split(/[\s,]+/)
                                        .map((x) => x.trim().toUpperCase())
                                        .filter(Boolean);
                                    const isIncluded = currentList.includes(c);
                                    return (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => {
                                                const list = form.countries
                                                    .split(/[\s,]+/)
                                                    .map((x) => x.trim().toUpperCase())
                                                    .filter(Boolean);
                                                if (isIncluded) {
                                                    setField(
                                                        "countries",
                                                        list.filter((x) => x !== c).join(", ")
                                                    );
                                                } else {
                                                    setField(
                                                        "countries",
                                                        [...list, c].join(", ")
                                                    );
                                                }
                                            }}
                                            className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                                                isIncluded
                                                    ? "border-primary bg-primary text-primary-foreground"
                                                    : "border-border bg-background hover:bg-muted"
                                            }`}
                                        >
                                            {c}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Active toggle */}
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

                        {/* Save button */}
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
                </SheetContent>
            </Sheet>

            {/* ── Delete confirmation dialog ── */}
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
                        Are you sure you want to delete{" "}
                        <strong>{deleteTarget ? getMethodName(deleteTarget) : ""}</strong>?
                        This cannot be undone.
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
