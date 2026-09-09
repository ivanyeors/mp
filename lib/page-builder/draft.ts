import type { LandingSection } from "@/lib/types/landing-sections";

/**
 * Section drafts (CONTEXT.md — **Section draft**).
 *
 * A pending edit lives in nullable `draft_*` columns on the section's own row, so two
 * Staff editing different sections never clobber each other. A row with every draft
 * column null has no pending change.
 */

/** A `landing_sections` row as stored, including any pending draft. */
export interface LandingSectionRow extends LandingSection {
  draft_content?: Record<string, unknown> | null;
  draft_position?: number | null;
  draft_visible?: boolean | null;
  draft_deleted?: boolean | null;
}

export type DraftChangeKind = "content" | "position" | "visibility" | "removal";

export function hasPendingDraft(row: LandingSectionRow): boolean {
  return (
    row.draft_content != null ||
    row.draft_position != null ||
    row.draft_visible != null ||
    row.draft_deleted === true
  );
}

/** What a publish would change on this row, for the header summary. */
export function pendingChangeKinds(row: LandingSectionRow): DraftChangeKind[] {
  const kinds: DraftChangeKind[] = [];
  if (row.draft_deleted === true) return ["removal"];
  if (row.draft_content != null) kinds.push("content");
  if (row.draft_position != null) kinds.push("position");
  if (row.draft_visible != null) kinds.push("visibility");
  return kinds;
}

/** The row as it would look once published — draft values winning where present. */
export function mergeDraft(row: LandingSectionRow): LandingSection {
  return {
    id: row.id,
    section_type: row.section_type,
    slug: row.slug,
    position: row.draft_position ?? row.position,
    visible: row.draft_visible ?? row.visible,
    content: row.draft_content ?? row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * The section list as **Preview mode** should render it: drafts applied, sections marked
 * for removal gone, ordered by the position a publish would give them.
 *
 * Hidden sections are kept, not filtered — the preview marks them instead, so the
 * visibility toggle has a visible effect (the public page filters separately).
 */
export function draftSections(rows: LandingSectionRow[]): LandingSection[] {
  return rows
    .filter((row) => row.draft_deleted !== true)
    .map(mergeDraft)
    .sort((a, b) => a.position - b.position);
}

export interface PendingSummary {
  total: number;
  content: number;
  position: number;
  visibility: number;
  removal: number;
  slugs: string[];
}

/** What the header reports, and what the Publish dialog summarises. */
export function summarisePending(rows: LandingSectionRow[]): PendingSummary {
  const summary: PendingSummary = {
    total: 0,
    content: 0,
    position: 0,
    visibility: 0,
    removal: 0,
    slugs: [],
  };

  for (const row of rows) {
    const kinds = pendingChangeKinds(row);
    if (kinds.length === 0) continue;
    summary.total += 1;
    summary.slugs.push(row.slug);
    for (const kind of kinds) {
      if (kind === "content") summary.content += 1;
      else if (kind === "position") summary.position += 1;
      else if (kind === "visibility") summary.visibility += 1;
      else summary.removal += 1;
    }
  }

  return summary;
}

/** One short line for the header, e.g. "Draft · 3 changes". */
export function describePending(summary: PendingSummary): string {
  if (summary.total === 0) return "Published";
  return `Draft · ${summary.total} ${summary.total === 1 ? "change" : "changes"}`;
}

// --- Publish snapshots -----------------------------------------------------------

/** One entry inside a **Publish snapshot**'s `sections` array. */
export interface SnapshotSection {
  slug: string;
  section_type: string;
  position: number;
  visible: boolean;
  content: Record<string, unknown>;
}

/** A **Publish snapshot** row, as the history panel lists it. */
export interface PublishSnapshot {
  id: string;
  sections: SnapshotSection[];
  published_at: string;
  published_by: string | null;
}

export interface SnapshotDiff {
  /** Sections whose content, position or visibility differ from what is live now. */
  changed: string[];
  /** In the snapshot but no longer on the page — restoring cannot bring these back. */
  missing: string[];
  /** Live now but absent from the snapshot — restoring would remove them. */
  added: string[];
}

/**
 * How a snapshot differs from what is published now, so the history panel can tell two
 * neighbouring entries apart and say what restoring would actually do.
 */
export function diffSnapshot(
  snapshot: SnapshotSection[],
  live: LandingSectionRow[],
): SnapshotDiff {
  const liveBySlug = new Map(live.map((row) => [row.slug, row]));
  const snapSlugs = new Set(snapshot.map((s) => s.slug));

  const changed: string[] = [];
  const missing: string[] = [];

  for (const entry of snapshot) {
    const row = liveBySlug.get(entry.slug);
    if (!row) {
      missing.push(entry.slug);
      continue;
    }
    const sameContent = JSON.stringify(row.content ?? {}) === JSON.stringify(entry.content ?? {});
    if (!sameContent || row.position !== entry.position || row.visible !== entry.visible) {
      changed.push(entry.slug);
    }
  }

  const added = live.filter((row) => !snapSlugs.has(row.slug)).map((row) => row.slug);

  return { changed, missing, added };
}

/** One line describing what restoring a snapshot would do. */
export function describeSnapshotDiff(diff: SnapshotDiff): string {
  const parts = [
    diff.changed.length > 0 ? `${diff.changed.length} would change` : null,
    diff.added.length > 0 ? `${diff.added.length} would be removed` : null,
    diff.missing.length > 0 ? `${diff.missing.length} no longer exist` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Matches the live page";
}
