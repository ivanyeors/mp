# 01 — Glossary terms and ADR 0054

**Type:** AFK
**Status:** **built** (2026-11-18)
**Blocked by:** none

## Goal

The words exist before the code: **Email funnel**, **Funnel step**, **Email flow**, **Automatic
email** in `CONTEXT.md` → Email marketing, and ADR 0054 recording that the page reads what is set
up, on the Lifecycle stages, and sends nothing.

## Acceptance criteria

- [x] `grep -n '^\*\*Email funnel\*\*\|^\*\*Funnel step\*\*\|^\*\*Email flow\*\*\|^\*\*Automatic email\*\*' CONTEXT.md` finds four terms.
- [x] `docs/adr/0054-email-funnel-reads-what-is-set-up.md` exists and `docs/adr/README.md` lists it.
