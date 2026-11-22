"use client";

import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { InfoTip } from "@/components/ui/info-tip";
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
import { useSettingsBreadcrumbDetail } from "@/components/settings/settings-breadcrumb-context";
import {
    MobileStickyActionBar,
    mobileStickyActionBarSpacerClassName,
} from "@/components/ui/mobile-sticky-action-bar";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { formatCurrency, CURRENCY_CONFIG, BASE_CURRENCY } from "@/lib/i18n/currencies";

const CURRENCY_SYMBOL = CURRENCY_CONFIG[BASE_CURRENCY].symbol;

type DiscountType = "percentage" | "fixed_amount" | "free_shipping";

type AppliesTo = { product_ids?: string[]; category_ids?: string[] } | null;

export type CatalogProduct = {
    id: string;
    slug: string;
    content: Record<string, { title: string }>;
};

export type CatalogCategory = {
    id: string;
    slug: string;
    content: Record<string, { name: string }>;
    children?: CatalogCategory[];
};

type AppliesToSelection = {
    product_ids: string[];
    category_ids: string[];
};

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

export type Coupon = {
    id: string;
    code: string;
    discount_type: DiscountType;
    discount_value: number;
    currency: string;
    min_order_amount: number | null;
    max_discount: number | null;
    usage_limit: number | null;
    usage_count: number;
    per_customer_limit: number | null;
    starts_at: string | null;
    expires_at: string | null;
    applies_to: AppliesTo;
    is_active: boolean;
};

export type CouponDetailResponse = {
    ok: true;
    row: Coupon;
};

export type CatalogProductsResponse = {
    ok: true;
    rows: CatalogProduct[];
    total: number;
    page: number;
    limit: number;
};

export type CatalogCategoriesResponse = {
    ok: true;
    rows: CatalogCategory[];
};

export type DiscountEditorInitialData = {
    coupon: CouponDetailResponse | null;
    products: CatalogProductsResponse;
    categories: CatalogCategoriesResponse;
};

function generateCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 8 }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
}

function toLocalDatetimeInput(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toISOWithOffset(local: string): string | null {
    if (!local) return null;
    return new Date(local).toISOString();
}

const scopeListClassName =
    "max-h-48 overflow-y-auto rounded-md border p-3 max-md:max-h-72 max-md:rounded-none max-md:border-x-0 max-md:px-0 max-md:py-0";
const scopeRowClassName =
    "flex cursor-pointer items-start gap-2 text-sm max-md:min-h-11 max-md:items-center max-md:gap-3 max-md:py-2 max-md:transition-colors max-md:active:bg-press";

function buildSummary(form: CouponForm): string {
    const value = parseFloat(form.discount_value) || 0;
    const minOrder = parseFloat(form.min_order_amount) || 0;
    const maxDiscount = parseFloat(form.max_discount) || 0;

    const parts: string[] = [];

    if (form.discount_type === "percentage") {
        parts.push(`${value}% off`);
    } else if (form.discount_type === "fixed_amount") {
        parts.push(`${formatCurrency(value, form.currency)} off`);
    } else {
        parts.push("Free shipping");
    }

    if (minOrder > 0) {
        parts[0] += ` orders over ${formatCurrency(minOrder, form.currency)}`;
    }

    if (form.discount_type === "percentage" && maxDiscount > 0) {
        parts.push(`max ${formatCurrency(maxDiscount, form.currency)} discount`);
    }

    const usageLimit = parseInt(form.usage_limit) || 0;
    if (usageLimit > 0) {
        parts.push(`up to ${usageLimit} use${usageLimit !== 1 ? "s" : ""}`);
    }

    const perCustomer = parseInt(form.per_customer_limit) || 0;
    if (perCustomer > 0) {
        parts.push(`${perCustomer} use${perCustomer !== 1 ? "s" : ""} per customer (sign-in required)`);
    }

    return parts.join(", ") || "Set up the discount to see its summary.";
}

const DEFAULT_FORM: CouponForm = {
    code: "",
    discount_type: "percentage",
    discount_value: "",
    currency: "SGD",
    min_order_amount: "",
    max_discount: "",
    usage_limit: "",
    per_customer_limit: "",
    starts_at: "",
    expires_at: "",
    is_active: true,
};

function getProductTitle(row: CatalogProduct): string {
    const loc =
        row.content?.["en-US"] ??
        row.content?.["en"] ??
        Object.values(row.content ?? {})[0];
    return loc?.title ?? row.slug;
}

function getCategoryName(cat: CatalogCategory): string {
    const loc =
        cat.content?.["en-US"] ??
        cat.content?.["en"] ??
        Object.values(cat.content ?? {})[0];
    return loc?.name ?? cat.slug;
}

function flattenCategories(
    nodes: CatalogCategory[],
    depth = 0
): { cat: CatalogCategory; depth: number }[] {
    const result: { cat: CatalogCategory; depth: number }[] = [];
    for (const node of nodes) {
        result.push({ cat: node, depth });
        result.push(...flattenCategories(node.children ?? [], depth + 1));
    }
    return result;
}

function appliesToFromCoupon(c: Coupon): AppliesToSelection {
    return {
        product_ids: c.applies_to?.product_ids ?? [],
        category_ids: c.applies_to?.category_ids ?? [],
    };
}

function buildAppliesToPayload(selection: AppliesToSelection): AppliesTo {
    const product_ids = selection.product_ids;
    const category_ids = selection.category_ids;
    if (product_ids.length === 0 && category_ids.length === 0) return null;
    return {
        ...(product_ids.length > 0 ? { product_ids } : {}),
        ...(category_ids.length > 0 ? { category_ids } : {}),
    };
}

function couponToForm(c: Coupon): CouponForm {
    return {
        code: c.code,
        discount_type: c.discount_type,
        discount_value: String(c.discount_value),
        currency: c.currency,
        min_order_amount: c.min_order_amount !== null ? String(c.min_order_amount) : "",
        max_discount: c.max_discount !== null ? String(c.max_discount) : "",
        usage_limit: c.usage_limit !== null ? String(c.usage_limit) : "",
        per_customer_limit: c.per_customer_limit !== null ? String(c.per_customer_limit) : "",
        starts_at: toLocalDatetimeInput(c.starts_at),
        expires_at: toLocalDatetimeInput(c.expires_at),
        is_active: c.is_active,
    };
}

export function DiscountEditorClient({
    initialData,
}: {
    initialData?: DiscountEditorInitialData;
}) {
    const params = useParams();
    const rawId = Array.isArray(params.id) ? params.id[0] : (params.id as string);
    const isNew = rawId === "new";

    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const router = useRouter();

    const initialCoupon = initialData?.coupon?.row ?? null;

    const [form, setForm] = useState<CouponForm>(() =>
        initialCoupon
            ? { ...couponToForm(initialCoupon), starts_at: "", expires_at: "" }
            : DEFAULT_FORM,
    );
    const [appliesTo, setAppliesTo] = useState<AppliesToSelection>(() =>
        initialCoupon
            ? appliesToFromCoupon(initialCoupon)
            : {
                  product_ids: [],
                  category_ids: [],
              },
    );
    const [original, setOriginal] = useState<Coupon | null>(initialCoupon);
    const [loading, setLoading] = useState(!isNew && !initialData);

    useEffect(() => {
        if (!initialCoupon) return;
        setForm((prev) => ({
            ...prev,
            starts_at: toLocalDatetimeInput(initialCoupon.starts_at),
            expires_at: toLocalDatetimeInput(initialCoupon.expires_at),
        }));
    }, [initialCoupon]);

    useSettingsBreadcrumbDetail(isNew ? "New discount" : (form.code.trim() || null));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [products, setProducts] = useState<CatalogProduct[]>(
        initialData?.products.rows ?? [],
    );
    const [categories, setCategories] = useState<CatalogCategory[]>(
        initialData?.categories.rows ?? [],
    );
    const [catalogLoading, setCatalogLoading] = useState(!initialData);
    const [productSearch, setProductSearch] = useState("");
    const [categorySearch, setCategorySearch] = useState("");

    useEffect(() => {
        if (initialData || isNew) return;
        fetch(`/api/shop/coupons/${rawId}`)
            .then((res) => {
                if (!res.ok) throw new Error("Not found");
                return res.json();
            })
            .then((json) => {
                setOriginal(json.row);
                setForm(couponToForm(json.row));
                setAppliesTo(appliesToFromCoupon(json.row));
            })
            .catch(() => setError("Couldn't load the discount."))
            .finally(() => setLoading(false));
    }, [initialData, isNew, rawId]);

    useEffect(() => {
        if (initialData) return;
        let cancelled = false;
        setCatalogLoading(true);
        Promise.all([
            fetch("/api/shop/products?limit=100").then((r) => r.json()),
            fetch("/api/shop/categories").then((r) => r.json()),
        ])
            .then(([productsJson, categoriesJson]) => {
                if (cancelled) return;
                setProducts(productsJson.rows ?? []);
                setCategories(categoriesJson.rows ?? []);
            })
            .catch(() => {
                if (!cancelled) {
                    setProducts([]);
                    setCategories([]);
                }
            })
            .finally(() => {
                if (!cancelled) setCatalogLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [initialData]);

    const set = (field: keyof CouponForm, value: string | boolean) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const handleGenerate = () => set("code", generateCode());

    const handleCopyCode = async () => {
        if (!form.code) return;
        await navigator.clipboard.writeText(form.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const toggleAppliesToId = (field: keyof AppliesToSelection, id: string) => {
        setAppliesTo((prev) => {
            const selected = prev[field];
            const next = selected.includes(id)
                ? selected.filter((value) => value !== id)
                : [...selected, id];
            return { ...prev, [field]: next };
        });
    };

    const productQuery = productSearch.trim().toLowerCase();
    const filteredProducts = products.filter((product) => {
        if (!productQuery) return true;
        return (
            getProductTitle(product).toLowerCase().includes(productQuery) ||
            product.slug.toLowerCase().includes(productQuery)
        );
    });

    const categoryQuery = categorySearch.trim().toLowerCase();
    const flatCategories = flattenCategories(categories);
    const filteredCategories = flatCategories.filter(({ cat }) => {
        if (!categoryQuery) return true;
        return (
            getCategoryName(cat).toLowerCase().includes(categoryQuery) ||
            cat.slug.toLowerCase().includes(categoryQuery)
        );
    });

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
            per_customer_limit: parseInt(form.per_customer_limit) > 0 ? parseInt(form.per_customer_limit) : null,
            starts_at: toISOWithOffset(form.starts_at),
            expires_at: toISOWithOffset(form.expires_at),
            applies_to: buildAppliesToPayload(appliesTo),
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
                        : "Couldn't save. Check the details above."
                );
            } else {
                if (isNew) {
                    router.replace(to(`/settings/discounts/${json.row.id}`));
                } else {
                    setOriginal(json.row);
                    setForm(couponToForm(json.row));
                    setAppliesTo(appliesToFromCoupon(json.row));
                }
            }
        } catch {
            setError("Couldn't reach the server. Try again.");
        } finally {
            setSaving(false);
        }
    };

    const valueLabel =
        form.discount_type === "percentage"
            ? "Percentage (%)"
            : form.discount_type === "fixed_amount"
            ? `Amount (${CURRENCY_SYMBOL})`
            : "Value";

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className={`space-y-6 ${mobileStickyActionBarSpacerClassName}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        {isNew ? "New discount" : form.code || "Edit discount"}
                    </h1>
                    <InfoTip label="About this discount">
                        {isNew
                            ? "Create a code customers enter at checkout."
                            : "Change this discount code."}
                    </InfoTip>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Tag className="h-4 w-4" />
                                Discount code
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="code">Code</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="code"
                                        value={form.code}
                                        onChange={(e) =>
                                            set("code", e.target.value.toUpperCase())
                                        }
                                        className="uppercase tracking-widest"
                                        placeholder="e.g. SAVE20"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="min-h-11 min-w-11 shrink-0"
                                        onClick={handleGenerate}
                                        title="Generate random code"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="min-h-11 min-w-11 shrink-0"
                                        onClick={handleCopyCode}
                                        title="Copy code"
                                        disabled={!form.code}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                    {copied && (
                                        <span className="self-center text-xs text-muted-foreground">
                                            Copied
                                        </span>
                                    )}
                                </div>
                            </div>

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

                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Conditions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                    <Label htmlFor="min_order_amount">
                                        Minimum order amount (optional)
                                    </Label>
                                    <InfoTip label="About minimum order amount">Leave empty for no minimum.</InfoTip>
                                </div>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                        {CURRENCY_SYMBOL}
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
                            </div>

                            {form.discount_type === "percentage" && (
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <Label htmlFor="max_discount">
                                            Maximum discount amount (optional)
                                        </Label>
                                        <InfoTip label="About maximum discount">The most this code can take off an order.</InfoTip>
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                            {CURRENCY_SYMBOL}
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
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-1.5">
                                <CardTitle className="text-base">Applies to</CardTitle>
                                <InfoTip label="About where this applies">
                                    Leave everything unticked to discount the whole cart. Tick products or categories to limit it to those.
                                </InfoTip>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="product_scope_search">Products</Label>
                                <Input
                                    id="product_scope_search"
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    placeholder="Search products…"
                                />
                                <div className={scopeListClassName}>
                                    {catalogLoading ? (
                                        <div className="flex items-center justify-center py-6">
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : filteredProducts.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                            No products found.
                                        </p>
                                    ) : (
                                        <div className="space-y-2 max-md:space-y-0 max-md:divide-y">
                                            {filteredProducts.map((product) => {
                                                const checked = appliesTo.product_ids.includes(product.id);
                                                return (
                                                    <label
                                                        key={product.id}
                                                        className={scopeRowClassName}
                                                    >
                                                        <Checkbox
                                                            checked={checked}
                                                            onCheckedChange={() =>
                                                                toggleAppliesToId("product_ids", product.id)
                                                            }
                                                            className="mt-0.5 max-md:mt-0"
                                                        />
                                                        <span>
                                                            {getProductTitle(product)}
                                                            <span className="ml-1 text-xs text-muted-foreground">
                                                                ({product.slug})
                                                            </span>
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="category_scope_search">Categories</Label>
                                <Input
                                    id="category_scope_search"
                                    value={categorySearch}
                                    onChange={(e) => setCategorySearch(e.target.value)}
                                    placeholder="Search categories…"
                                />
                                <div className={scopeListClassName}>
                                    {catalogLoading ? (
                                        <div className="flex items-center justify-center py-6">
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : filteredCategories.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                            No categories found.
                                        </p>
                                    ) : (
                                        <div className="space-y-2 max-md:space-y-0 max-md:divide-y">
                                            {filteredCategories.map(({ cat, depth }) => {
                                                const checked = appliesTo.category_ids.includes(cat.id);
                                                return (
                                                    <label
                                                        key={cat.id}
                                                        className={scopeRowClassName}
                                                        style={{ paddingLeft: depth * 12 }}
                                                    >
                                                        <Checkbox
                                                            checked={checked}
                                                            onCheckedChange={() =>
                                                                toggleAppliesToId("category_ids", cat.id)
                                                            }
                                                            className="mt-0.5 max-md:mt-0"
                                                        />
                                                        <span>
                                                            {getCategoryName(cat)}
                                                            <span className="ml-1 text-xs text-muted-foreground">
                                                                ({cat.slug})
                                                            </span>
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Usage limits</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                    <Label htmlFor="usage_limit">Total usage limit (optional)</Label>
                                    <InfoTip label="About total usage limit">Leave empty or enter 0 for no limit.</InfoTip>
                                </div>
                                <Input
                                    id="usage_limit"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={form.usage_limit}
                                    onChange={(e) => set("usage_limit", e.target.value)}
                                    placeholder="e.g. 100"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                    <Label htmlFor="per_customer_limit">Per-customer limit</Label>
                                    <InfoTip label="About per-customer limit">How many times one customer can use this code. Leave it blank for no limit, and guests can use it too. With a limit, customers must sign in and check out with their account email, so a new email address can&apos;t reuse the code.</InfoTip>
                                </div>
                                <Input
                                    id="per_customer_limit"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={form.per_customer_limit}
                                    onChange={(e) =>
                                        set("per_customer_limit", e.target.value)
                                    }
                                    placeholder="No limit"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-1.5">
                                <CardTitle className="text-base">Schedule</CardTitle>
                                <InfoTip label="About the schedule">
                                    Leave both empty for no start or end date.
                                </InfoTip>
                            </div>
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
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-4 lg:col-span-1">

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Status</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5">
                                        <Label htmlFor="is_active" className="cursor-pointer font-medium max-md:-my-[15px] max-md:py-[15px] max-md:active:opacity-60">
                                            Active
                                        </Label>
                                        <InfoTip label="About the active switch">Customers can use this code while it&apos;s on.</InfoTip>
                                    </div>
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
                                                ? ` of ${original.usage_limit}`
                                                : " (no limit)"}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <Button
                                className="w-full max-md:hidden"
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

                    <Card className="max-md:hidden">
                        <CardHeader>
                            <CardTitle className="text-base">Summary</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {form.code && (
                                <div className="mb-3 flex items-center gap-2">
                                    <Badge
                                        variant="outline"
                                        className="text-sm tracking-widest"
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

            <MobileStickyActionBar>
                <div className="space-y-2">
                    {error ? <p className="line-clamp-2 text-xs text-destructive">{error}</p> : null}
                    <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {form.code ? <span className="font-medium tracking-widest text-foreground">{form.code}: </span> : null}
                        {buildSummary(form)}
                    </p>
                    <Button size="lg" className="w-full" onClick={handleSave} disabled={saving}>
                        {saving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="mr-2 h-4 w-4" />
                        )}
                        {saving ? "Saving…" : "Save discount"}
                    </Button>
                </div>
            </MobileStickyActionBar>
        </div>
    );
}
