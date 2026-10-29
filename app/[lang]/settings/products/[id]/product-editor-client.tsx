"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
    Save, Plus, Trash2, Star, Copy, ExternalLink, ChevronDown, ChevronLeft, ChevronRight, Package,
} from "lucide-react";
import { toast } from "sonner";

import { getApiErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
    Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
    Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ImagePicker } from "@/components/ui/image-picker";
import dynamic from "next/dynamic";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

import type {
    Product, ProductVariant, ProductImage, ProductCategory,
    LocalizedProductContent, ProductStatus, ProductType,
} from "@/lib/types/ecommerce";
import { formatCurrency } from "@/lib/i18n/currencies";
import { useSettingsBreadcrumbDetail } from "@/components/settings/settings-breadcrumb-context";
import {
    MOBILE_MD_COMMANDS,
    MOBILE_MD_EXTRA_COMMANDS,
} from "@/components/settings/markdown-toolbar";
import { useIsMobile } from "@/hooks/use-mobile";
import { stripePriceIdOf, stripeProductIdOf } from "@/lib/stripe/mode";
import { MobileList, MobileListRow } from "@/components/settings/mobile-list";
import {
    MobileStickyActionBar,
    mobileStickyActionBarSpacerClassName,
} from "@/components/ui/mobile-sticky-action-bar";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentMap = Record<string, LocalizedProductContent>;

/** The product row `GET /api/shop/products/[id]` returns under `row`. */
export type LoadedProduct = Product & {
    product_variants?: ProductVariant[];
    product_images?: ProductImage[];
};

/** Exactly the JSON `GET /api/shop/products/[id]` returns. */
export type ProductDetailResponse = {
    ok: true;
    row: LoadedProduct;
};

/** Exactly the JSON `GET /api/shop/categories` returns. */
export type CategoriesListResponse = {
    ok: true;
    rows: ProductCategory[];
};

export type ProductEditorInitialData = {
    product: ProductDetailResponse;
    categories: CategoriesListResponse;
};

interface VariantFormState {
    title: string;
    sku: string;
    option1: string;
    option2: string;
    option3: string;
    price: string;
    compare_at_price: string;
    cost_price: string;
    stock_quantity: string;
    track_inventory: boolean;
    is_active: boolean;
}

const EMPTY_VARIANT_FORM: VariantFormState = {
    title: "",
    sku: "",
    option1: "",
    option2: "",
    option3: "",
    price: "0",
    compare_at_price: "",
    cost_price: "",
    stock_quantity: "0",
    track_inventory: true,
    is_active: true,
};

const EMPTY_CONTENT: LocalizedProductContent = {
    title: "",
    description: "",
    body: "",
    seo_title: "",
    seo_description: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Same shape `fetchProduct` builds from a loaded row. */
function contentFromProduct(p: LoadedProduct | null): ContentMap {
    return {
        "en-US": { ...EMPTY_CONTENT, ...(p?.content?.["en-US"] ?? {}) },
        "zh-CN": { ...EMPTY_CONTENT, ...(p?.content?.["zh-CN"] ?? {}) },
    };
}

function slugify(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

function formatPrice(val: number, currency = "SGD"): string {
    return formatCurrency(val, currency);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductEditorClient({
    initialData,
}: {
    initialData?: ProductEditorInitialData;
}) {
    const router = useRouter();
    const params = useParams();
    const { resolvedTheme } = useTheme();
    const isMobile = useIsMobile();
    const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) ?? "new";
    const isNew = id === "new";

    // Server-rendered row, when the RSC page loaded it. Same values
    // `fetchProduct` would have applied after the first client fetch.
    const initialProduct = initialData?.product.row ?? null;

    // ── Core product state ──
    const [slug, setSlug] = useState(initialProduct?.slug ?? "");
    // A loaded slug counts as manually set.
    const [slugManuallyEdited, setSlugManuallyEdited] = useState(initialProduct !== null);
    const [status, setStatus] = useState<ProductStatus>(initialProduct?.status ?? "draft");
    const [productType, setProductType] = useState<ProductType>(
        initialProduct?.product_type ?? "pillow",
    );
    const [categoryId, setCategoryId] = useState<string | null>(
        initialProduct?.category_id ?? null,
    );
    const [tags, setTags] = useState<string[]>(initialProduct?.tags ?? []);
    const [tagInput, setTagInput] = useState("");
    const [featured, setFeatured] = useState(initialProduct?.featured ?? false);
    const [stripeProductId, setStripeProductId] = useState<string | null>(
        stripeProductIdOf(initialProduct) ?? null,
    );
    const [stripePaymentLink, setStripePaymentLink] = useState<string | null>(
        initialProduct?.stripe_payment_link ?? null,
    );
    const [isAutoGenerated, setIsAutoGenerated] = useState(
        initialProduct?.is_auto_generated ?? false,
    );

    // ── Localized content ──
    const [content, setContent] = useState<ContentMap>(() =>
        contentFromProduct(initialProduct),
    );

    useSettingsBreadcrumbDetail(
        isNew ? "New product" : (content["en-US"]?.title?.trim() || null),
    );

    // ── Images ──
    const [images, setImages] = useState<ProductImage[]>(() =>
        (initialProduct?.product_images ?? initialProduct?.images ?? []).sort(
            (a, b) => a.position - b.position,
        ),
    );

    // ── Variants ──
    const [variants, setVariants] = useState<ProductVariant[]>(() =>
        (initialProduct?.product_variants ?? initialProduct?.variants ?? []).sort(
            (a, b) => a.position - b.position,
        ),
    );
    const [variantDialogOpen, setVariantDialogOpen] = useState(false);
    const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
    const [variantForm, setVariantForm] = useState<VariantFormState>(EMPTY_VARIANT_FORM);
    const [variantSaving, setVariantSaving] = useState(false);
    const [variantsOpen, setVariantsOpen] = useState(true);
    const [seoOpen, setSeoOpen] = useState(false);

    // ── Async flags ──
    const [loading, setLoading] = useState(!isNew && !initialData);
    const [saving, setSaving] = useState(false);
    const [syncingStripe, setSyncingStripe] = useState(false);
    const [generatingLink, setGeneratingLink] = useState(false);

    // ── Reference data ──
    const [categories, setCategories] = useState<ProductCategory[]>(
        initialData?.categories.rows ?? [],
    );

    // The RSC page already loaded the product and the categories — skip the
    // mount fetches once, then behave exactly as before.
    const hydratedFromServer = useRef(Boolean(initialData));

    // ── Fetch categories ──
    useEffect(() => {
        if (initialData) return;
        fetch("/api/shop/categories")
            .then((r) => r.json())
            .then((data) => setCategories(data.rows ?? []))
            .catch(() => {});
    }, [initialData]);

    // Free-form creation is retired — products come from inventory.
    useEffect(() => {
        if (isNew) {
            toast.message("Products come from inventory. Use Sync from Inventory on the Products page.");
            router.replace("../products");
        }
    }, [isNew, router]);

    // ── Fetch product if editing ──
    const fetchProduct = useCallback(async () => {
        if (isNew) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/shop/products/${id}`);
            const data = await res.json();
            if (!data.ok) {
                toast.error("Couldn't find this product.");
                return;
            }
            const p: LoadedProduct = data.row;

            setSlug(p.slug ?? "");
            setSlugManuallyEdited(true); // treat loaded slug as manually set
            setStatus(p.status);
            setProductType(p.product_type);
            setCategoryId(p.category_id);
            setTags(p.tags ?? []);
            setFeatured(p.featured ?? false);
            setStripeProductId(stripeProductIdOf(p) ?? null);
            setStripePaymentLink(p.stripe_payment_link ?? null);
            setIsAutoGenerated(p.is_auto_generated ?? false);
            setContent(contentFromProduct(p));
            setVariants(
                (p.product_variants ?? p.variants ?? []).sort((a, b) => a.position - b.position)
            );
            setImages(
                (p.product_images ?? p.images ?? []).sort((a, b) => a.position - b.position)
            );
        } catch {
            toast.error("Couldn't load the product.");
        } finally {
            setLoading(false);
        }
    }, [id, isNew]);

    useEffect(() => {
        if (hydratedFromServer.current) {
            hydratedFromServer.current = false;
            return;
        }
        fetchProduct();
    }, [fetchProduct]);

    // ── Auto-generate slug from EN title ──
    const enTitle = content["en-US"]?.title ?? "";
    useEffect(() => {
        if (!slugManuallyEdited && isNew) {
            setSlug(slugify(enTitle));
        }
    }, [enTitle, slugManuallyEdited, isNew]);

    // ── Content helpers ──
    const updateContent = (locale: string, field: keyof LocalizedProductContent, value: string) => {
        setContent((prev) => ({
            ...prev,
            [locale]: { ...prev[locale], [field]: value },
        }));
    };

    // ── Tags ──
    const addTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const val = tagInput.trim().toLowerCase();
            if (val && !tags.includes(val)) {
                setTags([...tags, val]);
            }
            setTagInput("");
        }
    };
    const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

    // ── Save product ──
    const handleSave = async () => {
        if (!slug.trim()) { toast.error("Enter a slug."); return; }
        if (!content["en-US"]?.title?.trim()) { toast.error("Enter an English title."); return; }

        setSaving(true);
        try {
            const payload = {
                slug: slug.trim(),
                product_type: productType,
                status,
                content,
                category_id: categoryId || null,
                featured,
                tags,
            };

            let res: Response;
            if (isNew) {
                res = await fetch("/api/shop/products", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetch(`/api/shop/products/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }

            const data = await res.json();
            if (!data.ok) {
                toast.error(getApiErrorMessage(data.error, "Couldn't save."));
                return;
            }

            toast.success(isNew ? "Product created" : "Product saved");
            if (data.stripe && data.stripe.synced === false) {
                toast.warning(`Saved, but couldn't sync to Stripe: ${data.stripe.error ?? "unknown error"}. Use Sync to Stripe to try again.`);
            }
            if (isNew && data.row?.id) {
                router.push(`../products/${data.row.id}`);
            }
        } catch {
            toast.error("Couldn't save.");
        } finally {
            setSaving(false);
        }
    };

    // ── Images ──
    const addImage = async (selection: { assetId: string; url: string; alt?: string | null }) => {
        if (isNew) {
            toast.error("Save the product before adding images.");
            return;
        }
        try {
            const res = await fetch(`/api/shop/products/${id}/images`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: selection.url,
                    alt_text: selection.alt ?? null,
                    media_asset_id: selection.assetId,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                setImages((prev) => [...prev, data.row]);
                toast.success("Image added");
            } else {
                toast.error(getApiErrorMessage(data.error, "Couldn't add the image."));
            }
        } catch {
            toast.error("Couldn't add the image.");
        }
    };

    const deleteImage = async (imageId: string) => {
        try {
            const res = await fetch(`/api/shop/products/${id}/images/${imageId}`, { method: "DELETE" });
            const data = await res.json();
            if (data.ok) {
                setImages((prev) => prev.filter((img) => img.id !== imageId));
                toast.success("Image removed");
            } else {
                toast.error(getApiErrorMessage(data.error, "Couldn't remove the image."));
            }
        } catch {
            toast.error("Couldn't remove the image.");
        }
    };

    const moveImage = async (idx: number, dir: -1 | 1) => {
        const next = [...images];
        const [moved] = next.splice(idx, 1);
        next.splice(idx + dir, 0, moved!);
        const prev = images;
        setImages(next.map((img, position) => ({ ...img, position })));
        try {
            const res = await fetch(`/api/shop/products/${id}/images/reorder`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ order: next.map((img) => img.id) }),
            });
            if (!res.ok) throw new Error();
        } catch {
            setImages(prev);
            toast.error("Couldn't reorder the images.");
        }
    };

    // Base images set in Inventory: from the item behind a variant, or the pillow/bolster product itself.
    const inventoryImageUrls = new Set(
        variants
            .filter((v) => v.image_url && (v.item_id != null || v.pillow_product_id != null || isAutoGenerated))
            .map((v) => v.image_url),
    );

    // ── Variants ──
    const openAddVariant = () => {
        setEditingVariant(null);
        setVariantForm(EMPTY_VARIANT_FORM);
        setVariantDialogOpen(true);
    };

    const openEditVariant = (v: ProductVariant) => {
        setEditingVariant(v);
        setVariantForm({
            title: v.title ?? "",
            sku: v.sku ?? "",
            option1: v.option1 ?? "",
            option2: v.option2 ?? "",
            option3: v.option3 ?? "",
            price: String(v.price),
            compare_at_price: v.compare_at_price != null ? String(v.compare_at_price) : "",
            cost_price: v.cost_price != null ? String(v.cost_price) : "",
            stock_quantity: String(v.stock_quantity),
            track_inventory: v.track_inventory,
            is_active: v.is_active,
        });
        setVariantDialogOpen(true);
    };

    const handleVariantSave = async () => {
        if (isNew) {
            toast.error("Save the product before adding variants.");
            return;
        }
        const price = parseFloat(variantForm.price);
        if (isNaN(price) || price < 0) { toast.error("Enter a valid price."); return; }

        setVariantSaving(true);
        try {
            const payload = {
                title: variantForm.title || null,
                sku: variantForm.sku || null,
                option1: variantForm.option1 || null,
                option2: variantForm.option2 || null,
                option3: variantForm.option3 || null,
                price,
                compare_at_price: variantForm.compare_at_price ? parseFloat(variantForm.compare_at_price) : null,
                cost_price: variantForm.cost_price ? parseFloat(variantForm.cost_price) : null,
                stock_quantity: parseInt(variantForm.stock_quantity, 10) || 0,
                track_inventory: variantForm.track_inventory,
                is_active: variantForm.is_active,
            };

            let res: Response;
            if (editingVariant) {
                res = await fetch(`/api/shop/products/${id}/variants/${editingVariant.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetch(`/api/shop/products/${id}/variants`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }

            const data = await res.json();
            if (!data.ok) { toast.error(getApiErrorMessage(data.error, "Couldn't save the variant.")); return; }

            if (editingVariant) {
                setVariants((prev) => prev.map((v) => v.id === editingVariant.id ? data.row : v));
            } else {
                setVariants((prev) => [...prev, data.row]);
            }
            toast.success(editingVariant ? "Variant updated" : "Variant added");
            if (data.stripe && data.stripe.synced === false) {
                toast.warning(`Saved, but couldn't sync to Stripe: ${data.stripe.error ?? "unknown error"}. Use Sync to Stripe to try again.`);
            }
            setVariantDialogOpen(false);
        } catch {
            toast.error("Couldn't save the variant.");
        } finally {
            setVariantSaving(false);
        }
    };

    const deleteVariant = async (variantId: string) => {
        if (!confirm("Delete this variant?")) return;
        try {
            const res = await fetch(`/api/shop/products/${id}/variants/${variantId}`, { method: "DELETE" });
            const data = await res.json();
            if (data.ok) {
                setVariants((prev) => prev.filter((v) => v.id !== variantId));
                toast.success("Variant deleted");
            } else {
                toast.error(getApiErrorMessage(data.error, "Couldn't delete the variant."));
            }
        } catch {
            toast.error("Couldn't delete the variant.");
        }
    };

    const toggleVariantActive = async (v: ProductVariant) => {
        try {
            const res = await fetch(`/api/shop/products/${id}/variants/${v.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: !v.is_active }),
            });
            const data = await res.json();
            if (data.ok) {
                setVariants((prev) => prev.map((x) => x.id === v.id ? data.row : x));
            }
        } catch {
            toast.error("Couldn't update the variant.");
        }
    };

    // ── Stripe ──
    const handleSyncToStripe = async () => {
        if (isNew) { toast.error("Save the product first."); return; }
        setSyncingStripe(true);
        try {
            const res = await fetch("/api/stripe/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: id }),
            });
            const data = await res.json();
            if (data.ok) {
                setStripeProductId(data.stripeProductId ?? stripeProductId);
                toast.success("Synced to Stripe");
            } else {
                toast.error(getApiErrorMessage(data.error, "Couldn't sync to Stripe."));
            }
        } catch {
            toast.error("Couldn't sync to Stripe.");
        } finally {
            setSyncingStripe(false);
        }
    };

    const handleGeneratePaymentLink = async () => {
        if (isNew) { toast.error("Save the product first."); return; }
        setGeneratingLink(true);
        try {
            const res = await fetch("/api/stripe/payment-link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: id }),
            });
            const data = await res.json();
            if (data.ok) {
                setStripePaymentLink(data.url ?? data.stripe_payment_link ?? null);
                toast.success("Payment link generated");
            } else {
                toast.error(getApiErrorMessage(data.error, "Couldn't generate the link."));
            }
        } catch {
            toast.error("Couldn't generate the link.");
        } finally {
            setGeneratingLink(false);
        }
    };

    const copyPaymentLink = () => {
        if (!stripePaymentLink) return;
        navigator.clipboard.writeText(stripePaymentLink);
        toast.success("Copied to clipboard");
    };

    // ── Price range from variants ──
    const priceRange = variants.length
        ? {
            min: Math.min(...variants.map((v) => v.price)),
            max: Math.max(...variants.map((v) => v.price)),
            currency: variants[0]?.currency ?? "SGD",
        }
        : null;

    // ── Category label helper ──
    const getCategoryName = (cat: ProductCategory): string => {
        return cat.content?.["en-US"]?.name ?? cat.slug;
    };

    // ── Variant stock and warnings (the desktop table and the phone list) ──
    const renderVariantStock = (v: ProductVariant) =>
        isAutoGenerated ? (
            <span className={
                v.stock_quantity === 0
                    ? "text-destructive font-medium"
                    : v.stock_quantity < 10
                    ? "text-yellow-600 dark:text-yellow-400 font-medium"
                    : "text-green-600 dark:text-green-400"
            }>
                {v.stock_quantity} buildable
            </span>
        ) : v.track_inventory ? (
            <span className={
                v.stock_quantity === 0
                    ? "text-destructive font-medium"
                    : v.stock_quantity < 10
                    ? "text-yellow-600 dark:text-yellow-400 font-medium"
                    : ""
            }>
                {v.stock_quantity}
            </span>
        ) : "∞";

    const renderVariantWarnings = (v: ProductVariant) => (
        <>
            {v.price === 0 && (
                <div className="text-xs text-amber-600 mt-0.5">
                    {isAutoGenerated ? "⚠ No costing source" : "⚠ Price not set"}
                </div>
            )}
            {!stripePriceIdOf(v) && (
                <div className="text-xs text-red-500 mt-0.5">⚠ No Stripe ID</div>
            )}
        </>
    );

    // ── Locale tab content renderer ──
    const renderLocaleTab = (locale: string) => {
        const loc = content[locale] ?? EMPTY_CONTENT;
        return (
            <div className="space-y-4 pt-4">
                <div className="space-y-1.5">
                    <Label htmlFor={`title-${locale}`}>Title</Label>
                    <Input
                        id={`title-${locale}`}
                        value={loc.title}
                        onChange={(e) => updateContent(locale, "title", e.target.value)}
                        placeholder="Product title"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor={`desc-${locale}`}>Short description</Label>
                    <Textarea
                        id={`desc-${locale}`}
                        value={loc.description ?? ""}
                        onChange={(e) => updateContent(locale, "description", e.target.value)}
                        placeholder="Brief description shown in listings"
                        rows={3}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor={`body-${locale}`}>Body</Label>
                    <div data-color-mode={resolvedTheme === "dark" ? "dark" : "light"}>
                        <MDEditor
                            value={loc.body ?? ""}
                            onChange={(val) => updateContent(locale, "body", val ?? "")}
                            height={300}
                            preview="edit"
                            commands={isMobile ? MOBILE_MD_COMMANDS : undefined}
                            extraCommands={isMobile ? MOBILE_MD_EXTRA_COMMANDS : undefined}
                        />
                    </div>
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Package className="h-8 w-8 animate-pulse text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className={`space-y-6 ${mobileStickyActionBarSpacerClassName}`}>
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">
                        {isNew ? "New product" : (content["en-US"]?.title || "Edit product")}
                    </h1>
                    {!isNew && (
                        <p className="text-sm text-muted-foreground mt-0.5">/{slug}</p>
                    )}
                </div>
                {/* Phones save from the bar at the bottom instead: one Save, always in reach. */}
                <Button onClick={handleSave} disabled={saving} size="sm" className="max-md:hidden">
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? "Saving…" : "Save"}
                </Button>
            </div>

            {isAutoGenerated && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    This product is built from inventory, which sets its type, slug and variants. Price, cost and compare-at come from Costings.
                </div>
            )}
            {!isAutoGenerated && !isNew && !variants.some((v) => v.item_id != null || v.pillow_product_id != null || v.price_key != null) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <Badge variant="outline" className="mr-2 border-amber-400 text-amber-800">Legacy</Badge>
                    This product isn&apos;t linked to inventory, so its price is edited by hand. Link it to an inventory item or retire it.
                </div>
            )}

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── LEFT COLUMN ── */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Locale content tabs */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Content</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="en-US">
                                <TabsList>
                                    <TabsTrigger value="en-US">English</TabsTrigger>
                                    <TabsTrigger value="zh-CN">中文</TabsTrigger>
                                </TabsList>
                                <TabsContent value="en-US">{renderLocaleTab("en-US")}</TabsContent>
                                <TabsContent value="zh-CN">{renderLocaleTab("zh-CN")}</TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>

                    {/* Images */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                            <CardTitle>Images</CardTitle>
                            <ImagePicker onSelect={addImage}>
                                <Button variant="outline" size="sm" type="button">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add image
                                </Button>
                            </ImagePicker>
                        </CardHeader>
                        <CardContent>
                            {images.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                                    No images yet.
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {images.map((img, idx) => (
                                        <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={img.url}
                                                alt={img.alt_text ?? "product image"}
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute top-1 left-1 flex flex-col items-start gap-1">
                                                {idx === 0 && (
                                                    <Badge variant="secondary" className="text-xs px-1 py-0 gap-1">
                                                        <Star className="h-2.5 w-2.5" />
                                                        Primary
                                                    </Badge>
                                                )}
                                                {inventoryImageUrls.has(img.url) && (
                                                    <Badge
                                                        variant="outline"
                                                        className="bg-background/80 text-xs px-1 py-0"
                                                        title="Base image from inventory. Change it on the Inventory page."
                                                    >
                                                        From inventory
                                                    </Badge>
                                                )}
                                            </div>
                                            {images.length > 1 && (
                                                <div className="absolute bottom-1 inset-x-1 flex justify-between">
                                                    <button
                                                        type="button"
                                                        aria-label="Move image earlier"
                                                        disabled={idx === 0}
                                                        onClick={() => moveImage(idx, -1)}
                                                        className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-background/80 shadow-sm active:bg-press disabled:invisible"
                                                    >
                                                        <ChevronLeft className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        aria-label="Move image later"
                                                        disabled={idx === images.length - 1}
                                                        onClick={() => moveImage(idx, 1)}
                                                        className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-background/80 shadow-sm active:bg-press disabled:invisible"
                                                    >
                                                        <ChevronRight className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                aria-label="Remove image"
                                                onClick={() => deleteImage(img.id)}
                                                className="absolute top-1 right-1 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm active:opacity-80"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Variants */}
                    <Collapsible open={variantsOpen} onOpenChange={setVariantsOpen}>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                                <CollapsibleTrigger asChild>
                                    <button type="button" className="flex items-center gap-2 text-left transition-opacity active:opacity-60 max-md:min-h-11">
                                        <CardTitle>Variants</CardTitle>
                                        <ChevronDown
                                            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${variantsOpen ? "rotate-180" : ""}`}
                                        />
                                    </button>
                                </CollapsibleTrigger>
                                {!isAutoGenerated && (
                                    <Button variant="outline" size="sm" type="button" onClick={openAddVariant}>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add variant
                                    </Button>
                                )}
                            </CardHeader>
                            <CollapsibleContent>
                                <CardContent className="pt-0">
                                    {variants.length === 0 ? (
                                        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                                            No variants yet.
                                        </div>
                                    ) : (
                                        <>
                                        <MobileList className="rounded-none border-x-0 bg-transparent">
                                            {variants.map((v) => {
                                                const options = [v.option1, v.option2, v.option3].filter(Boolean).join(" / ");
                                                const title = v.title || "—";
                                                return (
                                                    <MobileListRow
                                                        key={v.id}
                                                        onClick={() => openEditVariant(v)}
                                                        actions={
                                                            <div className="flex items-center gap-2">
                                                                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-xs transition-colors active:bg-press">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={v.is_active}
                                                                        onChange={() => toggleVariantActive(v)}
                                                                        className="h-4 w-4 rounded border-border accent-primary"
                                                                    />
                                                                    Active
                                                                </label>
                                                                {!isAutoGenerated && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="text-destructive hover:text-destructive"
                                                                        aria-label={`Delete ${title}`}
                                                                        onClick={() => deleteVariant(v.id)}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        }
                                                    >
                                                        <div className="flex items-baseline justify-between gap-2">
                                                            <span className="truncate font-medium">{title}</span>
                                                            <span className="shrink-0 text-sm tabular-nums">
                                                                {formatPrice(v.price, v.currency)}
                                                            </span>
                                                        </div>
                                                        {options && (
                                                            <div className="truncate text-xs text-muted-foreground">{options}</div>
                                                        )}
                                                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                                                            <span className="break-words">SKU {v.sku || "—"}</span>
                                                            <span>{renderVariantStock(v)}</span>
                                                            {v.compare_at_price && v.compare_at_price > v.price && (
                                                                <span className="line-through">{formatPrice(v.compare_at_price, v.currency)}</span>
                                                            )}
                                                        </div>
                                                        {renderVariantWarnings(v)}
                                                    </MobileListRow>
                                                );
                                            })}
                                        </MobileList>
                                        <div className="hidden rounded-lg border overflow-hidden md:block">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Title and options</TableHead>
                                                        <TableHead>SKU</TableHead>
                                                        <TableHead>Price</TableHead>
                                                        <TableHead>Stock</TableHead>
                                                        <TableHead className="text-center">Active</TableHead>
                                                        <TableHead className="text-right">Actions</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {variants.map((v) => (
                                                        <TableRow key={v.id}>
                                                            <TableCell>
                                                                <div className="font-medium">{v.title || "—"}</div>
                                                                {(v.option1 || v.option2 || v.option3) && (
                                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                                        {[v.option1, v.option2, v.option3].filter(Boolean).join(" / ")}
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-sm text-muted-foreground">
                                                                {v.sku || "—"}
                                                            </TableCell>
                                                            <TableCell className="text-sm">
                                                                {formatPrice(v.price, v.currency)}
                                                                {v.compare_at_price && v.compare_at_price > v.price && (
                                                                    <div className="text-xs text-muted-foreground line-through">
                                                                        {formatPrice(v.compare_at_price, v.currency)}
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-sm">
                                                                {renderVariantStock(v)}
                                                                {renderVariantWarnings(v)}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={v.is_active}
                                                                    onChange={() => toggleVariantActive(v)}
                                                                    className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-right space-x-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => openEditVariant(v)}
                                                                >
                                                                    Edit
                                                                </Button>
                                                                {!isAutoGenerated && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="text-destructive hover:text-destructive"
                                                                        onClick={() => deleteVariant(v.id)}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                        </>
                                    )}
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>
                </div>

                {/* ── RIGHT COLUMN ── */}
                <div className="space-y-4">

                    {/* Status + Save */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Status</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="status-select">Visibility</Label>
                                <Select
                                    value={status}
                                    onValueChange={(v) => setStatus(v as ProductStatus)}
                                >
                                    <SelectTrigger id="status-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="draft">Draft</SelectItem>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="archived">Archived</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={handleSave} disabled={saving} className="w-full max-md:hidden">
                                <Save className="mr-2 h-4 w-4" />
                                {saving ? "Saving…" : "Save product"}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Pricing (only when variants exist) */}
                    {priceRange && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Pricing</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground mb-1">Price range from variants</p>
                                <p className="text-lg font-semibold">
                                    {priceRange.min === priceRange.max
                                        ? formatPrice(priceRange.min, priceRange.currency)
                                        : `${formatPrice(priceRange.min, priceRange.currency)} to ${formatPrice(priceRange.max, priceRange.currency)}`
                                    }
                                </p>
                                <p className="text-xs text-muted-foreground mt-2">
                                    {variants.length} variant{variants.length !== 1 ? "s" : ""}
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Stripe */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Stripe</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <Label>Stripe product ID</Label>
                                <div className="flex items-center gap-2">
                                    <Badge variant={stripeProductId ? "secondary" : "outline"} className="text-xs truncate max-w-full">
                                        {stripeProductId ?? "Not synced"}
                                    </Badge>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={handleSyncToStripe}
                                disabled={syncingStripe || isNew}
                            >
                                {syncingStripe ? "Syncing…" : "Sync to Stripe"}
                            </Button>

                            <div className="space-y-1.5 pt-2 border-t">
                                <Label>Payment link</Label>
                                {stripePaymentLink ? (
                                    <div className="flex items-center gap-1.5">
                                        <Input
                                            value={stripePaymentLink}
                                            readOnly
                                            className="text-base md:text-xs flex-1 min-w-0"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="shrink-0"
                                            onClick={copyPaymentLink}
                                            title="Copy link"
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="shrink-0"
                                            onClick={() => window.open(stripePaymentLink, "_blank")}
                                            title="Open link"
                                        >
                                            <ExternalLink className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">No payment link yet.</p>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={handleGeneratePaymentLink}
                                    disabled={generatingLink || isNew || !stripeProductId}
                                >
                                    {generatingLink ? "Generating…" : "Generate link"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Organization */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Organization</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Category */}
                            <div className="space-y-1.5">
                                <Label htmlFor="category-select">Category</Label>
                                <Select
                                    value={categoryId ?? "__none__"}
                                    onValueChange={(v) => setCategoryId(v === "__none__" ? null : v)}
                                >
                                    <SelectTrigger id="category-select">
                                        <SelectValue placeholder="No category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">No category</SelectItem>
                                        {categories.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.id}>
                                                {getCategoryName(cat)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Tags */}
                            <div className="space-y-1.5">
                                <Label htmlFor="tag-input">Tags</Label>
                                <div className="flex flex-wrap gap-1.5 mb-1.5 max-md:gap-2">
                                    {tags.map((tag) => (
                                        <Badge key={tag} variant="secondary" className="gap-1 text-xs max-md:min-h-11 max-md:pr-0 max-md:pl-3 max-md:text-sm">
                                            {tag}
                                            <button
                                                type="button"
                                                onClick={() => removeTag(tag)}
                                                className="ml-0.5 hover:text-destructive transition-colors active:text-destructive max-md:ml-0 max-md:flex max-md:size-11 max-md:items-center max-md:justify-center"
                                                aria-label={`Remove tag ${tag}`}
                                            >
                                                ×
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                                <Input
                                    id="tag-input"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={addTag}
                                    placeholder="Type a tag and press Enter"
                                    className="text-base md:text-sm"
                                />
                            </div>

                            {/* Product type */}
                            <div className="space-y-1.5">
                                <Label htmlFor="type-select">Product type</Label>
                                <Select
                                    value={productType}
                                    onValueChange={(v) => setProductType(v as ProductType)}
                                >
                                    <SelectTrigger id="type-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pillow">Pillow</SelectItem>
                                        <SelectItem value="bolster">Bolster</SelectItem>
                                        <SelectItem value="accessory">Accessory</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Featured */}
                            <div className="flex items-center gap-2.5">
                                <input
                                    type="checkbox"
                                    id="featured-checkbox"
                                    checked={featured}
                                    onChange={(e) => setFeatured(e.target.checked)}
                                    className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                                />
                                <Label htmlFor="featured-checkbox" className="cursor-pointer max-md:min-h-11 max-md:flex-1 max-md:active:opacity-60">
                                    Featured product
                                </Label>
                            </div>
                        </CardContent>
                    </Card>

                    {/* SEO (collapsible) */}
                    <Collapsible open={seoOpen} onOpenChange={setSeoOpen}>
                        <Card>
                            <CardHeader className="pb-3">
                                <CollapsibleTrigger asChild>
                                    <button type="button" className="flex items-center justify-between w-full text-left transition-opacity active:opacity-60 max-md:min-h-11">
                                        <CardTitle>SEO</CardTitle>
                                        <ChevronDown
                                            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${seoOpen ? "rotate-180" : ""}`}
                                        />
                                    </button>
                                </CollapsibleTrigger>
                            </CardHeader>
                            <CollapsibleContent>
                                <CardContent className="pt-0 space-y-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="slug-input">Slug</Label>
                                        <Input
                                            id="slug-input"
                                            value={slug}
                                            onChange={(e) => {
                                                setSlug(e.target.value);
                                                setSlugManuallyEdited(true);
                                            }}
                                            placeholder="product-slug"
                                            className="text-base md:text-sm"
                                            disabled={isAutoGenerated}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="seo-title-en">SEO title (EN)</Label>
                                        <Input
                                            id="seo-title-en"
                                            value={content["en-US"]?.seo_title ?? ""}
                                            onChange={(e) => updateContent("en-US", "seo_title", e.target.value)}
                                            placeholder="Defaults to product title"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="seo-answer-en">Answer lede (EN, 60 to 120 words)</Label>
                                        <Textarea
                                            id="seo-answer-en"
                                            value={content["en-US"]?.seo_answer ?? ""}
                                            onChange={(e) => updateContent("en-US", "seo_answer", e.target.value)}
                                            placeholder="A direct answer shown under the product title"
                                            rows={3}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="seo-desc-en">SEO description (EN)</Label>
                                        <Textarea
                                            id="seo-desc-en"
                                            value={content["en-US"]?.seo_description ?? ""}
                                            onChange={(e) => updateContent("en-US", "seo_description", e.target.value)}
                                            placeholder="Defaults to short description"
                                            rows={3}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="seo-title-zh">SEO title (ZH)</Label>
                                        <Input
                                            id="seo-title-zh"
                                            value={content["zh-CN"]?.seo_title ?? ""}
                                            onChange={(e) => updateContent("zh-CN", "seo_title", e.target.value)}
                                            placeholder="Defaults to product title"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="seo-answer-zh">Answer lede (ZH)</Label>
                                        <Textarea
                                            id="seo-answer-zh"
                                            value={content["zh-CN"]?.seo_answer ?? ""}
                                            onChange={(e) => updateContent("zh-CN", "seo_answer", e.target.value)}
                                            rows={3}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="seo-desc-zh">SEO description (ZH)</Label>
                                        <Textarea
                                            id="seo-desc-zh"
                                            value={content["zh-CN"]?.seo_description ?? ""}
                                            onChange={(e) => updateContent("zh-CN", "seo_description", e.target.value)}
                                            placeholder="Defaults to short description"
                                            rows={3}
                                        />
                                    </div>
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>
                </div>
            </div>

            {/* ── Variant Dialog ── */}
            <Dialog open={variantDialogOpen} onOpenChange={setVariantDialogOpen}>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingVariant ? "Edit variant" : "Add variant"}</DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-4 py-2">
                        <div className="col-span-2 space-y-1.5">
                            <Label htmlFor="vf-title">Title</Label>
                            <Input
                                id="vf-title"
                                value={variantForm.title}
                                onChange={(e) => setVariantForm((f) => ({ ...f, title: e.target.value }))}
                                placeholder="e.g. Standard / Memory Foam"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="vf-sku">SKU</Label>
                            <Input
                                id="vf-sku"
                                value={variantForm.sku}
                                onChange={(e) => setVariantForm((f) => ({ ...f, sku: e.target.value }))}
                                placeholder="SKU-001"
                                className="text-base md:text-sm"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="vf-price">
                                {isAutoGenerated ? "Price (from Costings)" : "Price *"}
                            </Label>
                            <Input
                                id="vf-price"
                                type="number"
                                min="0"
                                step="0.01"
                                value={variantForm.price}
                                onChange={(e) => setVariantForm((f) => ({ ...f, price: e.target.value }))}
                                readOnly={isAutoGenerated}
                                className={isAutoGenerated ? "bg-muted cursor-not-allowed" : ""}
                            />
                            {isAutoGenerated && (
                                <p className="text-xs text-muted-foreground">Set the MSRP in Costings</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="vf-compare">
                                {isAutoGenerated ? "Compare-at (from Costings)" : "Compare-at price"}
                            </Label>
                            <Input
                                id="vf-compare"
                                type="number"
                                min="0"
                                step="0.01"
                                value={variantForm.compare_at_price}
                                onChange={(e) => setVariantForm((f) => ({ ...f, compare_at_price: e.target.value }))}
                                placeholder="Optional"
                                readOnly={isAutoGenerated}
                                className={isAutoGenerated ? "bg-muted cursor-not-allowed" : ""}
                            />
                            {isAutoGenerated && (
                                <p className="text-xs text-muted-foreground">Set compare-at in Costings</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="vf-cost">
                                {isAutoGenerated ? "Cost price (from Costings)" : "Cost price"}
                            </Label>
                            <Input
                                id="vf-cost"
                                type="number"
                                min="0"
                                step="0.01"
                                value={variantForm.cost_price}
                                onChange={(e) => setVariantForm((f) => ({ ...f, cost_price: e.target.value }))}
                                placeholder="Optional"
                                readOnly={isAutoGenerated}
                                className={isAutoGenerated ? "bg-muted cursor-not-allowed" : ""}
                            />
                            {isAutoGenerated && (
                                <p className="text-xs text-muted-foreground">Worked out from the BOM and item costs</p>
                            )}
                        </div>

                        {!isAutoGenerated && (
                            <div className="space-y-1.5">
                                <Label htmlFor="vf-stock">Stock quantity</Label>
                                <Input
                                    id="vf-stock"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={variantForm.stock_quantity}
                                    onChange={(e) => setVariantForm((f) => ({ ...f, stock_quantity: e.target.value }))}
                                />
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label htmlFor="vf-option1">Option 1</Label>
                            <Input
                                id="vf-option1"
                                value={variantForm.option1}
                                onChange={(e) => setVariantForm((f) => ({ ...f, option1: e.target.value }))}
                                placeholder="e.g. Size"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="vf-option2">Option 2</Label>
                            <Input
                                id="vf-option2"
                                value={variantForm.option2}
                                onChange={(e) => setVariantForm((f) => ({ ...f, option2: e.target.value }))}
                                placeholder="e.g. Color"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="vf-option3">Option 3</Label>
                            <Input
                                id="vf-option3"
                                value={variantForm.option3}
                                onChange={(e) => setVariantForm((f) => ({ ...f, option3: e.target.value }))}
                                placeholder="e.g. Material"
                            />
                        </div>

                        <div className="col-span-2 flex gap-6 pt-1">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="vf-track"
                                    checked={variantForm.track_inventory}
                                    onChange={(e) => setVariantForm((f) => ({ ...f, track_inventory: e.target.checked }))}
                                    className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                                />
                                <Label htmlFor="vf-track" className="cursor-pointer max-md:min-h-11 max-md:flex-1">Track inventory</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="vf-active"
                                    checked={variantForm.is_active}
                                    onChange={(e) => setVariantForm((f) => ({ ...f, is_active: e.target.checked }))}
                                    className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                                />
                                <Label htmlFor="vf-active" className="cursor-pointer max-md:min-h-11 max-md:flex-1">Active</Label>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setVariantDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleVariantSave} disabled={variantSaving}>
                            {variantSaving ? "Saving…" : editingVariant ? "Update" : "Add variant"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <MobileStickyActionBar>
                <Button size="lg" className="w-full" onClick={handleSave} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? "Saving…" : "Save product"}
                </Button>
            </MobileStickyActionBar>
        </div>
    );
}
