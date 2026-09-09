import { describe, expect, it } from "vitest";

import {
  describePending,
  describeSnapshotDiff,
  diffSnapshot,
  draftSections,
  hasPendingDraft,
  mergeDraft,
  pendingChangeKinds,
  summarisePending,
  type LandingSectionRow,
} from "@/lib/page-builder/draft";

function row(over: Partial<LandingSectionRow> = {}): LandingSectionRow {
  return {
    id: "id",
    section_type: "text_image",
    slug: "slug",
    position: 0,
    visible: true,
    content: {},
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("hasPendingDraft", () => {
  it("is false when every draft column is null", () => {
    expect(hasPendingDraft(row())).toBe(false);
    expect(hasPendingDraft(row({ draft_content: null, draft_position: null }))).toBe(false);
  });

  it("is true for any pending column", () => {
    expect(hasPendingDraft(row({ draft_content: { title: "x" } }))).toBe(true);
    expect(hasPendingDraft(row({ draft_position: 3 }))).toBe(true);
    expect(hasPendingDraft(row({ draft_visible: false }))).toBe(true);
    expect(hasPendingDraft(row({ draft_deleted: true }))).toBe(true);
  });

  it("treats draft_position 0 as pending, not as absent", () => {
    expect(hasPendingDraft(row({ position: 5, draft_position: 0 }))).toBe(true);
  });

  it("treats draft_visible false as pending, not as absent", () => {
    expect(hasPendingDraft(row({ draft_visible: false }))).toBe(true);
  });
});

describe("mergeDraft", () => {
  it("lets draft values win where present", () => {
    const merged = mergeDraft(
      row({
        content: { title: "live" },
        draft_content: { title: "pending" },
        position: 1,
        draft_position: 4,
        visible: true,
        draft_visible: false,
      }),
    );
    expect(merged.content).toEqual({ title: "pending" });
    expect(merged.position).toBe(4);
    expect(merged.visible).toBe(false);
  });

  it("keeps published values where no draft is set", () => {
    const merged = mergeDraft(row({ content: { title: "live" }, position: 2, visible: false }));
    expect(merged.content).toEqual({ title: "live" });
    expect(merged.position).toBe(2);
    expect(merged.visible).toBe(false);
  });
});

describe("draftSections", () => {
  it("drops sections pending removal", () => {
    const rows = [row({ id: "a", slug: "a" }), row({ id: "b", slug: "b", draft_deleted: true })];
    expect(draftSections(rows).map((s) => s.slug)).toEqual(["a"]);
  });

  it("orders by the position a publish would give", () => {
    const rows = [
      row({ id: "a", slug: "a", position: 0, draft_position: 2 }),
      row({ id: "b", slug: "b", position: 1 }),
      row({ id: "c", slug: "c", position: 2, draft_position: 0 }),
    ];
    expect(draftSections(rows).map((s) => s.slug)).toEqual(["c", "b", "a"]);
  });

  it("keeps hidden sections, so the builder can mark them", () => {
    const rows = [row({ id: "a", slug: "a", visible: false })];
    expect(draftSections(rows)).toHaveLength(1);
  });
});

describe("summarisePending", () => {
  it("counts nothing when there are no drafts", () => {
    const summary = summarisePending([row(), row()]);
    expect(summary.total).toBe(0);
    expect(describePending(summary)).toBe("Published");
  });

  it("counts each changed section once, and reports the kinds", () => {
    const summary = summarisePending([
      row({ slug: "hero", draft_content: { title: "x" } }),
      row({ slug: "marquee", draft_position: 2, draft_visible: false }),
      row({ slug: "old", draft_deleted: true }),
      row({ slug: "untouched" }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.content).toBe(1);
    expect(summary.position).toBe(1);
    expect(summary.visibility).toBe(1);
    expect(summary.removal).toBe(1);
    expect(summary.slugs).toEqual(["hero", "marquee", "old"]);
  });

  it("reports a removal as a removal only, whatever else is pending", () => {
    expect(pendingChangeKinds(row({ draft_deleted: true, draft_content: { a: 1 } }))).toEqual(["removal"]);
  });

  it("describes the count for the header", () => {
    expect(describePending(summarisePending([row({ draft_content: {} })]))).toBe("Draft · 1 change");
    expect(
      describePending(summarisePending([row({ slug: "a", draft_content: {} }), row({ slug: "b", draft_position: 1 })])),
    ).toBe("Draft · 2 changes");
  });
});

describe("diffSnapshot", () => {
  const snap = [
    { slug: "hero", section_type: "hero", position: 0, visible: true, content: { title: "A" } },
    { slug: "marquee", section_type: "marquee", position: 1, visible: true, content: {} },
  ];

  it("reports nothing when the snapshot matches the live page", () => {
    const live = [
      row({ slug: "hero", position: 0, visible: true, content: { title: "A" } }),
      row({ slug: "marquee", position: 1, visible: true, content: {} }),
    ];
    const diff = diffSnapshot(snap, live);
    expect(diff).toEqual({ changed: [], missing: [], added: [] });
    expect(describeSnapshotDiff(diff)).toBe("Matches the live page");
  });

  it("flags a content difference", () => {
    const live = [
      row({ slug: "hero", position: 0, visible: true, content: { title: "B" } }),
      row({ slug: "marquee", position: 1, visible: true, content: {} }),
    ];
    expect(diffSnapshot(snap, live).changed).toEqual(["hero"]);
  });

  it("flags a position or visibility difference", () => {
    const live = [
      row({ slug: "hero", position: 3, visible: true, content: { title: "A" } }),
      row({ slug: "marquee", position: 1, visible: false, content: {} }),
    ];
    expect(diffSnapshot(snap, live).changed).toEqual(["hero", "marquee"]);
  });

  it("flags sections that no longer exist — restoring cannot bring them back", () => {
    const live = [row({ slug: "hero", position: 0, visible: true, content: { title: "A" } })];
    const diff = diffSnapshot(snap, live);
    expect(diff.missing).toEqual(["marquee"]);
    expect(describeSnapshotDiff(diff)).toMatch(/no longer exist/);
  });

  it("flags sections added since, which restoring would remove", () => {
    const live = [
      row({ slug: "hero", position: 0, visible: true, content: { title: "A" } }),
      row({ slug: "marquee", position: 1, visible: true, content: {} }),
      row({ slug: "new-banner", position: 2, visible: true, content: {} }),
    ];
    const diff = diffSnapshot(snap, live);
    expect(diff.added).toEqual(["new-banner"]);
    expect(describeSnapshotDiff(diff)).toMatch(/would be removed/);
  });

  it("compares against published content, not the pending draft", () => {
    const live = [
      row({ slug: "hero", position: 0, visible: true, content: { title: "A" }, draft_content: { title: "Z" } }),
      row({ slug: "marquee", position: 1, visible: true, content: {} }),
    ];
    expect(diffSnapshot(snap, live).changed).toEqual([]);
  });
});
