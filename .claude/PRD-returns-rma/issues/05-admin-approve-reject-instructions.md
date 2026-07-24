# Slice 05 — Admin approve / reject + instructions-sent (+ emails)

Type: AFK
Parent: PRD `returns-rma` (`.claude/PRD-returns-rma/returns-rma-prd.md`) · GitHub #41
Triage: needs-triage
Covers: Child task 3, 4, 6; Acceptance "move through lifecycle", "approved/rejected email", "audit logged"

## What to build

The core review actions that drive the state machine, each audit-logged and
each firing its lifecycle email.

- Admin detail actions: **Approve**, **Reject** (with reason), **Send return instructions** — every transition validated through `canTransition` (slice 02), appends an `rma_status_events` row, and calls `recordAdminAction`.
- Emails (idempotent, RMA-keyed ledger from slice 03): **approved**, **rejected**, **return instructions**. Instructions email carries return address / reference placeholders wired to settings.
- Illegal transitions are refused server-side (e.g. can't approve a `rejected` RMA).

## Acceptance criteria

- [ ] Staff can approve, reject (with reason), and send instructions from the detail view; each writes a status event + `admin_audit_log` entry
- [ ] Each action sends exactly one corresponding email (idempotent); re-clicking doesn't re-send
- [ ] Server rejects transitions not permitted by the state machine
- [ ] Rejected/approved reasons are visible in the timeline

## Blocked by

- Slice 03
- Slice 04
