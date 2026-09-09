# Slice 05 — Draft/publish spine: draft columns, publish function, snapshots, media walks

Type: AFK
Parent: PRD `page-builder-redesign` (`.claude/PRD-page-builder-redesign/page-builder-redesign-prd.md`)
Triage: done
User stories covered: 22–28, 44

## What to build

Put an explicit **Publish** between **Staff** edits and shoppers. Today every save is live
immediately, on a page with no staging environment behind it.

**Storage.** Add nullable draft columns to the existing `landing_sections` table — draft
content, draft position, draft visibility, and a draft-deleted marker. A row with no draft
columns set has no pending change. A separate shared draft row was considered and rejected:
one whole-page document means last-write-wins across the entire page, so two **Staff**
editing different sections would clobber each other. That is strictly worse than today's
per-row writes, and per-row drafts keep the current concurrency for free.

**Publish.** One database function applying every pending draft atomically: copy draft values
over published ones, drop draft-deleted rows, renumber positions, write one **Publish
snapshot**, and clear all draft state. The client library has no transactions, so a
multi-statement publish could leave the live page half-updated. Discard is the mirror: clear
draft state, touch nothing published.

**Snapshots.** An append-only table holding the full ordered section array with timestamp and
author, written by the publish function and bounded by a retention rule. It is never read by
the render path — slice 08 adds the restore UI over it.

**Media integration.** This is where a draft layer breaks things quietly if it is ignored:

- The Media Asset library's usage scan reads only the published content column, so an image
  referenced *only* by a pending draft would report zero usages, and **Staff** would delete
  an asset the draft depends on. `CONTEXT.md` is explicit that drafts count as **Used**.
- The DAM's replace-everywhere flow writes the published content column directly. If it does
  not also reach drafts, a replacement applied while a draft is pending gets reverted by the
  next publish — silently, weeks later.

Extend both walks to cover the draft column. They already deep-walk content, so this is
widening the selected columns, not new traversal logic.

**Header.** Show whether the page has pending changes and how many sections they touch, with
Publish and Discard actions. Publish summarises what it will ship before applying it.

Row-level security is enabled on the new snapshot table in the same migration that creates
it — the repo's RLS hardening migration exists precisely because tables were shipped without
it. Migrations are applied with `supabase db push` only.

Demoable outcome: **Staff** edit three sections, the header reads "Draft · 3 changes", the
live page is unchanged, Publish ships all three at once, and the header returns to published.

## Acceptance criteria

- [x] Migration adds nullable draft content, position, visibility and deleted-marker columns to `landing_sections`, and creates the snapshot table with RLS enabled and a service-role policy.
- [x] Migration is applied with `supabase db push`; the MCP `apply_migration` tool is not used.
- [x] Saving a section writes draft columns and leaves published columns untouched; the live page does not change.
- [x] Two sections edited concurrently by different sessions both retain their edits.
- [x] A publish database function applies every pending draft, removes draft-deleted sections, renumbers positions, writes exactly one snapshot, and clears draft state — all atomically.
- [x] A failure partway through publish leaves the published page exactly as it was.
- [x] Discard clears draft state and changes nothing published.
- [x] The builder header shows pending-change state and count, with Publish and Discard.
- [x] Publish shows a summary of pending changes before applying.
- [x] The Media Asset usage scan counts images referenced only by a draft as **Used**.
- [x] Replace-everywhere reaches draft content, so a replacement is not reverted by the next publish.
- [x] Snapshot retention keeps the newest entries and drops the oldest beyond the bound.
- [x] Vitest covers draft merge (override, unset column, deleted marker), publish effects, and retention.
- [x] `pnpm ci` passes.

Proof: `npx tsx --env-file=.env.local lib/page-builder/draft-publish.check.ts` → `landing-draft-publish self-check ok`

## Blocked by

- Slice 02 (hardened write path; publish must not ship content the write path would reject)
