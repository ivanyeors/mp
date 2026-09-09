# PRD: Page Builder Redesign — Draft/Publish, Live Preview, Bilingual Overrides

Status: Shipped — all 10 slices merged and deployed to production 2026-09-09 (PRs #104, #105, #106); sign-off in `OPS-SIGNOFF.md`
Source: Page builder UX research + adversarial design review (Sep 2026); plan `page_builder_redesign`
ADRs: `docs/adr/0004-adopt-slide-media-onto-media-assets.md` (Media Asset consumers, prod read-only FS), `docs/adr/0007-first-party-journey-analytics.md` (section anchor ids must stay stable)
Glossary: `CONTEXT.md` — **Admin Panel**, **Staff**, **Media Asset**, **Used / unused**, **Answer lede**, **Copy fit (layout + SEO)**, **Page FAQ**, **FAQ surface**, **Product Builder**; new terms **Landing section**, **Section draft**, **Publish**, **Publish snapshot**, **Preview mode**
Research: Section-based editors beat freeform canvases when sections are code-owned React components; the Shopify theme-editor shape (section tree + live preview + inspector with click-to-select) is the closest match. Documented page-builder failure modes designed against: undo that dies at page close, Save/Publish separation users misread, div-soup that wrecks heading order and alt-text coverage.

## Problem Statement

The **Admin Panel** already ships a page builder for the landing page at Settings → Landing Site → Page Builder. It is a flat accordion list with drag-to-reorder, a visibility toggle, an add-section dialog, and a per-type form. It works, and it is the only CMS surface for the highest-value page on the site. But its shape causes three classes of failure that are live today:

- **It silently breaks the Chinese site.** A **Landing section**'s `content` is a single untranslated JSONB blob, and every built-in section resolves `content.x ?? m.home.x`. The moment **Staff** type an English title, `zh-CN` visitors get that English string too. Nothing warns them, and nothing in the UI even suggests the site is bilingual.
- **Every save is instantly live**, and this repo has no staging environment. There is no draft, no undo beyond the currently open form, and no way to see a change before shoppers do. The one "Preview" control opens the *published* site in a new tab — it can never show the edit being made.
- **The landing page is the LCP and AEO surface, and it is unguarded.** `CONTEXT.md` defines hard **Copy fit** bands for the home hero, and a validator implementing exactly those bands (plus banned clinical claims) already exists in the repo — but it only runs over i18n literals, never over the CMS override that actually ships. A 300-character H1, or copy claiming to "treat" or "cure", saves cleanly.

Underneath those, an audit found a set of integrity gaps that make the builder unsafe to extend: content is validated as an opaque record, so a typed image URL from a non-allowlisted host throws in server render on a page with no error boundary; hiding every section resurrects a hardcoded seed layout, as does any transient database error; the section-type field is an open string, so a second `hero` can be created; slugs are editable on built-in sections whose components branch on the slug, so a rename silently strips a section's copy, image and CTA and orphans journey-analytics anchors; the list endpoint is unauthenticated and returns hidden sections; and no landing-section mutation writes to the audit log that eleven other admin surfaces use.

Without this work, the only content surface **Staff** actually touch stays a surface they cannot use safely, in a language half the audience reads, on the page that earns the most.

## Solution

From a **Staff** perspective: open Page Builder and see the landing page itself, not a list of field names. Click a section in the page to edit it; edits accumulate as a **Section draft** that nobody else can see. Switch between English and Chinese, and between phone, tablet and desktop widths, to check the work. **Publish** when it is right; restore a **Publish snapshot** when it was not.

From a **shopper** perspective: nothing changes until Staff publish, the Chinese page stops showing English overrides, and the hero keeps meeting its **Copy fit** bands.

From a **developer** perspective: no new dependencies and no second renderer. The preview is the real landing route in an iframe on the same origin, so selection and scroll are DOM reads rather than a message protocol. Drafts are nullable columns on the existing table, so per-row concurrency and every existing consumer keep working.

What ships:

1. Glossary entries so the new nouns are shared language before any code.
2. An integrity pass over the existing builder — typed section types, locked built-in slugs, validated image URLs, a corrected seed fallback, an authenticated list endpoint, audit-log entries, and markdown instead of unsanitised HTML.
3. Locale-aware content overrides, resolved once in the render path, with a section-level language switch in the editor.
4. The existing **Copy fit** validator wired to the write path, with live character and word meters in the editor.
5. A **Section draft** layer and an explicit **Publish**, implemented as nullable columns plus one transactional database function.
6. A **Preview mode** render of the real landing route with visitor chrome and analytics suppressed.
7. The three-pane editor: section tree, live preview, inspector.
8. **Publish snapshot** history with restore.
9. Editor completeness and accessibility fixes.
10. A human sign-off slice covering both locales and a real device.

## User Stories

### Domain and glossary

1. As a developer, I want **Landing section**, **Section draft**, **Publish**, **Publish snapshot** and **Preview mode** defined in `CONTEXT.md`, so that the new surfaces have one name each.
2. As a developer, I want *Avoid* notes distinguishing **Publish** (landing content) from the **Rule graph** publish and from **Promote**, so that the three do not blur.
3. As a developer, I want **Preview mode** distinguished from the retired "Preview" link to the live site, so that nobody reimplements the old behaviour.

### Integrity and safety

4. As **Staff**, I want a mistyped image URL rejected at save time, so that I cannot take the homepage down with a typo.
5. As **Staff**, I want the landing page to keep serving my saved layout during a database blip, so that a transient error never republishes an old seed layout.
6. As **Staff**, I want hiding every section to produce an empty page rather than the original twelve, so that visibility means what it says.
7. As a developer, I want `section_type` validated against the known union, so that a second `hero` or a typo'd type cannot be created.
8. As a developer, I want slugs locked on built-in sections, so that renaming cannot strip a section's copy, image and CTA or orphan analytics anchors.
9. As **Staff**, I want section content stored as markdown and rendered safely, so that a rich-text section cannot inject script into the storefront.
10. As a developer, I want the landing-sections list endpoint to require the `page-builder` permission, so that hidden and unpublished content is not public.
11. As a business owner, I want every landing-section change recorded in the audit log, so that I can see who changed the homepage and when.
12. As a developer, I want reordering to be a single statement, so that a partial failure cannot leave duplicate positions.

### Bilingual content

13. As **Staff**, I want a language switch in the editor, so that I can write an override in English and in Chinese.
14. As a Chinese-speaking visitor, I want the page to fall back to the translated default when no Chinese override exists, so that I never see English copy in a Chinese layout.
15. As a developer, I want locale resolution to happen once in the render path, so that fifteen section components stay unchanged and future sections cannot reintroduce the bug.
16. As **Staff**, I want the Shop CTA and Featured Products sections to be editable, so that sections offered in the add dialog are not dead ends.
17. As a Chinese-speaking visitor, I want the Shop CTA button label translated, so that the section is not permanently English.

### Copy fit and SEO

18. As a business owner, I want hero copy that breaks the **Copy fit** bands rejected at save, so that the homepage keeps its layout and its answer-first structure.
19. As a business owner, I want banned clinical claims rejected in landing copy, so that marketing cannot introduce a compliance problem.
20. As **Staff**, I want a live character and word count against the band while typing, so that I can compress before I hit save rather than after.
21. As a developer, I want the same validator to serve i18n literals and CMS overrides, so that the two paths cannot drift.

### Draft and publish

22. As **Staff**, I want my edits held as a **Section draft**, so that an unfinished change is never visible to shoppers.
23. As **Staff**, I want a count of pending changes in the header, so that I know what a **Publish** will actually ship.
24. As **Staff**, I want a single **Publish** action that applies every pending change atomically, so that the live page is never half-published.
25. As **Staff**, I want to discard a draft, so that I can abandon an experiment without undoing edits one by one.
26. As two **Staff** editing at once, I want per-section drafts, so that my colleague's save does not discard my work.
27. As a developer, I want draft images to count as **Used** in the Media Asset library, so that nobody deletes an asset a pending draft depends on.
28. As a developer, I want replace-everywhere to keep reaching landing content, so that the DAM's replace flow does not desync from drafts.

### Preview

29. As **Staff**, I want the centre of the editor to show the real landing page, so that I judge the change rather than the field name.
30. As **Staff**, I want the preview to show my draft, so that preview means preview and not "the live site".
31. As **Staff**, I want to click a section in the preview and have it selected for editing, so that I do not hunt for it in a list.
32. As **Staff**, I want selecting a section in the tree to scroll the preview to it, so that the two panes stay in sync.
33. As **Staff**, I want a toggle between selecting and interacting, so that I can either pick sections or use the page's real controls.
34. As **Staff**, I want to preview at phone, tablet and desktop widths, so that I can check the layout the way visitors see it.
35. As **Staff**, I want the desktop preview to render at full desktop width and scale down, so that a narrow pane does not lie to me about the desktop layout.
36. As **Staff**, I want to preview in light and dark, so that my own theme does not decide what I sign off.
37. As a business owner, I want preview traffic excluded from journey analytics and from Google Analytics, so that an editing session does not pollute the funnel it is meant to improve.
38. As **Staff**, I want the preview to hide the staff dock and show visitor chrome, so that I see what a shopper sees.
39. As a developer, I want the preview to reuse the landing route rather than a second renderer, so that preview and production cannot diverge.
40. As a developer, I want the review-fetching section to use fallback testimonials in **Preview mode**, so that editing does not make paid API calls on every reload.

### History

41. As **Staff**, I want a list of previous publishes with timestamp and author, so that I can see what changed and when.
42. As **Staff**, I want to restore a **Publish snapshot** into my draft, so that I can recover from a bad publish without retyping.
43. As **Staff**, I want restoring to warn me that it replaces the current draft, so that I do not lose work in progress.
44. As a business owner, I want snapshot retention bounded, so that history does not grow without limit.

### Editor completeness and accessibility

45. As **Staff**, I want to add, remove and reorder cards in card sections, so that Why Choose and Credibility are actually editable.
46. As **Staff**, I want card sections to seed from the current defaults when I start editing, so that overriding does not mean typing everything from scratch.
47. As **Staff**, I want alt text carried over when I pick an image from the library, so that accessibility is the default rather than a chore.
48. As **Staff**, I want picking a library image to keep its Media Asset link, so that usage tracking stays accurate.
49. As **Staff**, I want to edit the hero's two call-to-action labels, so that fields the page already reads are reachable.
50. As **Staff**, I want a warning before I navigate away with unsaved edits, so that I do not lose them silently.
51. As **Staff**, I want destructive actions to use a real confirmation dialog, so that reset and delete are consistent and hard to hit by accident.
52. As a keyboard user, I want to reorder sections without a mouse, so that the builder is operable without pointer input.
53. As a screen-reader user, I want the visibility toggle and expand control to announce their names and states, so that I can tell what they do.
54. As a visitor on a slow connection, I want landing images served optimised, so that the page is not carrying full-size masters.

### Quality and verification

55. As a developer, I want pure helpers for locale resolution, draft merging and copy-fit validation covered by tests, so that behaviour is asserted without React or database wiring.
56. As a developer, I want each slice to leave a runnable self-check, so that a reviewer can verify it without reading the diff.
57. As **Staff**, I want a human sign-off pass on a real phone in both locales, so that the redesign is confirmed against reality before it is trusted.

## Implementation Decisions

### Approved design decisions (adversarial review)

| Decision | Resolution |
|---|---|
| Editor shape | Three panes — section tree, live preview, inspector. Section-based, not a freeform canvas: sections are code-owned React components and a canvas cannot keep them responsive. |
| Preview transport | Same-origin `iframe` of the real landing route. No postMessage protocol, no content-source-map encoding — those exist to cross origins, and there is only one origin here. |
| Preview gating | A query flag resolved against the existing admin context. **Not** Next draft mode: the root layout already reads cookies so every route is dynamic, and draft mode would drop the Data Cache and turn each reload into a billed reviews API call. |
| Click arbitration | A transparent overlay above the iframe, toggled between select and interact. Survives reloads and does not fight the page's real call-to-action controls, unlike injected listeners. |
| Draft storage | Nullable draft columns on the existing landing-sections table. A single shared draft row was rejected: whole-page last-write-wins is strictly worse than today's per-row writes. |
| Publish atomicity | One database function. The client library has no transactions, and a multi-statement publish can leave the live page half-updated. |
| Locale switch granularity | One switch per section, not per field. Per-field toggles would touch every branch of the editor plus the card and paragraph sub-editors. |
| Locale map shape | A value is a locale map only when every key is a supported locale — otherwise nested shapes such as a card's label/description pair would be misread as translations. |
| Legacy override semantics | A bare string counts as English only, so Chinese falls back to the translated default. Closes the bug with no data migration. |
| History | Append-only publish snapshots in their own table, written by the publish function, read only by restore. Never on the render path. |
| Copy-fit validation | Reuse the existing marketing-copy validator rather than writing a second one; wire it to the write path so both sources of copy share one gate. |

### Modules

| Module | Responsibility |
|---|---|
| Landing section store | Reads published and draft sections; merges a draft over its published row; owns the corrected empty-table fallback. |
| Locale resolver | Projects a section's content down to one locale before dispatch, so section components stay locale-agnostic. |
| Publish function | Applies every pending draft atomically, writes a snapshot, clears draft state, renumbers positions. |
| Landing section API | Validates section type, content, image URLs and copy fit; enforces the page-builder permission; records audit entries. |
| Shared landing renderer | The section list markup, used by both the public route and the preview route. |
| Preview route | Admin-gated draft render with visitor chrome, analytics suppressed and reviews stubbed. |
| Builder shell | Three-pane layout, selection state, device and locale toolbars, publish controls. |
| Section tree | Ordered list with drag and keyboard reorder, visibility, add and delete. |
| Inspector | Per-type fields, language switch, copy-fit meters, media picking. |

### Schema

- Landing sections gain nullable draft columns for content, position, visibility and a deleted marker. A row with no draft columns set has no pending change.
- A publish snapshot table stores the full ordered section array with a timestamp and author, bounded by a retention rule.
- Position gains a uniqueness guarantee so a partial reorder cannot collide.
- Row-level security is enabled on any new table in the same migration that creates it.
- Migrations are applied with the Supabase CLI push command only.

### API contracts (conceptual)

- Listing sections requires the page-builder permission and can return published or draft state.
- Updating a section writes draft columns rather than published columns.
- Publishing and discarding are distinct actions over the whole page, not per section.
- Restoring a snapshot writes into the draft layer and never directly into published state.
- Every mutating action records an audit entry naming the section and the field group changed.

### Interactions

- Selecting in the tree scrolls the preview to that section and opens its inspector.
- Selecting in the preview highlights the tree row and opens the same inspector.
- Editing debounces into the draft, then refreshes the preview.
- Hidden sections stay visible in the tree, dimmed, and are marked in the preview so the toggle has a visible effect.
- Publish shows a summary of pending changes before it applies them.
- Below the large breakpoint the editor falls back to the section list plus a full-screen preview sheet — one layout, not a second inspector.

## Testing Decisions

Good tests assert externally visible behavior only — the outputs of pure helpers and the invariants of stored data — not React internals, drag-and-drop mechanics, or database wiring.

| Module | Automated tests? | What to assert |
|---|---|---|
| Locale resolver | **Yes** | A locale map resolves to the active locale; a bare string resolves for English and yields nothing for Chinese; nested label/description shapes are not mistaken for locale maps; unknown locales fall through. |
| Draft merge | **Yes** | A draft overrides its published row field by field; an unset draft column changes nothing; a deleted marker removes the section from draft reads but not from published reads. |
| Copy-fit validation | **Yes** | Strings inside the band pass; over-length headlines, out-of-range ledes and banned clinical terms are rejected with a usable message; the same input gives the same verdict through both entry points. |
| Section type and image URL validation | **Yes** | Unknown types rejected; a second singleton section rejected; non-allowlisted image hosts rejected; allowlisted and relative paths accepted. |
| Empty-table fallback | **Yes** | An empty table yields the seed layout; a populated table with everything hidden yields nothing; an error does not silently yield the seed layout. |
| Publish function | **Yes** | Publishing clears draft state, applies content, position and visibility, and writes exactly one snapshot; a deleted-marked section is gone afterwards. |
| Snapshot retention | **Yes** | Retention keeps the newest entries and drops the oldest beyond the bound. |
| Preview gating | **Yes** | Draft content requires an admin context; a signed-out request gets published content. |
| Builder shell, tree, inspector | No | React composition and drag interactions — covered by the human sign-off slice. |
| Preview iframe sync | No | Cross-frame DOM behaviour; covered by the human sign-off slice. |

Prior art: `lib/i18n/assert-marketing-copy-safe.ts` and the `marketing-copy-slice-*` checks; `lib/page-faq/__tests__/`; `lib/spatial-fillings/__tests__/`. Each slice also leaves a runnable self-check following the repo's `*.check.ts` convention.

## Out of Scope

- Any page other than the landing page; no pages table, no multi-page CMS.
- Exposing learn-more slide-in section configs in settings (explicitly parked in `CONTEXT.md`).
- A freeform drag-anywhere canvas, per-element style controls, or custom breakpoints.
- Creating new section *layouts*; the catalog of section types is unchanged.
- Scheduled publishing, approval workflows, and multi-user presence or locking.
- Making the hero **Answer lede** or page metadata editable from the builder (recorded as a follow-up).
- Open Graph and Twitter image generation.
- Adding Product or AggregateRating structured data.
- Translating the builder's own admin interface.
- A content security policy or splitting the storefront and admin origins.

## Further Notes

The same-origin preview shortcut is load-bearing: it works because no framing headers and no content security policy exist, and because the storefront and the **Admin Panel** share an origin. That is worth an ADR before anyone adds `frame-ancestors` or splits the origins, and it is one reason the rich-text section must stop rendering unsanitised HTML.

Two findings are deliberately parked rather than fixed. The hero **Answer lede** is developer-only while the H1 is Staff-editable — backwards, given the lede is the stronger answer-engine lever — and the page's meta title is an English literal served on the Chinese page with no social image at all. Both are real, both are outside a builder redesign, and both should become their own slice.

The audit also found duplicate DOM ids on the live page today: the section wrapper sets an id and three sections set their own again, while two more emit ids that do not match their slug. Slice 06 removes the inner duplicates while it is already touching the render path, because the preview's scroll-into-view depends on those anchors being unique.

Section 02 is deliberately first among the code slices. It closes the failures that can break the live homepage and hardens the write path *before* a draft layer, a preview and a new shell are built on top of it — extending an unguarded surface would only multiply the ways it can go wrong.

See [`issues/README.md`](issues/README.md) for the vertical slice breakdown and build order.
