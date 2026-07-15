"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { FaqItemContent } from "@/lib/faq/types";
import { withLocale } from "@/lib/i18n/routing";
import type { Locale } from "@/lib/i18n/locales";
import {
  FIXED_SURFACE_OPTIONS,
  pageFaqPreviewPath,
  productSurfaceKey,
} from "@/lib/page-faq";

type PageItem = {
  id: string;
  set_id: string;
  slug: string;
  content: FaqItemContent;
  position: number;
  visible: boolean;
};

type PageSet = {
  id: string;
  surface_key: string;
  titles: { "en-US"?: string; "zh-CN"?: string };
  visible: boolean;
  items: PageItem[];
};

type ProductOption = { id: string; slug: string; title: string };

const LOCALES = ["en-US", "zh-CN"] as const;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function productTitle(row: {
  id: string;
  slug: string;
  content?: Record<string, { title?: string } | undefined>;
}): ProductOption {
  return {
    id: row.id,
    slug: row.slug,
    title: row.content?.["en-US"]?.title ?? row.slug,
  };
}

/** Presentational empty / chrome markers for self-check + Settings. */
export function PageFaqsEmptyState({ surfaceKey }: { surfaceKey: string }) {
  return (
    <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground" data-page-faq-empty>
      No questions on this surface yet. Add one to show a Page FAQ embed on{" "}
      <span className="font-medium text-foreground">{surfaceKey}</span>.
    </p>
  );
}

export function PageFaqsPanel({ locale }: { locale: Locale }) {
  const [surfaceKey, setSurfaceKey] = useState("home");
  const [set, setSet] = useState<PageSet | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [productPick, setProductPick] = useState<string>("");

  const selectedProduct = products.find((p) => productSurfaceKey(p.id) === surfaceKey);
  const previewPath = pageFaqPreviewPath(surfaceKey, selectedProduct?.slug);
  const previewHref = previewPath ? withLocale(previewPath, locale) : null;

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/shop/products?include_custom=true&limit=100&status=active");
      const json = await res.json();
      setProducts((json.rows ?? []).map(productTitle));
    } catch {
      /* picker degrades to fixed surfaces only */
    }
  }, []);

  const loadSet = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const ensure = await fetch("/api/page-faq/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface_key: key }),
      });
      if (!ensure.ok) {
        toast.error("Failed to load Page FAQ set");
        setSet(null);
        return;
      }
      const res = await fetch(`/api/page-faq/sets?surface_key=${encodeURIComponent(key)}`);
      const json = await res.json();
      setSet(json.set ?? null);
    } catch {
      toast.error("Failed to load Page FAQ set");
      setSet(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    loadSet(surfaceKey);
  }, [surfaceKey, loadSet]);

  const selectFixed = (key: string) => {
    setProductPick("");
    setSurfaceKey(key);
  };

  const selectProduct = (productId: string) => {
    setProductPick(productId);
    setSurfaceKey(productSurfaceKey(productId));
  };

  const addItem = async () => {
    if (!set) return;
    const slug = `new-question-${Date.now()}`;
    const content: FaqItemContent = {
      "en-US": { question: "New question", answer: "Answer here." },
      "zh-CN": { question: "新问题", answer: "在此填写答案。" },
    };
    const res = await fetch("/api/page-faq/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ set_id: set.id, slug, content }),
    });
    if (!res.ok) {
      toast.error("Failed to add question");
      return;
    }
    toast.success("Question added");
    loadSet(surfaceKey);
  };

  const saveItem = async (id: string, patch: Partial<PageItem>) => {
    const res = await fetch(`/api/page-faq/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error("Failed to save question");
      return;
    }
    const { row } = await res.json();
    setSet((prev) =>
      prev
        ? { ...prev, items: prev.items.map((i) => (i.id === id ? { ...i, ...row } : i)) }
        : prev
    );
    toast.success("Question saved");
  };

  const toggleVisible = async (item: PageItem) => {
    const visible = !item.visible;
    setSet((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) => (i.id === item.id ? { ...i, visible } : i)),
          }
        : prev
    );
    const res = await fetch(`/api/page-faq/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible }),
    });
    if (!res.ok) {
      setSet((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((i) => (i.id === item.id ? item : i)),
            }
          : prev
      );
      toast.error("Failed to update visibility");
    }
  };

  const deleteItem = async (item: PageItem) => {
    if (!confirm("Delete this question?")) return;
    const res = await fetch(`/api/page-faq/items/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete question");
      return;
    }
    setSet((prev) =>
      prev ? { ...prev, items: prev.items.filter((i) => i.id !== item.id) } : prev
    );
    toast.success("Question deleted");
  };

  const moveItem = async (index: number, dir: -1 | 1) => {
    if (!set) return;
    const next = index + dir;
    if (next < 0 || next >= set.items.length) return;
    const order = set.items.map((i) => i.id);
    const [moved] = order.splice(index, 1);
    order.splice(next, 0, moved);
    const optimistic = [...set.items];
    const [row] = optimistic.splice(index, 1);
    optimistic.splice(next, 0, row);
    setSet({ ...set, items: optimistic });

    const res = await fetch("/api/page-faq/items/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ set_id: set.id, order }),
    });
    if (!res.ok) {
      loadSet(surfaceKey);
      toast.error("Failed to reorder");
    }
  };

  return (
    <div className="space-y-6" data-page-faqs-panel>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Label className="text-xs">FAQ surface</Label>
          <div className="flex flex-wrap gap-2">
            {FIXED_SURFACE_OPTIONS.map((opt) => (
              <Button
                key={opt.key}
                size="sm"
                variant={surfaceKey === opt.key ? "default" : "outline"}
                onClick={() => selectFixed(opt.key)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <div className="flex max-w-md items-center gap-2">
            <Select value={productPick || undefined} onValueChange={selectProduct}>
              <SelectTrigger className="w-full sm:w-[280px]" data-page-faq-product-picker>
                <SelectValue placeholder="Or pick a product…" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title} ({p.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Surface key: <code className="rounded bg-muted px-1">{surfaceKey}</code>
          </p>
        </div>
        {previewHref && (
          <Button variant="outline" size="sm" asChild>
            <Link href={previewHref} target="_blank" data-page-faq-preview>
              <ExternalLink className="mr-2 h-4 w-4" />
              Preview page
            </Link>
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {set?.titles?.["en-US"] ?? "Page FAQs"}
            </h2>
            <Button size="sm" variant="outline" onClick={addItem}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add question
            </Button>
          </div>

          {(set?.items.length ?? 0) === 0 ? (
            <PageFaqsEmptyState surfaceKey={surfaceKey} />
          ) : (
            <div className="space-y-2">
              {set!.items.map((item, index) => (
                <PageItemEditor
                  key={item.id}
                  item={item}
                  canUp={index > 0}
                  canDown={index < set!.items.length - 1}
                  onMove={(dir) => moveItem(index, dir)}
                  onSave={(patch) => saveItem(item.id, patch)}
                  onDelete={() => deleteItem(item)}
                  onToggleVisible={() => toggleVisible(item)}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function PageItemEditor({
  item,
  canUp,
  canDown,
  onMove,
  onSave,
  onDelete,
  onToggleVisible,
}: {
  item: PageItem;
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onSave: (patch: Partial<PageItem>) => void;
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
      <div
        className={`flex items-center gap-2 rounded-md border px-3 py-2 ${!item.visible ? "opacity-60" : ""}`}
      >
        <div className="flex flex-col">
          <button
            type="button"
            disabled={!canUp}
            onClick={() => onMove(-1)}
            className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Move up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={!canDown}
            onClick={() => onMove(1)}
            className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Move down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={onToggleVisible}
          className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={item.visible ? "Hide question" : "Show question"}
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
          aria-label="Delete question"
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
            <Label className="text-xs">Slug</Label>
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
                        [loc]: {
                          question: e.target.value,
                          answer: prev[loc]?.answer ?? "",
                        },
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
                        [loc]: {
                          question: prev[loc]?.question ?? "",
                          answer: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>
          <Button size="sm" onClick={() => onSave({ slug, content })}>
            Save question
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
