# Slice 02 — Post-auth redirect helper + callback + login already-signed-in

Type: AFK
Parent: PRD `dock-unified-sign-in` (`.claude/PRD-dock-unified-sign-in/dock-unified-sign-in-prd.md`)
Triage: done
User stories covered: 7–9, 14–17, 32, 45

## What to build

Add a pure `resolvePostAuthRedirect` helper and use it from:

- `/auth/callback` after a successful code exchange
- `/account/login` when the user is already signed in

Rules:

1. Staff + `next` under `/settings` → honor `next`
2. Staff + default account home `next` → Admin Panel (`/settings`)
3. Staff + other safe `next` (e.g. `/results/...`) → honor `next`
4. Non-staff + `next` under `/settings` → account home
5. Else → safe `next`

Ship an automated check covering at least those cases (prior art: `lib/auth/__tests__/admin-guard.test.ts`).

## Acceptance criteria

- [x] Pure helper encodes the redirect matrix above (no I/O inside the pure function).
- [x] Auth callback uses the helper after session exchange (with staff detection via existing admin context).
- [x] Account login “already signed in” branch uses the same helper (no blind `redirect(nextPath)`).
- [x] Non-staff cannot land under `/settings` via `next` alone.
- [x] Automated check fails if staff default, non-staff settings block, or staff `/results` honor regresses.

## Blocked by

None — can start immediately.
