# Slice 04 — Admin RMA queue + detail (role-gated)

Type: AFK
Parent: PRD `returns-rma` (`.claude/PRD-returns-rma/returns-rma-prd.md`) · GitHub #41
Triage: needs-triage
Covers: Child task 3, 6; Acceptance "staff can review", "audit logged"

## What to build

The operator back-office surface for RMAs, gated by the existing settings
permission model.

- Settings page (`app/[lang]/settings/...`) listing RMA requests with status filter + order/customer context; a detail view showing items, reason, photos, resolution type, and the `rma_status_events` timeline.
- Permission-gated exactly like other settings areas (RBAC from #36); non-permitted staff can't see/reach it.
- One mutating action wired end-to-end to prove the loop: staff internal note / mark-under-review, written via `recordAdminAction` (`lib/auth/audit.ts`) with before/after snapshot.

## Acceptance criteria

- [ ] Permitted staff see the RMA queue + detail; the route is gated for non-permitted roles
- [ ] Detail view renders items, customer note, photos, resolution type, and full status timeline
- [ ] The mutating action appends a status event and writes an `admin_audit_log` row via `recordAdminAction`
- [ ] Read/list uses admin data access (service role), not customer RLS paths

## Blocked by

- Slice 02
