import type { LandingSection } from "@/lib/types/landing-sections";

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

export function pendingChangeKinds(row: LandingSectionRow): DraftChangeKind[] {
  const kinds: DraftChangeKind[] = [];
  if (row.draft_deleted === true) return ["removal"];
  if (row.draft_content != null) kinds.push("content");
  if (row.draft_position != null) kinds.push("position");
  if (row.draft_visible != null) kinds.push("visibility");
  return kinds;
}

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

export function describePending(summary: PendingSummary): string {
  if (summary.total === 0) return "Published";
  return `Draft · ${summary.total} ${summary.total === 1 ? "change" : "changes"}`;
}

export interface SnapshotSection {
  slug: string;
  section_type: string;
  position: number;
  visible: boolean;
  content: Record<string, unknown>;
}

export interface PublishSnapshot {
  id: string;
  sections: SnapshotSection[];
  published_at: string;
  published_by: string | null;
}

export interface SnapshotDiff {
  changed: string[];
  missing: string[];
  added: string[];
}

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

export function describeSnapshotDiff(diff: SnapshotDiff): string {
  const parts = [
    diff.changed.length > 0 ? `${diff.changed.length} would change` : null,
    diff.added.length > 0 ? `${diff.added.length} would be removed` : null,
    diff.missing.length > 0 ? `${diff.missing.length} no longer exist` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Matches the live page";
}
