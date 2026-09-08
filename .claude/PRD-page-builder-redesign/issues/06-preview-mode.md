# Slice 06 — Preview mode: shared renderer, admin-gated draft route, chrome and analytics suppression

Type: AFK
Parent: PRD `page-builder-redesign` (`.claude/PRD-page-builder-redesign/page-builder-redesign-prd.md`)
Triage: needs-triage
User stories covered: 30, 37–40

## What to build

A **Preview mode** render of the landing page showing draft content, safe to embed in the
builder. This is the data half of the new editor; slice 07 builds the shell around it.

**Reuse the real route, do not write a second renderer.** Extract the landing page's section
list into a shared server component and have both the public route and the preview route use
it, so preview and production cannot diverge.

**Gate on the admin context, not Next draft mode.** Draft mode was rejected: the root layout
already reads cookies, so every route is dynamically rendered and draft mode buys no cache
bypass we need — but it *costs* the Data Cache, and the reviews call it would uncache is a
paid external API cached for an hour. With a debounced reload per edit, that turns an editing
session into hundreds of billed calls. Its bypass cookie is also browser-wide, so **Staff**
would see draft content on the real site in every tab and believe they had published. Use a
query flag resolved against the existing admin context instead: draft content requires an
admin session, and anyone else gets published content.

**Suppress what a visitor would not see, and what must not be recorded.** The preview boots
the whole root layout, so without this the editor would:

- post a landing-page view to journey analytics, Google Analytics and Speed Insights on every
  reload — polluting the exact funnel the section anchors exist to measure. The journey path
  filter currently only excludes admin routes, and the preview's own path is the landing path.
- show the staff dock pill, which no shopper ever sees, over a fixed dock that covers the
  bottom of the frame.
- render the reviews section against the paid external API on every reload; use the existing
  fallback testimonials in **Preview mode**.

**Fix the anchors while here.** The page wraps each section in an element carrying the slug as
its id, and three sections then emit that same id again on their own root, while two more emit
ids that do not match their slug at all. Duplicate ids make scroll-into-view ambiguous, and
slice 07 depends on it. Remove the inner duplicates and reconcile the two mismatched ids.

Demoable outcome: opening the preview route as **Staff** shows the draft layout with visitor
chrome and no dock; opening it signed out shows the published page; and an editing session
records no analytics events.

## Acceptance criteria

- [ ] The landing section list is a shared server component used by both the public route and the preview route; no section markup is duplicated.
- [ ] The preview route returns draft content only for a request with an admin context; without one it returns published content.
- [ ] Next draft mode is not used, and no new bypass cookie is introduced.
- [ ] Journey analytics, Google Analytics and Speed Insights record nothing from a preview render.
- [ ] The staff dock pill, app dock, footer and analytics notice bar are not rendered in **Preview mode**.
- [ ] The reviews section uses fallback testimonials in **Preview mode**; the external reviews API is not called.
- [ ] Hidden sections are visibly marked in **Preview mode** rather than simply absent, so the visibility toggle has an observable effect.
- [ ] Every section anchor id on the landing page is unique; the three duplicated ids are removed and the two slug-mismatched ids are reconciled.
- [ ] The public landing route renders exactly as before — same sections, same order, same markup apart from the removed duplicate ids.
- [ ] Vitest covers preview gating (admin context yields draft, no context yields published).
- [ ] `pnpm ci` passes.

Proof: `npx tsx --env-file=.env.local lib/page-builder/preview.check.ts` → `landing-preview self-check ok`

## Blocked by

- Slice 05 (there must be a draft to preview)
