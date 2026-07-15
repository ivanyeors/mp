# Slice 05 — Pre-order trigger + live CTA + waiting-time i18n

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 9–10, 14, 32

## What to build

Implement live **Pre-order** mode on Mpillow (full/basic) and Mbolster preview per ADR 0005:

- Trigger: required preference `stock_available <= 0` **or** composed sellable buildable `<= 0` (not soft low-stock badges).
- CTA: **Pre-order** when true; **Proceed** when false.
- Waiting-time section (fixed i18n): waiting window, email follow-up, Sign in to check **Result** status.
- Pure testable trigger module shared by UI.

Does not yet persist on Result (slice 06) or send restock email (slice 07).

## Acceptance criteria

- [x] Trigger module unit-tested for preference-zero, buildable-zero, and in-stock false cases.
- [x] Soft low-stock (e.g. qty 3) alone does not flip Pre-order.
- [x] Both configurators show Pre-order CTA + waiting section when triggered.
- [x] When not triggered, CTA is Proceed (not “Purchase”).
- [x] en-US and zh-CN waiting-time copy present.

## Blocked by

- Soft: slice 04 for accurate Mbolster preference stock (can stub pillow-first if needed).
