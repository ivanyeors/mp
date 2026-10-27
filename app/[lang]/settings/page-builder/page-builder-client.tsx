"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SectionEditor } from "@/components/settings/page-builder/section-editor";
import { SectionTree, SECTION_TYPE_LABELS, sectionTitle } from "@/components/settings/page-builder/section-tree";
import { PreviewFrame } from "@/components/settings/page-builder/preview-frame";
import { PublishHistory } from "@/components/settings/page-builder/publish-history";
import { ExternalLink, Eye, Loader2, Plus, Undo2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { sortableMove, type SortableDragEndEvent } from "@/lib/dnd/sortable-move";
import { describePending, type PendingSummary } from "@/lib/page-builder/draft";
import type { LandingSection } from "@/lib/types/landing-sections";
import { CUSTOM_SECTION_TEMPLATES } from "@/lib/types/landing-sections";
import { InfoTip } from "@/components/ui/info-tip";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
          Add section
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New section</DialogTitle>
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
            <Label className="text-sm">Section slug</Label>
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
            Create section
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
      if (!res.ok) throw new Error(body?.error ?? "Something went wrong.");
      if (method === "POST") {
        toast.success("Published to the live site");
        onPublished();
      } else {
        toast.success("Draft discarded");
        onDiscarded();
      }
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
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

/**
 * Three panes: the section tree, Preview mode, and the inspector.
 *
 * Below `lg` the panes collapse to the tree plus a full-screen preview sheet and a
 * full-screen inspector sheet — one layout, not a second inspector, and the phone still
 * gets a preview, which is the point.
 */
export default function PageBuilderPage({
  initialData,
}: {
  initialData?: PageBuilderInitialData;
}) {
  const [sections, setSections] = useState<LandingSection[]>(initialData?.sections ?? []);
  const [pending, setPending] = useState<PendingSummary>(initialData?.pending ?? EMPTY_PENDING);
  const [loading, setLoading] = useState(!initialData);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [previewLocale, setPreviewLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  /**
   * Whether the open inspector has unsaved edits. A ref, not state: it is only read at
   * the moment selection changes, and re-rendering the shell on every keystroke would
   * reload the preview.
   */
  const inspectorDirty = useRef(false);
  // Not useIsMobile(): that breaks at 768 while the grid needs 1024, so tablets
  // (including the 834px preset) landed in neither layout.
  const narrow = useMediaQuery("(max-width: 1023px)");

  // The server already loaded the sections; every later change still refetches.
  const skipFirstFetch = useRef(initialData != null);

  const selected = useMemo(
    () => sections.find((s) => s.slug === selectedSlug) ?? null,
    [sections, selectedSlug],
  );

  const loadSections = useCallback(async () => {
    try {
      const res = await fetch("/api/landing-sections");
      if (!res.ok) throw new Error("Couldn't load.");
      const data = await res.json();
      setSections(data.sections);
      setPending(data.pending ?? EMPTY_PENDING);
    } catch {
      toast.error("Couldn't load sections.");
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

  /** Anything that changed the draft: refresh the list and re-render the preview. */
  const afterChange = useCallback(() => {
    loadSections();
    setRefreshKey((k) => k + 1);
  }, [loadSections]);

  /**
   * Changing selection remounts the inspector and discards its unsaved edits, so ask
   * first. `beforeunload` cannot cover this — it only fires on a real document unload.
   */
  const selectSection = useCallback((slug: string | null) => {
    if (
      inspectorDirty.current &&
      !window.confirm("Discard your unsaved edits to this section?")
    ) {
      return;
    }
    inspectorDirty.current = false;
    setSelectedSlug(slug);
  }, []);

  /** For changes that replace the whole draft: drop the open inspector too. */
  const resetAndRefresh = useCallback(() => {
    inspectorDirty.current = false;
    setSelectedSlug(null);
    afterChange();
  }, [afterChange]);

  const handleToggleVisibility = async (section: LandingSection) => {
    const newVisible = !section.visible;
    setSections((prev) =>
      prev.map((s) => (s.id === section.id ? { ...s, visible: newVisible } : s)),
    );

    try {
      const res = await fetch(`/api/landing-sections/${section.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: newVisible }),
      });
      if (!res.ok) throw new Error("Something went wrong.");
      toast.success(newVisible ? "Section shown" : "Section hidden");
      afterChange();
    } catch {
      setSections((prev) =>
        prev.map((s) => (s.id === section.id ? { ...s, visible: !newVisible } : s)),
      );
      toast.error("Couldn't update visibility.");
    }
  };

  const handleDelete = async (section: LandingSection) => {
    if (!confirm(`Remove "${section.slug}"? It stays on the live site until you publish.`)) return;

    setSections((prev) => prev.filter((s) => s.id !== section.id));
    if (selectedSlug === section.slug) setSelectedSlug(null);

    try {
      const res = await fetch(`/api/landing-sections/${section.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Something went wrong.");
      }
      toast.success("Section removed. Publish to apply.");
      afterChange();
    } catch (err) {
      loadSections();
      toast.error(err instanceof Error ? err.message : "Couldn't remove the section.");
    }
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
        throw new Error(typeof err.error === "string" ? err.error : "Couldn't create.");
      }
      const { section } = await res.json();
      setSelectedSlug(section.slug);
      toast.success("Section added");
      afterChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add the section.");
    }
  };

  /** Persist a whole order — shared by drag and the keyboard move buttons. */
  const persistOrder = useCallback(
    async (ordered: LandingSection[]) => {
      setSections(ordered);
      try {
        const res = await fetch("/api/landing-sections/reorder", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: ordered.map((s) => s.id) }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(typeof body?.error === "string" ? body.error : "Couldn't reorder.");
        }
        toast.success("Order updated");
        afterChange();
      } catch (err) {
        loadSections();
        toast.error(err instanceof Error ? err.message : "Couldn't reorder.");
      }
    },
    [afterChange, loadSections],
  );

  const handleMove = (section: LandingSection, direction: -1 | 1) => {
    const from = sections.findIndex((s) => s.id === section.id);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= sections.length) return;
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistOrder(next);
  };

  const handleDragEnd = (event: SortableDragEndEvent) => {
    const next = sortableMove(sections, event, (s) => s.id);
    if (next) persistOrder(next);
  };

  const handleSectionSaved = (updated: LandingSection) => {
    setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    afterChange();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading sections…</div>
      </div>
    );
  }

  const tree = (
    <SectionTree
      sections={sections}
      selectedSlug={selectedSlug}
      onSelect={selectSection}
      onToggleVisibility={handleToggleVisibility}
      onDelete={handleDelete}
      onMove={handleMove}
      onDragEnd={handleDragEnd}
    />
  );

  const inspector = selected ? (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="truncate text-sm font-semibold">{sectionTitle(selected)}</h2>
        <span className="shrink-0 text-xs text-muted-foreground">
          {SECTION_TYPE_LABELS[selected.section_type] ?? selected.section_type}
        </span>
      </div>
      <SectionEditor
        key={selected.id}
        section={selected}
        onSave={handleSectionSaved}
        onCancel={() => selectSection(null)}
        onDirtyChange={(d) => {
          inspectorDirty.current = d;
        }}
      />
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">
      Pick a section in the list or the preview to edit it.
    </p>
  );

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Page Builder</h1>
          <InfoTip label="About Page Builder">
            <p>Drag to reorder, toggle visibility, and edit section content. Changes stay in a draft until you publish.</p>
          </InfoTip>
        </div>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        {/*
          Close the inspector first: it is keyed on section id, which a restore or discard
          does not change, so its local edits would survive and could be saved back over
          the very state that was just restored.
        */}
        <PublishBar pending={pending} onPublished={afterChange} onDiscarded={resetAndRefresh} />
        <PublishHistory pending={pending} onRestored={resetAndRefresh} />
        <Button variant="outline" size="sm" asChild>
          <a href="/" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Live site
          </a>
        </Button>
        <AddSectionDialog onAdd={handleAddSection} />
      </div>
    </div>
  );

  // --- Narrow screens: list + full-screen preview and inspector sheets ---
  if (narrow) {
    return (
      <div className="space-y-4">
        {header}
        <Button variant="outline" size="sm" className="w-full" onClick={() => setMobilePreviewOpen(true)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          Preview
        </Button>
        {tree}

        <Sheet open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
          <SheetContent side="bottom" className="h-[92vh] p-0">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>Preview</SheetTitle>
            </SheetHeader>
            <div className="flex h-[calc(92vh-3.5rem)] flex-col">
              <PreviewFrame
                locale={previewLocale}
                onLocaleChange={setPreviewLocale}
                selectedSlug={selectedSlug}
                onSelect={selectSection}
                refreshKey={refreshKey}
                initialDevice="mobile"
              />
            </div>
          </SheetContent>
        </Sheet>

        <Sheet open={selected != null} onOpenChange={(open) => !open && selectSection(null)}>
          {/*
            Closing unmounts the editor and its unsaved edits, so it must be deliberate:
            an outside tap is too easy to hit while typing.
          */}
          <SheetContent
            side="bottom"
            className="h-[85vh] overflow-y-auto"
            onInteractOutside={(e) => e.preventDefault()}
          >
            <SheetHeader>
              <SheetTitle>{selected ? sectionTitle(selected) : "Section"}</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">{inspector}</div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // --- Three panes ---
  return (
    <div className="space-y-4">
      {header}
      <div
        className="grid gap-3 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)_minmax(300px,340px)]"
        data-page-builder-shell=""
      >
        <aside className="min-w-0 space-y-2 overflow-y-auto lg:max-h-[calc(100vh-12rem)]">
          {tree}
        </aside>

        <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border">
          <PreviewFrame
            locale={previewLocale}
            onLocaleChange={setPreviewLocale}
            selectedSlug={selectedSlug}
            onSelect={selectSection}
            refreshKey={refreshKey}
          />
        </section>

        <aside className="min-w-0 overflow-y-auto rounded-lg border p-3 lg:max-h-[calc(100vh-12rem)]">
          {inspector}
        </aside>
      </div>
    </div>
  );
}
