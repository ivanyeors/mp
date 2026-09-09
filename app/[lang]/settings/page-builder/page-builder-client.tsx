"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SectionEditor } from "@/components/settings/page-builder/section-editor";
import {
  GripVertical,
  Eye,
  EyeOff,
  ChevronDown,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  Undo2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import type { LandingSection } from "@/lib/types/landing-sections";
import {
  describePending,
  type PendingSummary,
} from "@/lib/page-builder/draft";
import { CUSTOM_SECTION_TEMPLATES } from "@/lib/types/landing-sections";

const SECTION_TYPE_LABELS: Record<string, string> = {
  hero: "Hero",
  text_image: "Text + Image",
  marquee: "Marquee",
  stories: "Testimonials",
  pick_your_mpillow: "Pick Your Mpillow",
  neck_pains: "Neck Pains",
  why_choose_highlights: "Why Choose",
  product_card: "Product Card",
  credibility: "Credibility",
  video_embed: "Video Embed",
  founder_note: "Founder Note",
  custom_text_image: "Custom: Text + Image",
  custom_full_width_image: "Custom: Full-Width Image",
  custom_video: "Custom: Video",
  custom_rich_text: "Custom: Rich Text",
  featured_products: "Featured Products",
  shop_cta: "Shop CTA Banner",
  faq: "Page FAQs",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- Sortable section row ---

function SortableSectionRow({
  section,
  index,
  expandedId,
  onToggleExpand,
  onToggleVisibility,
  onDelete,
  onSectionUpdated,
}: {
  section: LandingSection;
  index: number;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onToggleVisibility: (section: LandingSection) => void;
  onDelete: (section: LandingSection) => void;
  onSectionUpdated: (section: LandingSection) => void;
}) {
  const { ref, isDragging, handleRef } = useSortable({
    id: section.id,
    index,
  });

  const isExpanded = expandedId === section.id;
  const isCustom = section.section_type.startsWith("custom_");
  const label =
    SECTION_TYPE_LABELS[section.section_type] ?? section.section_type;

  return (
    <div
      ref={ref}
      className={`rounded-lg border bg-card transition-shadow ${
        isDragging ? "shadow-lg opacity-70 z-50" : ""
      } ${!section.visible ? "opacity-60" : ""}`}
    >
      <Collapsible open={isExpanded} onOpenChange={() => onToggleExpand(section.id)}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Drag handle */}
          <button
            ref={handleRef}
            className="cursor-grab touch-none min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          {/* Visibility toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(section);
            }}
            className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={section.visible ? "Hide section" : "Show section"}
          >
            {section.visible ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </button>

          {/* Section name */}
          <div className="flex-1 min-w-0">
            <span className="font-medium text-sm truncate block">
              {section.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          </div>

          {/* Type badge */}
          <Badge variant="outline" className="text-xs shrink-0">
            {label}
          </Badge>

          {/* Delete button (custom sections only) */}
          {isCustom && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(section);
              }}
              className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-destructive"
              aria-label="Delete section"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}

          {/* Expand toggle */}
          <CollapsibleTrigger asChild>
            <button className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground">
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="px-3 pb-3">
            <SectionEditor
              section={section}
              onSave={(updated) => {
                onSectionUpdated(updated);
                onToggleExpand(section.id);
              }}
              onCancel={() => onToggleExpand(section.id)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// --- Add Section Dialog ---

function AddSectionDialog({
  onAdd,
}: {
  onAdd: (type: string, slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [slug, setSlug] = useState("");

  const handleCreate = () => {
    if (!selectedType || !slug) return;
    onAdd(selectedType, slug);
    setOpen(false);
    setSelectedType(null);
    setSlug("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Section
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Section</DialogTitle>
          <DialogDescription>
            Choose a template and give your section a unique name.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-2">
            {CUSTOM_SECTION_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.type}
                onClick={() => {
                  setSelectedType(tmpl.type);
                  if (!slug) setSlug(slugify(tmpl.label));
                }}
                className={`rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent ${
                  selectedType === tmpl.type
                    ? "border-primary bg-primary/5"
                    : ""
                }`}
              >
                <div className="font-medium">{tmpl.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {tmpl.description}
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Section Slug</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder="e.g. my-new-section"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and dashes only.
            </p>
          </div>

          <Button
            onClick={handleCreate}
            disabled={!selectedType || !slug}
            className="w-full"
          >
            Create Section
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Publish bar ---

const EMPTY_PENDING: PendingSummary = {
  total: 0,
  content: 0,
  position: 0,
  visibility: 0,
  removal: 0,
  slugs: [],
};

/**
 * Draft state and the one action that reaches shoppers.
 *
 * Every edit lands in a Section draft; nothing is live until Publish. Discard is the
 * mirror — it clears pending edits and leaves published content untouched.
 */
function PublishBar({
  pending,
  onPublished,
  onDiscarded,
}: {
  pending: PendingSummary;
  onPublished: () => void;
  onDiscarded: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = pending.total > 0;

  const run = async (method: "POST" | "DELETE") => {
    setBusy(true);
    try {
      const res = await fetch("/api/landing-sections/publish", { method });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Request failed");
      if (method === "POST") {
        toast.success("Published to the live site");
        onPublished();
      } else {
        toast.success("Draft discarded");
        onDiscarded();
      }
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const parts = [
    pending.content > 0 ? `${pending.content} edited` : null,
    pending.position > 0 ? `${pending.position} moved` : null,
    pending.visibility > 0 ? `${pending.visibility} shown/hidden` : null,
    pending.removal > 0 ? `${pending.removal} removed` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
          dirty ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground"
        }`}
        data-page-builder-draft-state=""
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dirty ? "bg-amber-500" : "bg-muted-foreground/50"}`} />
        {describePending(pending)}
      </span>

      <Button
        variant="ghost"
        size="sm"
        disabled={!dirty || busy}
        onClick={() => run("DELETE")}
      >
        <Undo2 className="mr-1.5 h-3.5 w-3.5" />
        Discard
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger asChild>
          <Button size="sm" disabled={!dirty || busy}>
            <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
            Publish
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish to the live site?</DialogTitle>
            <DialogDescription>
              {parts.length > 0
                ? `${parts.join(", ")}. This is what shoppers will see.`
                : "This is what shoppers will see."}
            </DialogDescription>
          </DialogHeader>
          {pending.slugs.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
              {pending.slugs.map((slug) => (
                <li key={slug} className="text-muted-foreground">
                  {slug}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => run("POST")} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Publish
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Main Page Builder ---

/** The `/api/landing-sections` payload the builder mounts with. */
export type PageBuilderInitialData = {
  ok: true;
  sections: LandingSection[];
  pending?: PendingSummary;
};

export default function PageBuilderPage({
  initialData,
}: {
  initialData?: PageBuilderInitialData;
}) {
  const [sections, setSections] = useState<LandingSection[]>(initialData?.sections ?? []);
  const [pending, setPending] = useState<PendingSummary>(initialData?.pending ?? EMPTY_PENDING);
  const [loading, setLoading] = useState(!initialData);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // The server already loaded the sections; every later change still refetches.
  const skipFirstFetch = useRef(initialData != null);

  const loadSections = useCallback(async () => {
    try {
      const res = await fetch("/api/landing-sections");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setSections(data.sections);
      setPending(data.pending ?? EMPTY_PENDING);
    } catch {
      toast.error("Failed to load sections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    loadSections();
  }, [loadSections]);

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleToggleVisibility = async (section: LandingSection) => {
    const newVisible = !section.visible;
    // Optimistic update
    setSections((prev) =>
      prev.map((s) => (s.id === section.id ? { ...s, visible: newVisible } : s))
    );

    try {
      const res = await fetch(`/api/landing-sections/${section.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: newVisible }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(newVisible ? "Section shown" : "Section hidden");
      loadSections();
    } catch {
      // Revert
      setSections((prev) =>
        prev.map((s) =>
          s.id === section.id ? { ...s, visible: !newVisible } : s
        )
      );
      toast.error("Failed to update visibility");
    }
  };

  const handleDelete = async (section: LandingSection) => {
    if (!confirm(`Remove "${section.slug}"? It stays on the live site until you publish.`)) return;

    setSections((prev) => prev.filter((s) => s.id !== section.id));

    try {
      const res = await fetch(`/api/landing-sections/${section.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Section removed — publish to apply");
      loadSections();
    } catch {
      loadSections(); // Revert by reloading
      toast.error("Failed to delete section");
    }
  };

  const handleSectionUpdated = (updated: LandingSection) => {
    setSections((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    );
    // The edit became a Section draft, so the pending count moved.
    loadSections();
  };

  const handleAddSection = async (type: string, slug: string) => {
    try {
      const res = await fetch("/api/landing-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_type: type, slug, content: {} }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create");
      }
      const { section } = await res.json();
      setSections((prev) => [...prev, section]);
      toast.success("Section added");
      loadSections();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add section"
      );
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragEnd = async (event: any) => {
    const source = event.operation?.source;
    const target = event.operation?.target;
    if (!source || !target || source.id === target.id) return;

    const oldIndex = sections.findIndex((s) => s.id === source.id);
    const newIndex = sections.findIndex((s) => s.id === target.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Reorder locally
    const updated = [...sections];
    const [moved] = updated.splice(oldIndex, 1);
    updated.splice(newIndex, 0, moved);
    setSections(updated);

    // Persist
    try {
      const order = updated.map((s) => s.id);
      const res = await fetch("/api/landing-sections/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Order updated");
      loadSections();
    } catch {
      loadSections(); // Revert
      toast.error("Failed to reorder");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground text-sm">Loading sections...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Page Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Drag to reorder, toggle visibility, and edit section content. Changes stay in
            a draft until you publish.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <PublishBar
            pending={pending}
            onPublished={loadSections}
            onDiscarded={loadSections}
          />
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" asChild>
            <a href="/" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Preview
            </a>
          </Button>
          <AddSectionDialog onAdd={handleAddSection} />
        </div>
      </div>

      <DragDropProvider onDragEnd={handleDragEnd}>
        <div className="space-y-2">
          {sections.map((section, index) => (
            <SortableSectionRow
              key={section.id}
              section={section}
              index={index}
              expandedId={expandedId}
              onToggleExpand={handleToggleExpand}
              onToggleVisibility={handleToggleVisibility}
              onDelete={handleDelete}
              onSectionUpdated={handleSectionUpdated}
            />
          ))}
        </div>
      </DragDropProvider>

      {sections.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No sections configured. Add a section to get started.
        </div>
      )}
    </div>
  );
}
