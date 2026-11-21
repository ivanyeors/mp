"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Eye, History, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfoTip } from "@/components/ui/info-tip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PagePicker } from "@/components/settings/page-builder/page-picker";
import { PreviewFrame } from "@/components/settings/page-builder/preview-frame";
import { EMPTY_PENDING, PublishBar } from "@/components/settings/page-builder/publish-bar";
import { PublishHistory } from "@/components/settings/page-builder/publish-history";
import { SectionTree, sectionTitle, type TreeSection } from "@/components/settings/page-builder/section-tree";
import { SlideInSectionEditor } from "@/components/settings/page-builder/slide-in-section-editor";
import { useMediaQuery } from "@/hooks/use-media-query";
import { sortableMove, type SortableDragEndEvent } from "@/lib/dnd/sortable-move";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import type { PendingSummary } from "@/lib/page-builder/draft";
import { PAGE_BUILDER_PREVIEW_PATH } from "@/lib/routing/preview-route";
import { HEADER_SLUG } from "@/lib/slide-in-pages/content";
import { SLIDE_IN_TYPE_LABELS } from "@/lib/slide-in-pages/fields";
import { SLIDE_IN_PAGES, type SlideInPageKey } from "@/lib/slide-in-pages/pages";
import type { SlideInSectionView } from "@/lib/slide-in-pages/sections";

export type SlideInBuilderInitialData = {
  sections: SlideInSectionView[];
  pending: PendingSummary;
};

type TreeRow = TreeSection & { view: SlideInSectionView };

function viewTitle(view: SlideInSectionView): string {
  return view.header ? "Header" : sectionTitle(view);
}

export default function SlideInBuilder({
  page,
  initialData,
}: {
  page: SlideInPageKey;
  initialData?: SlideInBuilderInitialData;
}) {
  const def = SLIDE_IN_PAGES[page];
  const endpoint = `/api/slide-in-sections/${page}`;

  const [sections, setSections] = useState<SlideInSectionView[]>(initialData?.sections ?? []);
  const [pending, setPending] = useState<PendingSummary>(initialData?.pending ?? EMPTY_PENDING);
  const [loading, setLoading] = useState(!initialData);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [previewLocale, setPreviewLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inspectorDirty = useRef(false);
  const narrow = useMediaQuery("(max-width: 1023px)");

  const selected = useMemo(() => sections.find((s) => s.slug === selectedSlug) ?? null, [sections, selectedSlug]);
  const tree = useMemo<TreeRow[]>(
    () =>
      sections
        .filter((s) => !s.header)
        .map((view) => ({ id: view.slug, slug: view.slug, section_type: view.section_type, visible: view.visible, view })),
    [sections],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Couldn't load.");
      const data = await res.json();
      setSections(data.sections);
      setPending(data.pending ?? EMPTY_PENDING);
    } catch {
      toast.error("Couldn't load this page's sections.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  const skipFirstFetch = useRef(initialData != null);
  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    void load();
  }, [load]);

  const afterChange = useCallback(() => {
    void load();
    setRefreshKey((k) => k + 1);
  }, [load]);

  const confirmLeave = useCallback(
    () => !inspectorDirty.current || window.confirm("Discard your unsaved edits to this section?"),
    [],
  );

  const selectSection = useCallback(
    (slug: string | null) => {
      if (!confirmLeave()) return;
      inspectorDirty.current = false;
      setSelectedSlug(slug);
    },
    [confirmLeave],
  );

  const resetAndRefresh = useCallback(() => {
    inspectorDirty.current = false;
    setSelectedSlug(null);
    afterChange();
  }, [afterChange]);

  const handleToggleVisibility = async (row: TreeRow) => {
    const next = !row.visible;
    setSections((prev) => prev.map((s) => (s.slug === row.slug ? { ...s, visible: next } : s)));
    try {
      const res = await fetch(`${endpoint}/${row.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next ? "Section shown" : "Section hidden");
      afterChange();
    } catch {
      setSections((prev) => prev.map((s) => (s.slug === row.slug ? { ...s, visible: !next } : s)));
      toast.error("Couldn't update visibility.");
    }
  };

  const persistOrder = useCallback(
    async (ordered: TreeRow[]) => {
      const header = sections.filter((s) => s.header);
      setSections([...header, ...ordered.map((r) => r.view)]);
      try {
        const res = await fetch(`${endpoint}/reorder`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: ordered.map((r) => r.slug) }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(typeof body?.error === "string" ? body.error : "Couldn't reorder.");
        }
        toast.success("Order updated");
        afterChange();
      } catch (err) {
        void load();
        toast.error(err instanceof Error ? err.message : "Couldn't reorder.");
      }
    },
    [afterChange, endpoint, load, sections],
  );

  const handleMove = (row: TreeRow, direction: -1 | 1) => {
    const from = tree.findIndex((r) => r.slug === row.slug);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= tree.length) return;
    const next = [...tree];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    void persistOrder(next);
  };

  const handleDragEnd = (event: SortableDragEndEvent) => {
    const next = sortableMove(tree, event, (r) => r.id);
    if (next) void persistOrder(next);
  };

  const handleSaved = (updated: SlideInSectionView) => {
    setSections((prev) => prev.map((s) => (s.slug === updated.slug ? { ...s, ...updated } : s)));
    afterChange();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading sections…</div>
      </div>
    );
  }

  const treePane = (
    <SectionTree
      sections={tree}
      selectedSlug={selectedSlug}
      onSelect={selectSection}
      onToggleVisibility={handleToggleVisibility}
      onMove={handleMove}
      onDragEnd={handleDragEnd}
      typeLabel={(row) => SLIDE_IN_TYPE_LABELS[row.section_type] ?? row.section_type}
      pinned={{ slug: HEADER_SLUG, title: "Header", label: SLIDE_IN_TYPE_LABELS.header! }}
    />
  );

  const inspector = selected ? (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="truncate text-sm font-semibold">{viewTitle(selected)}</h2>
        <span className="shrink-0 text-xs text-muted-foreground">
          {SLIDE_IN_TYPE_LABELS[selected.section_type] ?? selected.section_type}
        </span>
      </div>
      <SlideInSectionEditor
        key={`${page}:${selected.slug}`}
        page={page}
        section={selected}
        onSaved={handleSaved}
        onCancel={() => selectSection(null)}
        onDirtyChange={(d) => {
          inspectorDirty.current = d;
        }}
      />
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">Pick a section in the list or the preview to edit it.</p>
  );

  const previewPath = `${PAGE_BUILDER_PREVIEW_PATH}/${page}`;
  const liveLabel = `the live ${def.label} page`;

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Page Builder</h1>
          <InfoTip label="About sub pages">
            <p>
              Sub pages are the sheets the landing page opens. Reorder, show or hide their sections and edit their copy,
              images and video. Changes stay in a draft until you publish this page.
            </p>
          </InfoTip>
          <PagePicker value={page} confirmLeave={confirmLeave} />
        </div>
        <p className="text-xs text-muted-foreground" data-page-builder-opened-from="">
          Opens from: {def.openedFrom}
        </p>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <PublishBar
          pending={pending}
          onPublished={afterChange}
          onDiscarded={resetAndRefresh}
          endpoint={`${endpoint}/publish`}
          liveLabel={liveLabel}
        />
        <PublishHistory
          pending={pending}
          onRestored={resetAndRefresh}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          endpoint={`${endpoint}/history`}
          triggerClassName="max-md:hidden"
        />
        <Button variant="outline" size="sm" className="max-md:hidden" asChild>
          <a href="/" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Live site
          </a>
        </Button>
        <Button variant="outline" size="sm" className="flex-1 md:hidden" onClick={() => setMobilePreviewOpen(true)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          Preview
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-11 shrink-0 md:hidden" aria-label="More page actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem className="min-h-11" onSelect={() => setHistoryOpen(true)}>
              <History />
              Publish history
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" asChild>
              <a href="/" target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Live site
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  const preview = (initialDevice?: "mobile") => (
    <PreviewFrame
      locale={previewLocale}
      onLocaleChange={setPreviewLocale}
      selectedSlug={selectedSlug}
      onSelect={selectSection}
      refreshKey={refreshKey}
      initialDevice={initialDevice}
      previewPath={previewPath}
      title={`${def.label} preview`}
    />
  );

  if (narrow) {
    return (
      <div className="space-y-4">
        {header}
        <Button variant="outline" size="sm" className="w-full max-md:hidden" onClick={() => setMobilePreviewOpen(true)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          Preview
        </Button>
        {treePane}

        <Sheet open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
          <SheetContent side="bottom" className="h-[92vh] p-0">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>Preview</SheetTitle>
            </SheetHeader>
            <div className="flex h-[calc(92vh-3.5rem)] flex-col">{preview("mobile")}</div>
          </SheetContent>
        </Sheet>

        <Sheet open={selected != null} onOpenChange={(open) => !open && selectSection(null)}>
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
            <SheetHeader>
              <SheetTitle>{selected ? viewTitle(selected) : "Section"}</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">{inspector}</div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      <div
        className="grid gap-3 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)_minmax(300px,340px)]"
        data-page-builder-shell=""
        data-page-builder-page={page}
      >
        <aside className="min-w-0 space-y-2 overflow-y-auto lg:max-h-[calc(100vh-12rem)]">{treePane}</aside>
        <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border">{preview()}</section>
        <aside className="min-w-0 overflow-y-auto rounded-lg border p-3 lg:max-h-[calc(100vh-12rem)]">{inspector}</aside>
      </div>
    </div>
  );
}
