# Slice 08 — Landing site: Page Builder, Partners, applications, commissions, Blogs, FAQ, Forms, Media

Type: AFK
Parent: PRD `permissions-view-edit`
Triage: blocked by 04
Status: todo
User stories covered: 6, 7
Owner review: **money**. `app/*/settings/partner-commissions/**` and `lib/commissions/**` are money paths, so it needs the `reviewer` subagent.

## What to build

Apply the page-slice rule (`issues/README.md`) to:

| Page | Writes move to | Notes |
|---|---|---|
| Page Builder | `page-builder-edit` | `/api/landing-sections*`, slide-in sections, `tiktok/resolve` |
| Partners | `partners-edit` | `/api/partners*`, `/api/partners-page` PATCH, `components/partner/*` actions |
| Partner applications | `partner-applications-edit` | approve, reject |
| Partner commissions | `partner-commissions-edit` | milestone rungs, payouts (`components/partner/milestone-rungs-actions.ts`) |
| Blogs | `blogs-edit` | blog writes |
| FAQ | `faq-edit` | `/api/faq/*`, `/api/page-faq/*` writes |
| Forms | `forms-edit` | `/api/settings/forms/*` writes |
| Media | `media-edit` | `/api/media*` writes, `/api/site-settings` writes |

**`requires: media`.** Page Builder, Blogs, Partners, Products and Campaigns require `media` because they mount the image picker. Picking an image is a read, and uploading is a write. So `<page>-edit` for those pages requires `media-edit`, and their View keys keep requiring `media`. Without this, an editor could not upload.

## Acceptance criteria

- [ ] `page-write-guard.test.ts` gains these folders, shown failing before and passing after.
- [ ] Catalog test: every page whose View requires `media` has an Edit key that requires `media-edit`.
- [ ] Route-gate tests: Media View-only can list media but gets 403 on upload; Partner commissions View-only gets 403 on a payout action.
- [ ] Preview screenshots as a View-only role.
- [ ] `reviewer` subagent verdict recorded.

## Blocked by

- Slice 04.
