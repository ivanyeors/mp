# Slice 03 — Bilingual overrides: locale resolver + section language switch

Type: AFK
Parent: PRD `page-builder-redesign` (`.claude/PRD-page-builder-redesign/page-builder-redesign-prd.md`)
Triage: done
User stories covered: 13–17

## What to build

Close the live bug where an English override renders on the Chinese landing page.

Every built-in section resolves its copy as `content.field ?? messages.home.…`. Because a
**Landing section**'s content is a single untranslated blob, the moment **Staff** type an
English title the `zh-CN` page shows it too.

The fix goes in one place, not fifteen. Resolve content down to the active locale *before*
the section dispatcher hands it to a section component, so every section component keeps its
existing `?? messages…` line unchanged and future sections cannot reintroduce the bug.

Two rules make the resolver safe:

- A value counts as a locale map only when **every** key is a supported locale. Content
  already contains nested objects — a card's label/description pair, the neck-pains "how it
  feels" trio — and a looser rule would mistake those for translations.
- A bare string is treated as **English only**. Chinese then falls back to the translated
  default. This closes the bug with no data migration and makes every existing row correct.

The dispatcher currently renders one section type inline in its own switch rather than
delegating to a component, which would sit outside the resolver and reintroduce the bug for
that type. Extract it to a real section component so "resolved in one place" is actually true.

On the editor side, add a single language switch at the top of the inspector that re-binds
the whole form to the active locale. Per-field toggles were rejected: they would touch every
branch of the editor plus the card and paragraph sub-editors, which take arrays rather than
scalars.

Finally, two section types offered in the add-section dialog have no case in the editor at
all and fall through to "no editable fields" — and one of them renders a hardcoded English
button label on the Chinese page. Give both real editor cases and route their labels through
the same locale resolution as everything else.

Demoable outcome: **Staff** type an English hero title, switch the inspector to Chinese, type
a Chinese one, and each locale's page shows its own copy — while a section with only an
English override shows the translated default in Chinese rather than the English string.

## Acceptance criteria

- [x] A pure locale resolver projects a section's content to one locale and is applied once, before the section dispatcher.
- [x] A value is treated as a locale map only when every one of its keys is a supported locale; nested label/description and card shapes are passed through untouched.
- [x] A legacy bare string resolves for `en-US` and yields nothing for `zh-CN`, so Chinese falls back to the translated default.
- [x] No section component under `components/sections/landing/` needs a locale-handling change; their existing fallback lines are untouched.
- [x] The section type previously rendered inline in the dispatcher is extracted to its own component and goes through the resolver.
- [x] The inspector has one language switch per section that re-binds the whole form; saving writes under the active locale key.
- [x] Switching language in the inspector does not discard unsaved edits in the other language.
- [x] The Shop CTA and Featured Products sections have real editor cases instead of "no editable fields".
- [x] The Shop CTA button label is translatable and no longer a hardcoded English literal on the Chinese page.
- [x] Vitest covers the resolver: locale map, legacy string, nested non-locale objects, unknown locale, empty content.
- [x] `pnpm ci` passes.

Proof: `npx tsx --env-file=.env.local lib/page-builder/locale.check.ts` → `landing-locale self-check ok`

## Blocked by

- Slice 02 (content validation shape is settled first)
