import type { DraftChangeKind, PendingSummary } from "@/lib/page-builder/draft";
import type { ProductSlideSectionConfig } from "@/lib/product-slide-sections/section-config";

import { HEADER_SLUG, type SlideInSectionContent } from "./content";
import { HEADER_SECTION_TYPE } from "./fields";
import { SLIDE_IN_PAGES, type SlideInPageKey } from "./pages";

export interface SlideInSectionRow {
  id: string;
  page: string;
  slug: string;
  section_type: string;
  position: number;
  visible: boolean;
  content: SlideInSectionContent | null;
  draft_content?: SlideInSectionContent | null;
  draft_position?: number | null;
  draft_visible?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

export interface SlideInSectionView {
  slug: string;
  section_type: string;
  position: number;
  visible: boolean;
  content: SlideInSectionContent;
  pending: DraftChangeKind[];
  header: boolean;
}

export type SlideInReadMode = "published" | "draft";

export function rowPendingKinds(row: SlideInSectionRow): DraftChangeKind[] {
  const kinds: DraftChangeKind[] = [];
  if (row.draft_content != null) kinds.push("content");
  if (row.draft_position != null) kinds.push("position");
  if (row.draft_visible != null) kinds.push("visibility");
  return kinds;
}

function view(
  slug: string,
  sectionType: string,
  fallbackPosition: number,
  row: SlideInSectionRow | undefined,
  mode: SlideInReadMode,
  header: boolean,
): SlideInSectionView {
  const draft = mode === "draft";
  return {
    slug,
    section_type: sectionType,
    position: row ? ((draft ? row.draft_position : null) ?? row.position) : fallbackPosition,
    visible: row ? ((draft ? row.draft_visible : null) ?? row.visible) : true,
    content: (row ? ((draft ? row.draft_content : null) ?? row.content) : null) ?? {},
    pending: row && draft ? rowPendingKinds(row) : [],
    header,
  };
}

export function slideInSectionViews(
  page: SlideInPageKey,
  rows: readonly SlideInSectionRow[],
  mode: SlideInReadMode,
): SlideInSectionView[] {
  const config = SLIDE_IN_PAGES[page].sections;
  const bySlug = new Map(rows.filter((r) => r.page === page).map((r) => [r.slug, r]));

  const sections = config
    .map((section, index) => ({
      index,
      view: view(section.key, section.type, index, bySlug.get(section.key), mode, false),
    }))
    .sort((a, b) => a.view.position - b.view.position || a.index - b.index)
    .map((entry) => entry.view);

  const header = view(HEADER_SLUG, HEADER_SECTION_TYPE, -1, bySlug.get(HEADER_SLUG), mode, true);
  return [{ ...header, visible: true }, ...sections];
}

export interface OrderedSlideSection {
  config: ProductSlideSectionConfig;
  view: SlideInSectionView;
}

export function orderedSlideSections(
  page: SlideInPageKey,
  views: readonly SlideInSectionView[],
): OrderedSlideSection[] {
  const bySlug = new Map(SLIDE_IN_PAGES[page].sections.map((s) => [s.key, s]));
  const out: OrderedSlideSection[] = [];
  for (const v of views) {
    if (v.header) continue;
    const config = bySlug.get(v.slug);
    if (config) out.push({ config, view: v });
  }
  return out;
}

export function reorderableSlugs(page: SlideInPageKey): string[] {
  return SLIDE_IN_PAGES[page].sections.map((s) => s.key);
}

export function isSlideInSlug(page: SlideInPageKey, slug: string): boolean {
  return slug === HEADER_SLUG || SLIDE_IN_PAGES[page].sections.some((s) => s.key === slug);
}

export function slideInSectionType(page: SlideInPageKey, slug: string): string | null {
  if (slug === HEADER_SLUG) return HEADER_SECTION_TYPE;
  return SLIDE_IN_PAGES[page].sections.find((s) => s.key === slug)?.type ?? null;
}

export function summariseSlideInPending(
  page: SlideInPageKey,
  rows: readonly SlideInSectionRow[],
): PendingSummary {
  const summary: PendingSummary = {
    total: 0,
    content: 0,
    position: 0,
    visibility: 0,
    removal: 0,
    slugs: [],
  };
  for (const row of rows) {
    if (row.page !== page || !isSlideInSlug(page, row.slug)) continue;
    const kinds = rowPendingKinds(row);
    if (kinds.length === 0) continue;
    summary.total += 1;
    summary.slugs.push(row.slug);
    for (const kind of kinds) {
      if (kind === "content") summary.content += 1;
      else if (kind === "position") summary.position += 1;
      else if (kind === "visibility") summary.visibility += 1;
    }
  }
  return summary;
}

export interface SlideInSnapshotSection {
  slug: string;
  section_type: string;
  position: number;
  visible: boolean;
  content: SlideInSectionContent | null;
}

function isDefaultState(row: Pick<SlideInSectionRow, "visible" | "content">): boolean {
  return row.visible && Object.keys(row.content ?? {}).length === 0;
}

export function diffSlideInSnapshot(
  snapshot: readonly SlideInSnapshotSection[],
  live: readonly SlideInSectionRow[],
): { changed: string[]; missing: string[]; added: string[] } {
  const liveBySlug = new Map(live.map((row) => [row.slug, row]));
  const snapSlugs = new Set(snapshot.map((s) => s.slug));
  const changed: string[] = [];
  const missing: string[] = [];

  for (const entry of snapshot) {
    const row = liveBySlug.get(entry.slug);
    if (!row) {
      if (!isDefaultState(entry)) missing.push(entry.slug);
      continue;
    }
    const sameContent = JSON.stringify(row.content ?? {}) === JSON.stringify(entry.content ?? {});
    if (!sameContent || row.position !== entry.position || row.visible !== entry.visible) {
      changed.push(entry.slug);
    }
  }
  for (const row of live) {
    if (!snapSlugs.has(row.slug) && !isDefaultState(row)) changed.push(row.slug);
  }
  return { changed, missing, added: [] };
}
