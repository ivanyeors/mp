# Assisted customisation 02: The Assist link — generate it, copy it, recognise it

Tracker: not yet filed (published locally)
Parent: PRD `staff-assisted-customisation` (`.claude/PRD-staff-assisted-customisation/staff-assisted-customisation-prd.md`)
Status: **Not started.**
User stories covered: 1–5

## What to build

One link per **Staff** member, generated the first time they ask for it, reusable forever, and recognised by the configurator exactly the way a partner code already is.

**The code.** A nullable `assist_code` column on `admin_users` with a partial unique index — the shape `0045_result_customer_access.sql` used for `access_token`, so a table full of nulls costs nothing and a duplicate is impossible. It is generated lazily, on first request, not backfilled: most **Staff** will never send a link, and a column full of live credentials nobody asked for is a liability. Copy `ensureReferralCode()` (`lib/referrals/index.ts:74`) whole — it reads, returns an existing code, otherwise loops up to five attempts writing a fresh code under an `.is(column, null)` guard so a concurrent writer loses the race rather than overwriting, and re-reads on collision. That retry loop is the entire reason to copy rather than reinvent.

**The resolver.** A `getStaffByAssistCode(code)` in a new `lib/assist-link/`, mirroring `getPartnerByCode()`: normalise, validate the format, look up case-insensitively, require `is_active`. It returns the **Staff** id. The client never sends an id — only the code — and the server never trusts anything else. An inactive or unknown code resolves to null and the configurator behaves as if no code were present, because a link that silently degrades to the normal flow is better than an error page for a customer who did nothing wrong.

**The copy surface.** A card in the **Admin Panel** modelled on `components/partner/referral-share-card.tsx`: a read-only input that selects on focus, a button that flips to "Copied" for two seconds, a `try`/`catch` that degrades to "the link stays selectable" when the clipboard API is unavailable, and the inline SVG QR code from `lib/qr/qr-matrix.ts` — no dependency, no external service, so it works on a studio machine with no network policy exceptions. The origin comes from `getClientSiteOrigin()`, never from `window.location`, so a link copied from a preview deployment does not send a customer to a preview deployment.

**The recognition.** `app/[lang]/mp-config/page.tsx` already resolves `?partner=` server-side and passes the result into the client; `?assist=` goes in beside it.

The assist gate on that page changed under this PRD (slice 14 of `PRD-staff-assist-spatial-fillings`, commit `f95cdc8a`): it is now `Boolean(staffCtx && roleHasPermission(staffCtx.role, "results"))`, not `Boolean(staffCtx)`, because `viewer` is the back-office read-only role and must not reach the editor. An **Assist link** is orthogonal to that gate and must stay a separate prop. The customer holding the link has no `admin_users` row at all, so `getAdminContext()` returns null and they cannot reach **Staff assist mode** by any route; a **Staff** member who opens their own link still gets the editor, because their session says so and not because the link does. Collapsing the two into one prop would hand the x-ray editor to every customer holding a link.

**The stamp.** When a resolved code is present, the **Draft Result** created by the configurator's first autosave carries `source: 'staff_assisted'` and the resolving **Staff** id. Because the token is minted only on create (`app/api/mp-config/responses/route.ts:352`), and `source` must not be rewritable by a later request, the stamp belongs on the create path alongside the token — and, like the token, must be ignored on update.

Demoable outcome: a **Staff** member opens the **Admin Panel**, copies their link, opens it in a private window, types a measurement, and the resulting row in `mp_config_responses` carries `source = 'staff_assisted'` and their id.

## Acceptance criteria

- [ ] A migration adds `admin_users.assist_code` as a nullable text column with a partial unique index on the non-null values, applied with `supabase db push`.
- [ ] The code is generated on first request, not backfilled, and a collision retries rather than failing.
- [ ] Two concurrent requests for the same **Staff** member's first code return the same code, not two.
- [ ] `getStaffByAssistCode` resolves case-insensitively, refuses an inactive **Staff** row, and returns null — never throws — for an unknown code.
- [ ] `/mp-config?assist=<valid code>` renders the ordinary configurator for a signed-out visitor, with no **Staff assist mode** chrome and no x-ray editor.
- [ ] `/mp-config?assist=<unknown code>` is indistinguishable from `/mp-config` for the visitor.
- [ ] A **Draft Result** created under a valid code carries `source = 'staff_assisted'` and the resolving **Staff** id; one created without a code is unchanged.
- [ ] `source` cannot be changed by a later update request to an existing row.
- [ ] The copy card renders the link and a scannable QR code, and degrades to a selectable input when the clipboard API is unavailable.
- [ ] The link uses `getClientSiteOrigin()`, so it is correct when copied from a preview deployment.
- [ ] The **Results** list badges a `staff_assisted` row distinctly from `manual` and `online_purchase`.
- [ ] Holding a valid **Assist link** grants no **Staff assist mode** chrome to a signed-out visitor, and the assist gate and the link remain separate props.
- [ ] `npx tsx lib/configurator/staff-assist.check.ts` passes before and after the change.
- [ ] `npm run ci` passes.
- [ ] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- 01 (the glossary names what `source = 'staff_assisted'` means)
