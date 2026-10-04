# Slice 01 — Glossary + ADR 0023 accepted

Type: AFK
Parent: PRD `users-permissions-rbac` (`.claude/PRD-users-permissions-rbac/users-permissions-rbac-prd.md`)
Triage: needs-triage
User stories covered: — (language for all slices)

## What to build

Land the domain language before any code uses it.

- `CONTEXT.md`: add **Member**, **Role**, **Permission**, **Owner**, **Staff profile**, **Telegram link**, **Users & permissions** (definitions and _Avoid_ lines from the PRD's "Domain language" table).
- Update **Staff** to read: "a signed-in, active **Member** (or bootstrap allowlist)".
- Update **Telegram operator** → point at **Telegram link**; remove "three separate lists" — they are now one tree (Member → Staff profile → Telegram link).
- Update **Staff assist mode** / **Assisted customisation** wording that says "gated on the `results` permission" only if the key changes (it does not in v1).
- `docs/adr/0023-…`: flip Status from Proposed to Accepted once triage confirms the PRD.

## Acceptance criteria

- [ ] All seven terms are in `CONTEXT.md` with _Avoid_ lines.
- [ ] No glossary entry still describes `mp_staff` or `telegram_operators` as unrelated to logins.
- [ ] ADR 0023 status reflects triage.
- [ ] `graphify-out/` refreshed in the same commit.

## Blocked by

None.
