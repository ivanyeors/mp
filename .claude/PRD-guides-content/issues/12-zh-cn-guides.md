# Slice 12 — Full zh-CN guides (D6, follow-up)

Type: AFK translation draft + HITL fluent review
Parent: PRD `guides-content`
Triage: later (start when slices 03–09 are live)

## Why later

Census 2020: Mandarin is the most-spoken home language for 46% of Chinese residents aged 35–54 and 55–74. Dialects add another 21% among 55–74s. The audience is real. Translating while the English is still moving would double the claim review, so this waits until the English guides are live and checked.

## What to build

- `data/guides/<topic>.zh-CN.md` for each guide, from the live English version. Use 简体中文 as Singapore writes it (e.g. 新加坡, 量身定制, 颈椎枕), not mainland marketing idiom.
- A fluent reviewer (staff or a paid native speaker) edits the draft. No raw machine output ships.
- The claims check runs on the Chinese text with the zh list in `lib/claims.ts`.
- Diagram captions are HTML text, so they translate with the page; the SVGs need no change.
- Videos keep English narration, with Chinese captions uploaded to YouTube.
- The physio's check covers meaning, not language. If the Chinese health sections differ in substance from the checked English, the credit is left off the zh-CN page until re-checked.
- Retire the zh-CN entries in `lib/seo/guides-content.ts`.

## Acceptance criteria

- [ ] `pnpm checks claims guides` passes for zh-CN files.
- [ ] Each zh-CN guide is 1,800+ Chinese-equivalent words (or matches its English section count) and keeps hreflang pairs with en-US (`localeAlternates`).
- [ ] Preview screenshots of the three zh-CN guides, desktop and phone.

## Blocked by

Slices 03–09 live
