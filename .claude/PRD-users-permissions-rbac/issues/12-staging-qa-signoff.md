# Slice 12 — Staging QA signoff

Type: HITL
Parent: PRD `users-permissions-rbac`
Triage: needs-triage
User stories covered: all

## Setup

Three logins (Owner, Admin, and a custom role with only Results + Orders), one shared login with three Staff profiles, one Telegram account.

## Checklist

### Entry and redirects
- [ ] Sidebar shows **Users & permissions** under General; Admin Users and Staff Management are gone.
- [ ] `/settings/admins` and `/settings/staff-management?tab=telegram` land on the right tab.
- [ ] Custom-role login does not see Users & permissions; its URL shows the access-denied notice.

### Members and invites
- [ ] Invite a new email → email arrives with inviter, role, Sign in button.
- [ ] Sign in with that email (Google and, separately, magic link) → Member becomes Active with its first profile.
- [ ] Resend and Revoke work; Resend twice inside a minute is refused.
- [ ] Cannot change own role; cannot remove last Owner; Admin cannot grant Owner.

### Roles matrix
- [ ] Untick Orders on the custom role → that login's sidebar loses Orders on next navigation and `/api/shop/orders` returns 403.
- [ ] Tick Page Builder on a role → Media auto-ticks with the note.
- [ ] Cannot delete a role with Members; can after moving them.
- [ ] Phone width: matrix scrolls horizontally with sticky labels; mobile per-role list works.

### Staff profiles
- [ ] Existing names appear under the chosen login; Results' measured-by labels unchanged.
- [ ] Move a profile to another login; archive one → hidden from picker, still labelled on old Results.

### Telegram
- [ ] Existing review manager can Post on a "Send preview" card.
- [ ] Deactivate their login → their tap is refused with the "login" reason; reactivate → works.
- [ ] Remove the Telegram permission from their role → refused with the "role" reason; action checkbox shows disabled tooltip.

### Audit
- [ ] Each action above appears in Audit Log with a readable before/after.
