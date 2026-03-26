"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, GripVertical, ChevronRight, ChevronDown, Pencil, Trash2, FolderTree, Loader2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/components/ui/select";
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { ImagePicker } from "@/components/ui/image-picker";
import type { ProductCategory } from "@/lib/types/ecommerce";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CategoryWithMeta extends ProductCategory {
    product_count?: number;
    children?: CategoryWithMeta[];
}

interface LocaleContent {
    name: string;
    description: string;
}

interface FormState {
    content: { "en-US": LocaleContent; "zh-CN": LocaleContent };
    slug: string;
    image_url: string;
    parent_id: string;
    is_active: boolean;
}

const EMPTY_FORM: FormState = {
    content: {
        "en-US": { name: "", description: "" },
        "zh-CN": { name: "", description: "" },
    },
    slug: "",
    image_url: "",
    parent_id: "",
    is_active: true,
};

const LOCALES: { key: "en-US" | "zh-CN"; label: string }[] = [
    { key: "en-US", label: "English" },
    { key: "zh-CN", label: "中文" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(str: string): string {
    return str
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function getDisplayName(cat: CategoryWithMeta): string {
    const loc =
        cat.content?.["en-US"] ??
        (Object.values(cat.content ?? {}) as LocaleContent[])[0];
    return loc?.name || cat.slug || cat.id;
}

/** Collect all descendant IDs (including self) to prevent cycle in parent select */
function getDescendantIds(cat: CategoryWithMeta): Set<string> {
    const ids = new Set<string>([cat.id]);
    function walk(c: CategoryWithMeta) {
        for (const child of c.children ?? []) {
            ids.add(child.id);
            walk(child);
        }
    }
    walk(cat);
    return ids;
}

/** Flatten a tree into a list with depth for the parent selector */
function flattenTree(
    nodes: CategoryWithMeta[],
    depth = 0
): { cat: CategoryWithMeta; depth: number }[] {
    const result: { cat: CategoryWithMeta; depth: number }[] = [];
    for (const node of nodes) {
        result.push({ cat: node, depth });
        result.push(...flattenTree(node.children ?? [], depth + 1));
    }
    return result;
}

// ─── CategoryRow Component ───────────────────────────────────────────────────

interface CategoryRowProps {
    category: CategoryWithMeta;
    depth: number;
    expandedIds: Set<string>;
    onToggleExpand: (id: string) => void;
    onEdit: (cat: CategoryWithMeta) => void;
    onDelete: (cat: CategoryWithMeta) => void;
}

function CategoryRow({
    category,
    depth,
    expandedIds,
    onToggleExpand,
    onEdit,
    onDelete,
}: CategoryRowProps) {
    const hasChildren = (category.children?.length ?? 0) > 0;
    const isExpanded = expandedIds.has(category.id);
    const indentClass =
        depth === 1 ? "pl-6" : depth === 2 ? "pl-12" : depth >= 3 ? "pl-[4.5rem]" : "";

    return (
        <>
            <tr className="hover:bg-muted/30 transition-colors border-b last:border-b-0">
                <td className={`px-3 py-2.5 ${indentClass}`}>
                    <div className="flex items-center gap-1.5">
                        <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 cursor-grab" />
                        {hasChildren ? (
                            <button
                                type="button"
                                onClick={() => onToggleExpand(category.id)}
                                className="p-0.5 rounded hover:bg-muted transition-colors shrink-0"
                                aria-label={isExpanded ? "Collapse" : "Expand"}
                            >
                                {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                            </button>
                        ) : (
                            <span className="w-5 shrink-0" />
                        )}
                        {/* Thumbnail */}
                        <div className="h-8 w-8 rounded border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                            {category.image_url ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={category.image_url}
                                    alt={getDisplayName(category)}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
                            )}
                        </div>
                        <span className="font-medium text-sm truncate max-w-[200px]">
                            {getDisplayName(category)}
                        </span>
                    </div>
                </td>
                <td className="px-3 py-2.5 text-sm text-muted-foreground hidden sm:table-cell">
                    {category.slug}
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">
                        {category.product_count ?? 0}
                    </span>
                </td>
                <td className="px-3 py-2.5 hidden sm:table-cell">
                    {category.is_active ? (
                        <Badge variant="secondary" className="bg-green-500/15 text-green-700 dark:text-green-400 border-0">
                            Active
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground border-0">
                            Inactive
                        </Badge>
                    )}
                </td>
                <td className="px-3 py-2.5 text-right space-x-1 whitespace-nowrap">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onEdit(category)}
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onDelete(category)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </td>
            </tr>
            {isExpanded &&
                (category.children ?? []).map((child) => (
                    <CategoryRow
                        key={child.id}
                        category={child}
                        depth={depth + 1}
                        expandedIds={expandedIds}
                        onToggleExpand={onToggleExpand}
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                ))}
        </>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsCategoriesPage() {
    const [categories, setCategories] = useState<CategoryWithMeta[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Sheet state
    const [sheetOpen, setSheetOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<CategoryWithMeta | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

    // Delete dialog state
    const [deleteTarget, setDeleteTarget] = useState<CategoryWithMeta | null>(null);
    const [deleting, setDeleting] = useState(false);

    // ── Data fetching ──────────────────────────────────────────────────────

    const fetchCategories = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/shop/categories");
            const json = await res.json();
            const tree: CategoryWithMeta[] = json.rows ?? json.categories ?? [];
            setCategories(tree);
            // Auto-expand top-level categories that have children
            const topIds = tree
                .filter((c) => (c.children?.length ?? 0) > 0)
                .map((c) => c.id);
            setExpandedIds(new Set(topIds));
        } catch (err) {
            console.error("Failed to fetch categories", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    // ── Expand / collapse ──────────────────────────────────────────────────

    const toggleExpand = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // ── Sheet helpers ──────────────────────────────────────────────────────

    const openCreate = () => {
        setEditingCategory(null);
        setForm(EMPTY_FORM);
        setSlugManuallyEdited(false);
        setSheetOpen(true);
    };

    const openEdit = (cat: CategoryWithMeta) => {
        setEditingCategory(cat);
        setForm({
            content: {
                "en-US": {
                    name: cat.content?.["en-US"]?.name ?? "",
                    description: cat.content?.["en-US"]?.description ?? "",
                },
                "zh-CN": {
                    name: cat.content?.["zh-CN"]?.name ?? "",
                    description: cat.content?.["zh-CN"]?.description ?? "",
                },
            },
            slug: cat.slug ?? "",
            image_url: cat.image_url ?? "",
            parent_id: cat.parent_id ?? "",
            is_active: cat.is_active ?? true,
        });
        setSlugManuallyEdited(true); // On edit, don't auto-regenerate slug
        setSheetOpen(true);
    };

    const updateLocaleField = (
        locale: "en-US" | "zh-CN",
        field: "name" | "description",
        value: string
    ) => {
        setForm((prev) => {
            const next = {
                ...prev,
                content: {
                    ...prev.content,
                    [locale]: { ...prev.content[locale], [field]: value },
                },
            };
            // Auto-generate slug from English name on create
            if (!editingCategory && !slugManuallyEdited && locale === "en-US" && field === "name") {
                next.slug = slugify(value);
            }
            return next;
        });
    };

    const handleSlugChange = (value: string) => {
        setSlugManuallyEdited(true);
        setForm((prev) => ({ ...prev, slug: value }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                content: form.content,
                slug: form.slug,
                image_url: form.image_url || null,
                parent_id: form.parent_id || null,
                is_active: form.is_active,
            };

            if (editingCategory) {
                await fetch(`/api/shop/categories/${editingCategory.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                await fetch("/api/shop/categories", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }

            setSheetOpen(false);
            fetchCategories();
        } catch (err) {
            console.error("Failed to save category", err);
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ─────────────────────────────────────────────────────────────

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await fetch(`/api/shop/categories/${deleteTarget.id}`, {
                method: "DELETE",
            });
            setDeleteTarget(null);
            fetchCategories();
        } catch (err) {
            console.error("Failed to delete category", err);
        } finally {
            setDeleting(false);
        }
    };

    // ── Parent select options (exclude self + descendants) ─────────────────

    const flatCategories = flattenTree(categories);
    const excludedIds: Set<string> = editingCategory
        ? getDescendantIds(editingCategory)
        : new Set();

    const parentOptions = flatCategories.filter(
        ({ cat }) => !excludedIds.has(cat.id)
    );

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="flex items-center gap-2">
                        <FolderTree className="h-6 w-6 text-muted-foreground" />
                        Categories
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Organise your products into a hierarchy of categories.
                    </p>
                </div>
                <Button size="sm" onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Add Category
                </Button>
            </div>

            {/* Category tree */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : categories.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
                    No categories yet. Add your first category to get started.
                </div>
            ) : (
                <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/50">
                            <tr>
                                <th className="px-3 py-3 text-left font-medium">Name</th>
                                <th className="px-3 py-3 text-left font-medium hidden sm:table-cell">Slug</th>
                                <th className="px-3 py-3 text-left font-medium hidden md:table-cell">Products</th>
                                <th className="px-3 py-3 text-left font-medium hidden sm:table-cell">Status</th>
                                <th className="px-3 py-3 text-right font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map((cat) => (
                                <CategoryRow
                                    key={cat.id}
                                    category={cat}
                                    depth={0}
                                    expandedIds={expandedIds}
                                    onToggleExpand={toggleExpand}
                                    onEdit={openEdit}
                                    onDelete={setDeleteTarget}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Sheet: Create / Edit ──────────────────────────────────────── */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>
                            {editingCategory ? "Edit Category" : "Add Category"}
                        </SheetTitle>
                        <SheetDescription>
                            {editingCategory
                                ? "Update the details for this category."
                                : "Create a new product category."}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="mt-6 space-y-6">
                        {/* Locale tabs */}
                        <Tabs defaultValue="en-US">
                            <TabsList className="w-full">
                                {LOCALES.map(({ key, label }) => (
                                    <TabsTrigger key={key} value={key} className="flex-1">
                                        {label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>

                            {LOCALES.map(({ key }) => (
                                <TabsContent key={key} value={key} className="space-y-4 mt-4">
                                    <div className="space-y-2">
                                        <Label htmlFor={`name-${key}`}>Name</Label>
                                        <Input
                                            id={`name-${key}`}
                                            placeholder="Category name"
                                            value={form.content[key].name}
                                            onChange={(e) =>
                                                updateLocaleField(key, "name", e.target.value)
                                            }
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor={`desc-${key}`}>Description</Label>
                                        <Textarea
                                            id={`desc-${key}`}
                                            placeholder="Short description (optional)"
                                            rows={3}
                                            value={form.content[key].description}
                                            onChange={(e) =>
                                                updateLocaleField(key, "description", e.target.value)
                                            }
                                        />
                                    </div>
                                </TabsContent>
                            ))}
                        </Tabs>

                        {/* Slug */}
                        <div className="space-y-2">
                            <Label htmlFor="slug">Slug</Label>
                            <Input
                                id="slug"
                                placeholder="category-slug"
                                value={form.slug}
                                onChange={(e) => handleSlugChange(e.target.value)}
                            />
                        </div>

                        {/* Image */}
                        <div className="space-y-2">
                            <Label>Image</Label>
                            <div className="flex items-center gap-3">
                                <div className="h-16 w-16 rounded-lg border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                                    {form.image_url ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                            src={form.image_url}
                                            alt="Category"
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                                    )}
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <ImagePicker
                                        onSelect={(url) =>
                                            setForm((prev) => ({ ...prev, image_url: url }))
                                        }
                                    />
                                    {form.image_url && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive px-0 justify-start h-auto"
                                            onClick={() =>
                                                setForm((prev) => ({ ...prev, image_url: "" }))
                                            }
                                        >
                                            Remove image
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Parent category */}
                        <div className="space-y-2">
                            <Label>Parent Category</Label>
                            <Select
                                value={form.parent_id || "none"}
                                onValueChange={(v) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        parent_id: v === "none" ? "" : v,
                                    }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="None (top-level)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None (top-level)</SelectItem>
                                    {parentOptions.map(({ cat, depth }) => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                            {depth > 0
                                                ? `${"  ".repeat(depth)}↳ ${getDisplayName(cat)}`
                                                : getDisplayName(cat)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Active toggle */}
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div>
                                <Label htmlFor="is-active" className="text-sm font-medium">
                                    Active
                                </Label>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Inactive categories are hidden from the storefront.
                                </p>
                            </div>
                            <Switch
                                id="is-active"
                                checked={form.is_active}
                                onCheckedChange={(v) =>
                                    setForm((prev) => ({ ...prev, is_active: v }))
                                }
                            />
                        </div>

                        {/* Save */}
                        <Button
                            className="w-full"
                            onClick={handleSave}
                            disabled={saving || !form.content["en-US"].name.trim()}
                        >
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingCategory ? "Save Changes" : "Create Category"}
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>

            {/* ── Delete confirmation dialog ──────────────────────────────── */}
            <Dialog
                open={deleteTarget !== null}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Category</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete{" "}
                            <span className="font-medium text-foreground">
                                {deleteTarget ? getDisplayName(deleteTarget) : "this category"}
                            </span>
                            ?{" "}
                            {(deleteTarget?.children?.length ?? 0) > 0 && (
                                <span className="text-destructive">
                                    This category has sub-categories that may also be affected.{" "}
                                </span>
                            )}
                            This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setDeleteTarget(null)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            disabled={deleting}
                        >
                            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
