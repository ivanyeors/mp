# Slice 02 — Integrity pass: typed section types, locked slugs, validated images, guarded list, audit log

Type: AFK
Parent: PRD `page-builder-redesign` (`.claude/PRD-page-builder-redesign/page-builder-redesign-prd.md`)
Triage: needs-triage
User stories covered: 4–12

## What to build

Harden the existing page builder's write and read paths before anything is built on top of
them. Every item here is a live defect found in the audit, and each is independently
shippable — but they belong in one slice because they all live in the same three API route
files plus the section store.

Surfaces touched:

- **Content validation.** Section content is currently accepted as an opaque record of
  unknown values. Give it a real shape: validate `section_type` against the known union so a
  second `hero` or a typo'd type cannot be created, and validate any image field against the
  host allowlist the image optimiser is configured with. A non-allowlisted host currently
  throws during server render on a page with no error boundary, so a typo takes the homepage
  down.
- **Slug locking.** Slugs are editable on built-in sections whose components branch on the
  slug to choose their copy, image and call-to-action. Renaming one silently blanks all three
  and orphans journey-analytics exit anchors. Reject slug changes unless the section type is
  a custom one.
- **Seed fallback.** The section store falls back to a hardcoded twelve-section seed layout
  whenever a query returns no rows *or* errors. That means hiding every section republishes
  the seed layout, and so does a transient database error. Fall back only when the table is
  genuinely empty; surface errors instead of papering over them.
- **List endpoint.** Listing sections is unauthenticated and returns hidden sections. Require
  the `page-builder` permission, matching the mutating routes beside it.
- **Rich text.** The rich-text section renders admin-authored HTML through
  `dangerouslySetInnerHTML` while its type documents the field as markdown. Store and render
  markdown using the markdown renderer already in the dependency tree, and relabel the editor
  field to match. This closes a stored-script path into the storefront and the type/label
  mismatch at once.
- **Reorder.** Reordering fires one update per section with no transaction and accepts a
  partial order, and position has no uniqueness guarantee. Make it a single statement over
  the full order.
- **Audit.** No landing-section mutation writes to the audit log that eleven other admin
  surfaces already use. Record create, update, delete and reorder with the section slug.
- **Dead code.** Delete the section-store helper that has no callers.

Reuse rather than rebuild: the permission guard, the audit recorder, the markdown renderer
and the image host allowlist all already exist.

Demoable outcome: a staff member typing a bad image host gets a clear rejection instead of a
broken homepage; hiding every section yields an empty page rather than the original twelve;
a signed-out request to the list endpoint is refused; and every change appears in the audit
log.

## Acceptance criteria

- [ ] `section_type` is validated against the known union on create; an unknown type is rejected with a 400.
- [ ] Creating a second instance of a singleton section type (`hero`) is rejected.
- [ ] An image value pointing at a host outside the configured allowlist is rejected on save; allowlisted hosts and repo-relative paths are accepted.
- [ ] A slug change is rejected unless the section's type is a custom one; built-in slugs are immutable.
- [ ] The section store returns the seed layout only when the table has no rows at all — not when every row is hidden, and not on a query error.
- [ ] A query error keeps the seed fallback on the public page (a degraded homepage beats a 500 on a
      route with no error boundary) and is logged; the builder's own read throws instead, so Staff never
      edit a fallback believing it is their page.
- [ ] Listing landing sections requires the `page-builder` permission; an unauthenticated request is refused.
- [ ] The rich-text section stores markdown and renders it through the existing markdown renderer; `dangerouslySetInnerHTML` is gone from the landing section components, and the editor field is labelled markdown.
- [ ] Reordering applies the full order in a single statement and rejects an order that does not cover every section.
- [ ] Create, update, delete and reorder each record an audit entry naming the section slug.
- [ ] The unused section-store helper is deleted and nothing references it.
- [ ] `pnpm ci` passes.

Proof: `npx tsx --env-file=.env.local lib/page-builder/integrity.check.ts` → `landing-integrity self-check ok`

## Blocked by

- Slice 01 (glossary terms used in code comments and audit entries)
