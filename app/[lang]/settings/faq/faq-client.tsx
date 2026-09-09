"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageFaqsPanel } from "@/components/settings/page-faqs-panel";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { sortableMove, type SortableDragEndEvent } from "@/lib/dnd/sortable-move";
import type { FaqItemContent, FaqLocalizedText } from "@/lib/faq/types";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";

export type CategoryRow = {
  id: string;
  key: string;
  labels: FaqLocalizedText;
  position: number;
  visible: boolean;
};

export type ItemRow = {
  id: string;
  category_id: string;
  slug: string;
  content: FaqItemContent;
  position: number;
  visible: boolean;
};

const LOCALES = ["en-US", "zh-CN"] as const;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function SortableCategoryRow({
  category,
  index,
  expanded,
  onToggleExpand,
  onToggleVisible,
  onDelete,
  onSave,
}: {
  category: CategoryRow;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleVisible: () => void;
  onDelete: () => void;
  onSave: (labels: FaqLocalizedText, key: string) => void;
}) {
  const { ref, isDragging, handleRef } = useSortable({ id: category.id, index });
  const [labels, setLabels] = useState(category.labels);
  const [key, setKey] = useState(category.key);

  useEffect(() => {
    setLabels(category.labels);
    setKey(category.key);
  }, [category]);

  return (
    <div
      ref={ref}
      className={`rounded-lg border bg-card ${isDragging ? "opacity-70 shadow-lg" : ""} ${!category.visible ? "opacity-60" : ""}`}
    >
      <Collapsible open={expanded} onOpenChange={onToggleExpand}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            ref={handleRef}
            className="cursor-grab min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleVisible}
            className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={category.visible ? "Hide category" : "Show category"}
          >
            {category.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {category.labels["en-US"] ?? category.key}
            </span>
            <span className="text-xs text-muted-foreground">{category.key}</span>
          </div>
          <button
            type="button"
            onClick={onDelete}
            className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-destructive"
            aria-label="Delete category"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <CollapsibleTrigger asChild>
            <button type="button" className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground">
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="space-y-3 border-t px-3 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Key</Label>
              <Input value={key} onChange={(e) => setKey(slugify(e.target.value))} />
            </div>
            <Tabs defaultValue="en-US">
              <TabsList>
                {LOCALES.map((loc) => (
                  <TabsTrigger key={loc} value={loc}>
                    {loc}
                  </TabsTrigger>
                ))}
              </TabsList>
              {LOCALES.map((loc) => (
                <TabsContent key={loc} value={loc} className="mt-2">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={labels[loc] ?? ""}
                    onChange={(e) => setLabels((prev) => ({ ...prev, [loc]: e.target.value }))}
                  />
                </TabsContent>
              ))}
            </Tabs>
            <Button size="sm" onClick={() => onSave(labels, key)}>
              Save category
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function ItemEditor({
  item,
  onSave,
  onDelete,
  onToggleVisible,
}: {
  item: ItemRow;
  onSave: (patch: Partial<ItemRow>) => void;
  onDelete: () => void;
  onToggleVisible: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(item.slug);
  const [content, setContent] = useState(item.content);

  useEffect(() => {
    setSlug(item.slug);
    setContent(item.content);
  }, [item]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`flex items-center gap-2 rounded-md border px-3 py-2 ${!item.visible ? "opacity-60" : ""}`}>
        <button
          type="button"
          onClick={onToggleVisible}
          className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {item.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <CollapsibleTrigger asChild>
          <button type="button" className="min-w-0 flex-1 text-left text-sm">
            {item.content["en-US"]?.question ?? item.slug}
          </button>
        </CollapsibleTrigger>
        <button
          type="button"
          onClick={onDelete}
          className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <CollapsibleTrigger asChild>
          <button type="button" className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground">
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="mt-2 space-y-3 rounded-md border bg-muted/20 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Slug (URL anchor)</Label>
            <Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} />
          </div>
          <Tabs defaultValue="en-US">
            <TabsList>
              {LOCALES.map((loc) => (
                <TabsTrigger key={loc} value={loc}>
                  {loc}
                </TabsTrigger>
              ))}
            </TabsList>
            {LOCALES.map((loc) => (
              <TabsContent key={loc} value={loc} className="mt-2 space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Question</Label>
                  <Input
                    value={content[loc]?.question ?? ""}
                    onChange={(e) =>
                      setContent((prev) => ({
                        ...prev,
                        [loc]: { ...prev[loc], question: e.target.value, answer: prev[loc]?.answer ?? "" },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Answer (markdown)</Label>
                  <Textarea
                    rows={5}
                    value={content[loc]?.answer ?? ""}
                    onChange={(e) =>
                      setContent((prev) => ({
                        ...prev,
                        [loc]: { question: prev[loc]?.question ?? "", answer: e.target.value },
                      }))
                    }
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>
          <Button
            size="sm"
            onClick={() => onSave({ slug, content })}
          >
            Save question
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The `/api/faq/categories` + `/api/faq/items` payloads the page mounts with. */
export type FaqInitialData = {
  categories: { ok: true; rows: CategoryRow[] };
  items: { ok: true; rows: ItemRow[] };
};

export default function SettingsFaqPage({ initialData }: { initialData?: FaqInitialData }) {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const faqPreviewHref = withLocale("/faq", locale);

  const [categories, setCategories] = useState<CategoryRow[]>(
    initialData?.categories.rows ?? [],
  );
  const [items, setItems] = useState<ItemRow[]>(initialData?.items.rows ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  // The server already loaded categories and items; every edit still reloads.
  const skipFirstFetch = useRef(initialData != null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, itemRes] = await Promise.all([
        fetch("/api/faq/categories"),
        fetch("/api/faq/items"),
      ]);
      const catJson = await catRes.json();
      const itemJson = await itemRes.json();
      setCategories(catJson.rows ?? []);
      setItems(itemJson.rows ?? []);
    } catch {
      toast.error("Failed to load FAQ data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    load();
  }, [load]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const cat of categories) map.set(cat.id, []);
    for (const item of items) {
      const list = map.get(item.category_id);
      if (list) list.push(item);
      else map.set(item.category_id, [item]);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [categories, items]);

  const saveCategory = async (id: string, labels: FaqLocalizedText, key: string) => {
    const res = await fetch(`/api/faq/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labels, key }),
    });
    if (!res.ok) {
      toast.error("Failed to save category");
      return;
    }
    const { row } = await res.json();
    setCategories((prev) => prev.map((c) => (c.id === id ? row : c)));
    toast.success("Category saved");
  };

  const toggleCategoryVisible = async (cat: CategoryRow) => {
    const visible = !cat.visible;
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, visible } : c)));
    const res = await fetch(`/api/faq/categories/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible }),
    });
    if (!res.ok) {
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? cat : c)));
      toast.error("Failed to update visibility");
    }
  };

  const deleteCategory = async (cat: CategoryRow) => {
    if (!confirm(`Delete category "${cat.labels["en-US"]}"?`)) return;
    const res = await fetch(`/api/faq/categories/${cat.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Failed to delete category");
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    toast.success("Category deleted");
  };

  const addCategory = async (key: string, labels: FaqLocalizedText) => {
    const res = await fetch("/api/faq/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, labels }),
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Failed to add category");
      return;
    }
    const { row } = await res.json();
    setCategories((prev) => [...prev, row]);
    toast.success("Category added");
  };

  const saveItem = async (id: string, patch: Partial<ItemRow>) => {
    const res = await fetch(`/api/faq/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error("Failed to save question");
      return;
    }
    const { row } = await res.json();
    setItems((prev) => prev.map((i) => (i.id === id ? row : i)));
    toast.success("Question saved");
  };

  const toggleItemVisible = async (item: ItemRow) => {
    const visible = !item.visible;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, visible } : i)));
    const res = await fetch(`/api/faq/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible }),
    });
    if (!res.ok) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      toast.error("Failed to update visibility");
    }
  };

  const deleteItem = async (item: ItemRow) => {
    if (!confirm("Delete this question?")) return;
    const res = await fetch(`/api/faq/items/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete question");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    toast.success("Question deleted");
  };

  const addItem = async (categoryId: string) => {
    const slug = `new-question-${Date.now()}`;
    const content: FaqItemContent = {
      "en-US": { question: "New question", answer: "Answer here." },
      "zh-CN": { question: "新问题", answer: "在此填写答案。" },
    };
    const res = await fetch("/api/faq/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId, slug, content }),
    });
    if (!res.ok) {
      toast.error("Failed to add question");
      return;
    }
    const { row } = await res.json();
    setItems((prev) => [...prev, row]);
    toast.success("Question added");
  };

  const handleCategoryDragEnd = async (event: SortableDragEndEvent) => {
    const reordered = sortableMove(categories, event, (c) => c.id);
    if (!reordered) return;
    setCategories(reordered);

    const res = await fetch("/api/faq/categories/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered.map((c) => c.id) }),
    });
    if (!res.ok) {
      load();
      toast.error("Failed to reorder categories");
    }
  };

  if (loading) {
    return (
      <div className="space-y-8" data-settings-faq>
        <div>
          <h1>FAQ Management</h1>
          <p className="mt-1 text-muted-foreground">
            Manage Global FAQ and page-local FAQ embeds from one place.
          </p>
        </div>
        <Tabs defaultValue="global" className="space-y-6">
          <TabsList data-settings-faq-tabs>
            <TabsTrigger value="global">Global FAQ</TabsTrigger>
            <TabsTrigger value="page">Page FAQs</TabsTrigger>
          </TabsList>
          <TabsContent value="global">
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </TabsContent>
          <TabsContent value="page">
            <PageFaqsPanel locale={locale} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-8" data-settings-faq>
      <div>
        <h1>FAQ Management</h1>
        <p className="mt-1 text-muted-foreground">
          Manage Global FAQ and page-local FAQ embeds from one place.
        </p>
      </div>

      <Tabs defaultValue="global" className="space-y-6">
        <TabsList data-settings-faq-tabs>
          <TabsTrigger value="global">Global FAQ</TabsTrigger>
          <TabsTrigger value="page">Page FAQs</TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-8">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Categories and questions on the public FAQ page.
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href={faqPreviewHref} target="_blank">
                <ExternalLink className="mr-2 h-4 w-4" />
                View FAQ
              </Link>
            </Button>
          </div>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Categories</h2>
              <AddCategoryDialog onAdd={addCategory} />
            </div>
            <DragDropProvider onDragEnd={handleCategoryDragEnd}>
              <div className="space-y-2">
                {categories.map((cat, index) => (
                  <SortableCategoryRow
                    key={cat.id}
                    category={cat}
                    index={index}
                    expanded={expandedCatId === cat.id}
                    onToggleExpand={() =>
                      setExpandedCatId((prev) => (prev === cat.id ? null : cat.id))
                    }
                    onToggleVisible={() => toggleCategoryVisible(cat)}
                    onDelete={() => deleteCategory(cat)}
                    onSave={(labels, key) => saveCategory(cat.id, labels, key)}
                  />
                ))}
              </div>
            </DragDropProvider>
          </section>

          <section className="space-y-6">
            <h2 className="text-lg font-semibold">Questions &amp; Answers</h2>
            {categories.map((cat) => (
              <div key={cat.id} className="space-y-2 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{cat.labels["en-US"] ?? cat.key}</h3>
                  <Button size="sm" variant="outline" onClick={() => addItem(cat.id)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add question
                  </Button>
                </div>
                <div className="space-y-2">
                  {(itemsByCategory.get(cat.id) ?? []).map((item) => (
                    <ItemEditor
                      key={item.id}
                      item={item}
                      onSave={(patch) => saveItem(item.id, patch)}
                      onDelete={() => deleteItem(item)}
                      onToggleVisible={() => toggleItemVisible(item)}
                    />
                  ))}
                  {(itemsByCategory.get(cat.id) ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">No questions in this category.</p>
                  )}
                </div>
              </div>
            ))}
          </section>
        </TabsContent>

        <TabsContent value="page">
          <PageFaqsPanel locale={locale} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AddCategoryDialog({
  onAdd,
}: {
  onAdd: (key: string, labels: FaqLocalizedText) => void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [enLabel, setEnLabel] = useState("");
  const [zhLabel, setZhLabel] = useState("");

  const handleCreate = () => {
    if (!key || !enLabel || !zhLabel) return;
    onAdd(key, { "en-US": enLabel, "zh-CN": zhLabel });
    setOpen(false);
    setKey("");
    setEnLabel("");
    setZhLabel("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add category
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add FAQ category</DialogTitle>
          <DialogDescription>Create a new section for grouping questions.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Key</Label>
            <Input
              value={key}
              onChange={(e) => setKey(slugify(e.target.value))}
              placeholder="e.g. care-maintenance"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Label (en-US)</Label>
            <Input value={enLabel} onChange={(e) => setEnLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Label (zh-CN)</Label>
            <Input value={zhLabel} onChange={(e) => setZhLabel(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleCreate} disabled={!key || !enLabel || !zhLabel}>
            Create category
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
