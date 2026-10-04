# Users & permissions (RBAC) — Vertical Slices (Issues)

Tracer-bullet breakdown of the PRD (`../users-permissions-rbac-prd.md`). Each slice is a thin, demoable path through schema / auth / UI with its tests. Published locally (no external issue tracker configured).

**Triage label:** `needs-triage` (each slice)

## Slices

| # | Title | Type | Blocked by | User stories | Status |
|---|-------|------|------------|--------------|--------|
| 01 | Glossary + ADR 0023 accepted | AFK | none | — | todo |
| 02 | Permission catalog: one key per page (no behaviour change) | AFK | none | 3, 24, 37 | todo |
| 03 | Roles as data: `admin_roles`, `role_id`, backfill, context from DB | AFK | 02 | 4, 19, 22, 23, 24 | todo |
| 04 | Users & permissions page + Members tab + redirects | AFK | 03 | 1–3, 10–13, 15 | todo |
| 05 | Invites: email, Invited state, resend, revoke | AFK | 04, 07 | 5–9 | todo |
| 06 | Roles tab: permission matrix editor + custom roles | AFK | 04 | 14, 16–22 | todo |
| 07 | Staff profiles under logins | AFK | 04 | 9, 25–29 | todo |
| 08 | Telegram under RBAC | AFK | 06, 07 | 11, 30–35 | todo |
| 09 | Access-denied notice + audit coverage | AFK | 04 | 23, 36 | todo |
| 10 | "Working as" profile on shared logins (optional) | AFK | 07 | 38 | todo |
| 11 | Contract: drop legacy columns and code paths | AFK | 03–08 soaked in prod | — | todo |
| 12 | Staging QA signoff | HITL | 01–09 | all | todo |

## Dependency graph

```mermaid
graph TD
  s01[01 Glossary + ADR]
  s02[02 Catalog split]
  s03[03 Roles as data]
  s04[04 Page + Members]
  s05[05 Invites]
  s06[06 Roles matrix]
  s07[07 Staff profiles]
  s08[08 Telegram RBAC]
  s09[09 Denied notice + audit]
  s10[10 Working as - optional]
  s11[11 Contract]
  s12[12 Staging QA]
  s02 --> s03
  s03 --> s04
  s04 --> s05
  s07 --> s05
  s04 --> s06
  s04 --> s07
  s06 --> s08
  s07 --> s08
  s04 --> s09
  s07 --> s10
  s08 --> s11
  s01 --> s12
  s05 --> s12
  s08 --> s12
  s09 --> s12
```

## Recommended build order

1. **01** and **02** in parallel. 02 is the largest mechanical change and ships with zero behaviour change, so it is safe to land first.
2. **03** — the only slice that changes how access is resolved. Land and watch before building UI on it.
3. **04**, then **06** and **07** in parallel.
4. **05** (needs profiles for the first-profile-on-invite step) and **08** (needs both matrix and profiles).
5. **09** any time after 04.
6. **12** staging pass, then **11** after a week in production. **10** only if confirmed in triage.

## PR grouping

Suggested PRs, each one deployable on its own: **A** = 01 + 02 · **B** = 03 · **C** = 04 + 09 · **D** = 06 · **E** = 07 + 05 · **F** = 08 · **G** = 11. Every PR refreshes `graphify-out/` (cache deleted first) in the same commit.

## HITL notes

- **Before slice 03 / 07 / 08 migrations:** confirm PRD open questions 1–2 (which login owns existing staff names and Telegram operators; existing Owners stay Owner).
- **Slice 12:** device pass with three test logins (Owner, Admin, a narrow custom role) and one Telegram account.
