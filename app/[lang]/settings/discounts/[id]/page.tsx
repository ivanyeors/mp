"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import {
    RefreshCw,
    Save,
    Tag,
    Percent,
    DollarSign,
    Copy,
    Loader2,
} from "lucide-react";
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

// ─── Types ────────────────────────────────────────────────────────────────────

type DiscountType = "percentage" | "fixed_amount" | "free_shipping";

type CouponForm = {
    code: string;
    discount_type: DiscountType;
    discount_value: string;
    currency: string;
    min_order_amount: string;
    max_discount: string;
    usage_limit: string;
    per_customer_limit: string;
    starts_at: string;
    expires_at: string;
    is_active: boolean;
};

type Coupon = {
    id: string;
    code: string;
    discount_type: DiscountType;
    discount_value: number;
    currency: string;
    min_order_amount: number | null;
    max_discount: number | null;
    usage_limit: number | null;
    usage_count: number;
    per_customer_limit: number;
    starts_at: string | null;
    expires_at: string | null;
    is_active: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 8 }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
}

function toLocalDatetimeInput(iso: string | null): string {
    if (!iso) return "";
    // Convert ISO to local datetime-local input format
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toISOWithOffset(local: string): string | null {
    if (!local) return null;
    return new Date(local).toISOString();
}

function buildSummary(form: CouponForm): string {
    const value = parseFloat(form.discount_value) || 0;
    const minOrder = parseFloat(form.min_order_amount) || 0;
    const maxDiscount = parseFloat(form.max_discount) || 0;

    const parts: string[] = [];

    if (form.discount_type === "percentage") {
        parts.push(`${value}% off`);
    } else if (form.discount_type === "fixed_amount") {
        parts.push(`RM ${value.toFixed(2)} off`);
    } else {
        parts.push("Free shipping");
    }

    if (minOrder > 0) {
        parts[0] += ` orders over RM ${minOrder.toFixed(2)}`;
    }

    if (form.discount_type === "percentage" && maxDiscount > 0) {
        parts.push(`max RM ${maxDiscount.toFixed(2)} discount`);
    }

    const usageLimit = parseInt(form.usage_limit) || 0;
    if (usageLimit > 0) {
        parts.push(`up to ${usageLimit} use${usageLimit !== 1 ? "s" : ""}`);
    }

    const perCustomer = parseInt(form.per_customer_limit) || 1;
    if (perCustomer > 1) {
        parts.push(`${perCustomer} uses per customer`);
    }

    return parts.join(", ") || "Configure the discount above";
}

const DEFAULT_FORM: CouponForm = {
    code: "",
    discount_type: "percentage",
    discount_value: "",
    currency: "MYR",
    min_order_amount: "",
    max_discount: "",
    usage_limit: "",
    per_customer_limit: "1",
    starts_at: "",
    expires_at: "",
    is_active: true,
};

function couponToForm(c: Coupon): CouponForm {
    return {
        code: c.code,
        discount_type: c.discount_type,
        discount_value: String(c.discount_value),
        currency: c.currency,
        min_order_amount: c.min_order_amount !== null ? String(c.min_order_amount) : "",
        max_discount: c.max_discount !== null ? String(c.max_discount) : "",
        usage_limit: c.usage_limit !== null ? String(c.usage_limit) : "",
        per_customer_limit: String(c.per_customer_limit),
        starts_at: toLocalDatetimeInput(c.starts_at),
        expires_at: toLocalDatetimeInput(c.expires_at),
        is_active: c.is_active,
    };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DiscountEditorPage() {
    const params = useParams();
    const rawId = Array.isArray(params.id) ? params.id[0] : (params.id as string);
    const isNew = rawId === "new";

    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const router = useRouter();

    const [form, setForm] = useState<CouponForm>(DEFAULT_FORM);
    const [original, setOriginal] = useState<Coupon | null>(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Load existing coupon
    const fetchCoupon = useCallback(async () => {
        if (isNew) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/shop/coupons/${rawId}`);
            if (!res.ok) throw new Error("Not found");
            const json = await res.json();
            setOriginal(json.row);
            setForm(couponToForm(json.row));
        } catch {
            setError("Failed to load coupon.");
        } finally {
            setLoading(false);
        }
    }, [isNew, rawId]);

    useEffect(() => {
        fetchCoupon();
    }, [fetchCoupon]);

    // ── Field helpers ──
    const set = (field: keyof CouponForm, value: string | boolean) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const handleGenerate = () => set("code", generateCode());

    const handleCopyCode = async () => {
        if (!form.code) return;
        await navigator.clipboard.writeText(form.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    // ── Save ──
    const handleSave = async () => {
        setError(null);
        setSaving(true);

        const payload: Record<string, unknown> = {
            code: form.code.toUpperCase(),
            discount_type: form.discount_type,
            discount_value: parseFloat(form.discount_value) || 0,
            currency: form.currency,
            min_order_amount: form.min_order_amount !== "" ? parseFloat(form.min_order_amount) : null,
            max_discount: form.max_discount !== "" ? parseFloat(form.max_discount) : null,
            usage_limit: form.usage_limit !== "" ? parseInt(form.usage_limit) : null,
            per_customer_limit: parseInt(form.per_customer_limit) || 1,
            starts_at: toISOWithOffset(form.starts_at),
            expires_at: toISOWithOffset(form.expires_at),
            is_active: form.is_active,
        };

        try {
            const url = isNew ? "/api/shop/coupons" : `/api/shop/coupons/${rawId}`;
            const method = isNew ? "POST" : "PATCH";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) {
                setError(
                    typeof json.error === "string"
                        ? json.error
                        : "Failed to save. Check your inputs."
                );
            } else {
                if (isNew) {
                    router.replace(to(`/settings/discounts/${json.row.id}`));
                } else {
                    setOriginal(json.row);
                    setForm(couponToForm(json.row));
                }
            }
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const valueLabel =
        form.discount_type === "percentage"
            ? "Percentage (%)"
            : form.discount_type === "fixed_amount"
            ? "Amount (RM)"
            : "Value";

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        {isNew ? "New Discount" : form.code || "Edit Discount"}
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {isNew
                            ? "Create a new discount code for your store."
                            : "Edit discount code settings."}
                    </p>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* ── Left column ── */}
                <div className="space-y-6 lg:col-span-2">

                    {/* Code section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Tag className="h-4 w-4" />
                                Discount code
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Code input + generate + copy */}
                            <div className="space-y-1.5">
                                <Label htmlFor="code">Code</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="code"
                                        value={form.code}
                                        onChange={(e) =>
                                            set("code", e.target.value.toUpperCase())
                                        }
                                        className="font-mono uppercase tracking-widest"
                                        placeholder="e.g. SAVE20"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={handleGenerate}
                                        title="Generate random code"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={handleCopyCode}
                                        title="Copy code"
                                        disabled={!form.code}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                    {copied && (
                                        <span className="self-center text-xs text-muted-foreground">
                                            Copied!
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Discount type */}
                            <div className="space-y-1.5">
                                <Label htmlFor="discount_type">Discount type</Label>
                                <Select
                                    value={form.discount_type}
                                    onValueChange={(v) =>
                                        set("discount_type", v as DiscountType)
                                    }
                                >
                                    <SelectTrigger id="discount_type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="percentage">
                                            <span className="flex items-center gap-2">
                                                <Percent className="h-3.5 w-3.5" />
                                                Percentage
                                            </span>
                                        </SelectItem>
                                        <SelectItem value="fixed_amount">
                                            <span className="flex items-center gap-2">
                                                <DollarSign className="h-3.5 w-3.5" />
                                                Fixed amount
                                            </span>
                                        </SelectItem>
                                        <SelectItem value="free_shipping">
                                            Free shipping
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Discount value */}
                            {form.discount_type !== "free_shipping" && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="discount_value">{valueLabel}</Label>
                                    <Input
                                        id="discount_value"
                                        type="number"
                                        min="0"
                                        step={form.discount_type === "percentage" ? "1" : "0.01"}
                                        value={form.discount_value}
                                        onChange={(e) => set("discount_value", e.target.value)}
                                        placeholder={
                                            form.discount_type === "percentage" ? "e.g. 20" : "e.g. 10.00"
                                        }
                                    />
                                </div>
                            )}

                            {/* Currency (fixed_amount only) */}
                            {form.discount_type === "fixed_amount" && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="currency">Currency</Label>
                                    <Select
                                        value={form.currency}
                                        onValueChange={(v) => set("currency", v)}
                                    >
                                        <SelectTrigger id="currency">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="MYR">MYR – Malaysian Ringgit</SelectItem>
                                            <SelectItem value="SGD">SGD – Singapore Dollar</SelectItem>
                                            <SelectItem value="USD">USD – US Dollar</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Conditions section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Conditions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="min_order_amount">
                                    Minimum order amount (optional)
                                </Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                        RM
                                    </span>
                                    <Input
                                        id="min_order_amount"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.min_order_amount}
                                        onChange={(e) =>
                                            set("min_order_amount", e.target.value)
                                        }
                                        className="pl-9"
                                        placeholder="e.g. 100.00"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Leave empty for no minimum order requirement.
                                </p>
                            </div>

                            {form.discount_type === "percentage" && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="max_discount">
                                        Maximum discount amount (optional)
                                    </Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                            RM
                                        </span>
                                        <Input
                                            id="max_discount"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={form.max_discount}
                                            onChange={(e) =>
                                                set("max_discount", e.target.value)
                                            }
                                            className="pl-9"
                                            placeholder="e.g. 50.00"
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Cap the maximum discount this code can give.
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Usage limits section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Usage limits</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="usage_limit">Total usage limit (optional)</Label>
                                <Input
                                    id="usage_limit"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={form.usage_limit}
                                    onChange={(e) => set("usage_limit", e.target.value)}
                                    placeholder="e.g. 100"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Leave empty or set 0 for unlimited total uses.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="per_customer_limit">Per customer limit</Label>
                                <Input
                                    id="per_customer_limit"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={form.per_customer_limit}
                                    onChange={(e) =>
                                        set("per_customer_limit", e.target.value)
                                    }
                                    placeholder="1"
                                />
                                <p className="text-xs text-muted-foreground">
                                    How many times a single customer can use this code.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Schedule section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Schedule</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="starts_at">Start date</Label>
                                    <Input
                                        id="starts_at"
                                        type="datetime-local"
                                        value={form.starts_at}
                                        onChange={(e) => set("starts_at", e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="expires_at">End date</Label>
                                    <Input
                                        id="expires_at"
                                        type="datetime-local"
                                        value={form.expires_at}
                                        onChange={(e) => set("expires_at", e.target.value)}
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Leave empty for no date restriction.
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* ── Right column ── */}
                <div className="space-y-4 lg:col-span-1">

                    {/* Status card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Status</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label htmlFor="is_active" className="font-medium">
                                        Active
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        Customers can use this code when active.
                                    </p>
                                </div>
                                <Switch
                                    id="is_active"
                                    checked={form.is_active}
                                    onCheckedChange={(v) => set("is_active", v)}
                                />
                            </div>

                            {!isNew && original && (
                                <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Used</span>
                                        <span className="font-medium">
                                            {original.usage_count}
                                            {original.usage_limit !== null
                                                ? ` / ${original.usage_limit}`
                                                : " / Unlimited"}
                                        </span>
                                    </div>
                                </div>
                            )}

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
                                {saving ? "Saving…" : "Save discount"}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Summary card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Summary</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {form.code && (
                                <div className="mb-3 flex items-center gap-2">
                                    <Badge
                                        variant="outline"
                                        className="font-mono text-sm tracking-widest"
                                    >
                                        {form.code}
                                    </Badge>
                                </div>
                            )}
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {buildSummary(form)}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
