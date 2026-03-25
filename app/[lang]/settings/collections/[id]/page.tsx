"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft,
    Save,
    Loader2,
    Plus,
    Trash2,
    GripVertical,
    Search,
    Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { ImagePicker } from "@/components/ui/image-picker";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";
import type { Collection, CollectionRule, Product } from "@/lib/types/ecommerce";

// ─── Types ───────────────────────────────────────────────────────────────────

type LocaleContent = { title: string; description: string };
const emptyContent = (): LocaleContent => ({ title: "", description: "" });

type RuleField = "status" | "product_type" | "tags" | "category_id";
type RuleCondition = "equals" | "not_equals" | "contains";

const RULE_FIELDS: { value: RuleField; label: string }[] = [
    { value: "status", label: "Status" },
    { value: "product_type", label: "Product Type" },
    { value: "tags", label: "Tags" },
    { value: "category_id", label: "Category ID" },
];

const RULE_CONDITIONS: { value: RuleCondition; label: string }[] = [
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Not equals" },
    { value: "contains", label: "Contains" },
];

// ─── Slug helper ─────────────────────────────────────────────────────────────

function toSlug(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 300);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CollectionEditorPage() {
    const params = useParams();
    const router = useRouter();
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);

    const isNew = params.id === "new";
    const collectionId = isNew ? null : (params.id as string);

    // ── Loading / saving state ──
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);

    // ── Core fields ──
    const [slug, setSlug] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [collectionType, setCollectionType] = useState<"manual" | "auto">("manual");
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    // ── Localised content ──
    const [content, setContent] = useState<Record<string, LocaleContent>>({
        "en-US": emptyContent(),
        "zh-CN": emptyContent(),
    });
    const [activeLocale, setActiveLocale] = useState<Locale>("en-US");
    const activeContent = content[activeLocale] ?? emptyContent();

    const updateContent = (field: keyof LocaleContent, value: string) => {
        setContent((prev) => ({
            ...prev,
            [activeLocale]: { ...prev[activeLocale], [field]: value },
        }));
    };

    // Auto-fill slug from en-US title when creating
    const slugTouchedRef = useRef(false);
    useEffect(() => {
        if (isNew && !slugTouchedRef.current && content["en-US"]?.title) {
            setSlug(toSlug(content["en-US"].title));
        }
    }, [content, isNew]);

    // ── Rules (auto collections) ──
    const [rules, setRules] = useState<CollectionRule[]>([]);

    const addRule = () =>
        setRules((prev) => [...prev, { field: "status", condition: "equals", value: "" }]);

    const updateRule = (index: number, patch: Partial<CollectionRule>) =>
        setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

    const removeRule = (index: number) =>
        setRules((prev) => prev.filter((_, i) => i !== index));

    // ── Products (manual collections) ──
    const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
    const [productSearch, setProductSearch] = useState("");
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [searching, setSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [savingProducts, setSavingProducts] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Dismiss dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const searchProducts = useCallback(async (query: string) => {
        if (!query.trim()) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }
        setSearching(true);
        try {
            const res = await fetch(
                `/api/shop/products?search=${encodeURIComponent(query)}&limit=10`
            );
            const json = await res.json();
            const rows: Product[] = json.rows ?? json.data ?? [];
            // Exclude already-selected
            setSearchResults(
                rows.filter((p) => !selectedProducts.find((s) => s.id === p.id))
            );
            setShowDropdown(true);
        } finally {
            setSearching(false);
        }
    }, [selectedProducts]);

    const handleProductSearchChange = (value: string) => {
        setProductSearch(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchProducts(value), 300);
    };

    const addProduct = (product: Product) => {
        setSelectedProducts((prev) => [...prev, product]);
        setProductSearch("");
        setSearchResults([]);
        setShowDropdown(false);
    };

    const removeProduct = (id: string) => {
        setSelectedProducts((prev) => prev.filter((p) => p.id !== id));
    };

    const getProductTitle = (product: Product) => {
        const loc =
            product.content?.["en-US"] ?? Object.values(product.content ?? {})[0];
        return loc?.title ?? product.slug;
    };

    // Drag-to-reorder (simple swap on dragover)
    const dragIndexRef = useRef<number | null>(null);

    const handleDragStart = (index: number) => {
        dragIndexRef.current = index;
    };

    const handleDrop = (index: number) => {
        const from = dragIndexRef.current;
        if (from === null || from === index) return;
        setSelectedProducts((prev) => {
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(index, 0, moved);
            return next;
        });
        dragIndexRef.current = null;
    };

    // ── Save products to API ──
    const saveProducts = useCallback(async (id: string) => {
        if (collectionType !== "manual") return;
        setSavingProducts(true);
        await fetch(`/api/shop/collections/${id}/products`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_ids: selectedProducts.map((p) => p.id) }),
        });
        setSavingProducts(false);
    }, [collectionType, selectedProducts]);

    // ── Load data on mount ──
    const loadCollection = useCallback(async () => {
        if (!collectionId) return;
        setLoading(true);
        try {
            const [colRes, prodRes] = await Promise.all([
                fetch(`/api/shop/collections/${collectionId}`),
                fetch(`/api/shop/collections/${collectionId}/products`),
            ]);
            const colJson = await colRes.json();
            if (colJson.ok && colJson.row) {
                const row: Collection = colJson.row;
                setSlug(row.slug);
                setIsActive(row.is_active);
                setCollectionType(row.collection_type);
                setImageUrl(row.image_url);
                setRules(row.rules ?? []);
                const merged: Record<string, LocaleContent> = {};
                for (const loc of SUPPORTED_LOCALES) {
                    merged[loc] = { ...emptyContent(), ...(row.content?.[loc] ?? {}) };
                }
                setContent(merged);
            }

            // Load selected products for manual collections
            const prodJson = await prodRes.json();
            if (prodJson.ok && Array.isArray(prodJson.product_ids) && prodJson.product_ids.length > 0) {
                // Fetch product details for each id
                const detailsRes = await fetch(
                    `/api/shop/products?ids=${prodJson.product_ids.join(",")}&limit=200`
                );
                const detailsJson = await detailsRes.json();
                const rows: Product[] = detailsJson.rows ?? detailsJson.data ?? [];
                // Preserve the order returned by the products endpoint
                const byId = Object.fromEntries(rows.map((p) => [p.id, p]));
                setSelectedProducts(
                    prodJson.product_ids
                        .map((id: string) => byId[id])
                        .filter(Boolean) as Product[]
                );
            }
        } finally {
            setLoading(false);
        }
    }, [collectionId]);

    useEffect(() => { loadCollection(); }, [loadCollection]);

    // ── Save ──
    const handleSave = async () => {
        setSaving(true);
        const payload = {
            slug,
            collection_type: collectionType,
            content,
            image_url: imageUrl || null,
            rules: collectionType === "auto" ? rules : [],
            is_active: isActive,
        };

        try {
            if (isNew) {
                const res = await fetch("/api/shop/collections", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (json.ok && json.row) {
                    await saveProducts(json.row.id);
                    router.push(to(`/settings/collections/${json.row.id}`));
                } else {
                    alert(json.error ?? "Failed to create collection.");
                }
            } else {
                const res = await fetch(`/api/shop/collections/${collectionId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (json.ok) {
                    await saveProducts(collectionId!);
                    await loadCollection();
                } else {
                    alert(json.error ?? "Failed to save.");
                }
            }
        } finally {
            setSaving(false);
        }
    };

    // ── Render ──
    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button asChild variant="ghost" size="icon">
                        <Link href={to("/settings/collections")}>
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="flex items-center gap-2">
                            <Library className="h-5 w-5" />
                            {isNew ? "New Collection" : "Edit Collection"}
                        </h1>
                        {!isNew && (
                            <p className="text-sm text-muted-foreground mt-0.5">/{slug}</p>
                        )}
                    </div>
                </div>
                <Button size="sm" onClick={handleSave} disabled={saving || savingProducts}>
                    {saving || savingProducts ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="mr-2 h-4 w-4" />
                    )}
                    Save
                </Button>
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ── Left column ──────────────────────────────────────── */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Localised content */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Content</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Tabs
                                value={activeLocale}
                                onValueChange={(v) => setActiveLocale(v as Locale)}
                            >
                                <TabsList className="mb-4">
                                    <TabsTrigger value="en-US">English</TabsTrigger>
                                    <TabsTrigger value="zh-CN">中文</TabsTrigger>
                                </TabsList>

                                {SUPPORTED_LOCALES.map((loc) => (
                                    <TabsContent key={loc} value={loc} className="space-y-4 mt-0">
                                        <div className="space-y-1.5">
                                            <Label htmlFor={`title-${loc}`}>Title</Label>
                                            <Input
                                                id={`title-${loc}`}
                                                value={content[loc]?.title ?? ""}
                                                onChange={(e) => {
                                                    setContent((prev) => ({
                                                        ...prev,
                                                        [loc]: {
                                                            ...prev[loc],
                                                            title: e.target.value,
                                                        },
                                                    }));
                                                    if (loc === "en-US") {
                                                        // let auto-slug effect run
                                                    }
                                                }}
                                                placeholder={
                                                    loc === "en-US"
                                                        ? "e.g. Summer Pillows"
                                                        : "e.g. 夏季枕头"
                                                }
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor={`desc-${loc}`}>Description</Label>
                                            <Textarea
                                                id={`desc-${loc}`}
                                                value={content[loc]?.description ?? ""}
                                                onChange={(e) =>
                                                    setContent((prev) => ({
                                                        ...prev,
                                                        [loc]: {
                                                            ...prev[loc],
                                                            description: e.target.value,
                                                        },
                                                    }))
                                                }
                                                placeholder="Optional description for this collection"
                                                rows={3}
                                            />
                                        </div>
                                    </TabsContent>
                                ))}
                            </Tabs>
                        </CardContent>
                    </Card>

                    {/* Cover image */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Cover Image</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {imageUrl && (
                                <div className="relative w-full max-w-sm rounded-lg overflow-hidden border bg-muted aspect-video">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={imageUrl}
                                        alt="Collection cover"
                                        className="w-full h-full object-cover"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setImageUrl(null)}
                                        className="absolute top-2 right-2 rounded-full bg-background/80 p-1 hover:bg-background border text-destructive"
                                        title="Remove image"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )}
                            <div className="flex gap-2 items-center">
                                <Input
                                    value={imageUrl ?? ""}
                                    onChange={(e) => setImageUrl(e.target.value || null)}
                                    placeholder="https://... or leave blank"
                                    className="flex-1"
                                />
                                <ImagePicker onSelect={(url) => setImageUrl(url)} />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Manual products section */}
                    {collectionType === "manual" && (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>Products</CardTitle>
                                    <Badge variant="outline">
                                        {selectedProducts.length} product
                                        {selectedProducts.length !== 1 ? "s" : ""}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Search */}
                                <div className="relative" ref={searchRef}>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                        <Input
                                            value={productSearch}
                                            onChange={(e) =>
                                                handleProductSearchChange(e.target.value)
                                            }
                                            onFocus={() => {
                                                if (searchResults.length > 0)
                                                    setShowDropdown(true);
                                            }}
                                            placeholder="Search products to add..."
                                            className="pl-9"
                                        />
                                        {searching && (
                                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                                        )}
                                    </div>

                                    {/* Dropdown */}
                                    {showDropdown && searchResults.length > 0 && (
                                        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md overflow-hidden">
                                            {searchResults.map((product) => (
                                                <button
                                                    key={product.id}
                                                    type="button"
                                                    className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        addProduct(product);
                                                    }}
                                                >
                                                    <div className="h-8 w-8 rounded border bg-muted overflow-hidden shrink-0">
                                                        {product.images?.[0]?.url ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img
                                                                src={product.images[0].url}
                                                                alt=""
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : null}
                                                    </div>
                                                    <span className="truncate">
                                                        {getProductTitle(product)}
                                                    </span>
                                                    <Plus className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Selected product list */}
                                {selectedProducts.length > 0 ? (
                                    <ul className="space-y-1 rounded-lg border divide-y overflow-hidden">
                                        {selectedProducts.map((product, index) => (
                                            <li
                                                key={product.id}
                                                draggable
                                                onDragStart={() => handleDragStart(index)}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={() => handleDrop(index)}
                                                className="flex items-center gap-3 px-3 py-2 bg-background hover:bg-muted/40 transition-colors cursor-grab active:cursor-grabbing"
                                            >
                                                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <div className="h-8 w-8 rounded border bg-muted overflow-hidden shrink-0">
                                                    {product.images?.[0]?.url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={product.images[0].url}
                                                            alt=""
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : null}
                                                </div>
                                                <span className="flex-1 text-sm truncate">
                                                    {getProductTitle(product)}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                                    onClick={() => removeProduct(product.id)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                                        No products added yet. Search above to add products.
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Auto-collection rules */}
                    {collectionType === "auto" && (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>Conditions</CardTitle>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={addRule}
                                    >
                                        <Plus className="mr-2 h-4 w-4" /> Add Condition
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {rules.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                                        No conditions yet. Add one to automatically match products.
                                    </p>
                                ) : (
                                    rules.map((rule, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center gap-2 flex-wrap sm:flex-nowrap"
                                        >
                                            <Select
                                                value={rule.field}
                                                onValueChange={(v) =>
                                                    updateRule(index, { field: v })
                                                }
                                            >
                                                <SelectTrigger className="w-full sm:w-44">
                                                    <SelectValue placeholder="Field" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {RULE_FIELDS.map((f) => (
                                                        <SelectItem key={f.value} value={f.value}>
                                                            {f.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            <Select
                                                value={rule.condition}
                                                onValueChange={(v) =>
                                                    updateRule(index, { condition: v })
                                                }
                                            >
                                                <SelectTrigger className="w-full sm:w-40">
                                                    <SelectValue placeholder="Condition" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {RULE_CONDITIONS.map((c) => (
                                                        <SelectItem key={c.value} value={c.value}>
                                                            {c.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            <Input
                                                value={rule.value}
                                                onChange={(e) =>
                                                    updateRule(index, { value: e.target.value })
                                                }
                                                placeholder="Value"
                                                className="flex-1 min-w-0"
                                            />

                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                                onClick={() => removeRule(index)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* ── Right column ─────────────────────────────────────── */}
                <div className="space-y-6">
                    {/* Status card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Status</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="is-active">Active</Label>
                                <Switch
                                    id="is-active"
                                    checked={isActive}
                                    onCheckedChange={setIsActive}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="collection-type">Collection Type</Label>
                                {isNew ? (
                                    <Select
                                        value={collectionType}
                                        onValueChange={(v) =>
                                            setCollectionType(v as "manual" | "auto")
                                        }
                                    >
                                        <SelectTrigger id="collection-type">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="manual">Manual</SelectItem>
                                            <SelectItem value="auto">Automatic</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <div className="flex items-center h-9 px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground">
                                        <Badge
                                            variant={
                                                collectionType === "manual" ? "default" : "secondary"
                                            }
                                        >
                                            {collectionType}
                                        </Badge>
                                        <span className="ml-2 text-xs">
                                            (cannot change after creation)
                                        </span>
                                    </div>
                                )}
                            </div>

                            <Button
                                className="w-full"
                                onClick={handleSave}
                                disabled={saving || savingProducts}
                            >
                                {saving || savingProducts ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Save Collection
                            </Button>
                        </CardContent>
                    </Card>

                    {/* SEO card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>SEO</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="slug">Slug</Label>
                                <Input
                                    id="slug"
                                    value={slug}
                                    onChange={(e) => {
                                        slugTouchedRef.current = true;
                                        setSlug(e.target.value);
                                    }}
                                    placeholder="my-collection"
                                />
                                <p className="text-xs text-muted-foreground">
                                    URL: /collections/{slug || "..."}
                                </p>
                                {activeContent.title && (
                                    <button
                                        type="button"
                                        className="text-xs text-primary hover:underline"
                                        onClick={() => {
                                            setSlug(toSlug(activeContent.title));
                                            slugTouchedRef.current = false;
                                        }}
                                    >
                                        Auto-generate from title
                                    </button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
