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
