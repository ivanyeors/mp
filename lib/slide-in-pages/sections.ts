import type { DraftChangeKind, PendingSummary } from "@/lib/page-builder/draft";
import type { ProductSlideSectionConfig } from "@/lib/product-slide-sections/section-config";

import { HEADER_SLUG, type SlideInSectionContent } from "./content";
import { HEADER_SECTION_TYPE } from "./fields";
import { SLIDE_IN_PAGES, type SlideInPageKey } from "./pages";

/**
 * Merging stored **Slide-in section** rows over a slide-in's code config.
 *
 * The config is the catalog: it alone decides which sections exist. A row only adjusts
 * one — its order, visibility and content — so a section with no row renders exactly as
 * the code says, and a row whose key the code no longer has is ignored.
 */

/** A `slide_in_sections` row as stored, including any pending draft. */
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

/** One section of a sub page as the builder lists it and the renderer orders it. */
export interface SlideInSectionView {
  slug: string;
  section_type: string;
  position: number;
  visible: boolean;
  content: SlideInSectionContent;
  /** What a publish would change on it; empty when it has no pending draft. */
  pending: DraftChangeKind[];
  /** The pinned sheet header rather than a template section. */
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

/**
 * The sub page's sections in render order, header first. `mode` picks published state
 * (the live slide-in) or drafts applied (Preview mode and the builder).
 *
 * A section with no row sits at its config index; ties — a section added in code after
 * Staff reordered — fall back to config order, so it lands near where the code put it.
 */
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

/** A config section paired with its stored state, for the renderer. */
export interface OrderedSlideSection {
  config: ProductSlideSectionConfig;
  view: SlideInSectionView;
}

/** Template sections in order, each with its config. Hidden ones are kept; callers filter. */
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

/** The section keys the builder may reorder, in config order. */
export function reorderableSlugs(page: SlideInPageKey): string[] {
  return SLIDE_IN_PAGES[page].sections.map((s) => s.key);
}

/** Whether `slug` names something on this sub page (a section, or the header). */
export function isSlideInSlug(page: SlideInPageKey, slug: string): boolean {
  return slug === HEADER_SLUG || SLIDE_IN_PAGES[page].sections.some((s) => s.key === slug);
}

/** The template type a slug renders with. */
export function slideInSectionType(page: SlideInPageKey, slug: string): string | null {
  if (slug === HEADER_SLUG) return HEADER_SECTION_TYPE;
  return SLIDE_IN_PAGES[page].sections.find((s) => s.key === slug)?.type ?? null;
}

/** The header count and the Publish dialog's summary, for one sub page. */
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

// --- Publish snapshots ------------------------------------------------------------

/** One entry inside a sub page's **Publish snapshot**. */
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

/**
 * What restoring a snapshot would change on the live sub page, in the history panel's
 * shape. A section first overridden after the snapshot would go back to its default, so
 * it counts as changed; nothing is ever removed, since sections are code-owned.
 */
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
