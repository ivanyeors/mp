# Slice 09 — Editor completeness and accessibility

Type: AFK
Parent: PRD `page-builder-redesign` (`.claude/PRD-page-builder-redesign/page-builder-redesign-prd.md`)
Triage: done
User stories covered: 45–54

## What to build

Finish the inspector and make the builder operable without a mouse. Each item is a defect
found in the audit; they share the inspector and tree components, so they ship together.

**Card sections are dead UI.** The card editor only edits cards that already exist, and the
card array defaults to empty — so the two card-based sections show "using the defaults, edit
to override" with no way to start overriding. Add add, remove and reorder, and seed the array
from the current defaults the first time **Staff** edit it, so overriding does not mean typing
every card from scratch.

**Alt text is discarded.** The media picker returns alt text with every asset, and the
inspector's image field drops it on the floor. Carry it through and store it, so accessibility
is the default rather than a separate chore. Where a section renders an image with a hardcoded
or empty alt, use the stored value.

**Picking downgrades tracked assets.** Typing a URL into the image field passes a null asset id,
which overwrites the **Media Asset** link on a field that previously had one — silently turning
a tracked asset into an untracked string and breaking usage tracking. Preserve the existing
asset id unless the URL actually changes to something else.

**Missing fields.** The hero's two call-to-action labels are declared in its content type and
read by the component, but have no inspector fields.

**Unsafe and inconsistent destructive actions.** Reset clears a section's overrides with no
confirmation at all, while delete uses a native browser confirm. Both should use the design
system's confirmation dialog and say what will be lost. Add a guard so navigating away or
collapsing a section with unsaved edits warns rather than discarding silently.

**Accessibility.** The drag handle is pointer-only with no keyboard path — add move up/down
controls or keyboard drag so reordering is possible without a pointer. The visibility toggle
does not announce its state. The expand control has no accessible name at all.

**Images.** Three section types serve unoptimised masters through a raw image tag, including a
built-in. Uploads are already normalised to a capped WebP, so full-size masters are being sent
to small slots. Move them to the framework's image component.

Demoable outcome: **Staff** override a card section for the first time and it seeds from the
current cards; picking an image carries its alt text; and the whole tree can be reordered from
the keyboard.

## Acceptance criteria

- [x] Card sections support add, remove and reorder of cards.
- [x] Starting to override a card section seeds the array from the current defaults rather than an empty list.
- [x] Picking an image from the library carries its alt text into the section content.
- [x] Sections that render an image use the stored alt text where one exists instead of a hardcoded or empty value.
- [x] Editing the image URL does not clear an existing **Media Asset** id unless the URL genuinely changes.
- [x] The hero's two call-to-action labels have inspector fields.
- [x] Reset and delete both use the design system's confirmation dialog and state what will be lost; no native `confirm()` remains in the builder.
- [x] Navigating away or collapsing a section with unsaved edits warns instead of discarding silently.
- [x] Sections can be reordered using the keyboard alone, and the control is discoverable.
- [x] The visibility toggle announces its pressed state; the expand control has an accessible name.
- [x] The three section types using a raw image tag are moved to the framework image component.
- [x] `pnpm ci` passes.

Proof: `npx tsx --env-file=.env.local components/settings/page-builder/inspector.check.ts` → `page-builder-inspector self-check ok`

## Blocked by

- Slice 07 (inspector and tree live in the new shell)
