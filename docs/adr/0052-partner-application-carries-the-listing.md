# A Partner application carries the public listing, approval publishes it, and a pending applicant can withdraw

Status: Accepted (owner request, 2026-11-16). Amends the **Partner application** and **Partner
account** glossary entries (PRD `partner-hub`, issues 03, 04 and 11) on three points.

## Context

The owner, 2026-11-16, looking at the "Application under review" screen:

> Allow user to withdraw their application, prompt them that they will need to resubmit.
>
> Also do we have a process that is included in the sign up process, for them to upload photo of
> their logos, website what they do to show up in the partners page? Then when we approve, all of
> those will auto show up in the partners page as well.
>
> Partners can edit their own logo/content in the future too.

What the code did:

- The application asked for the website but not a logo or a public write-up: the glossary said
  "Address/logo/write-up are profile settings after approval, not application fields".
- Approval created the partner's **Location** row with `visible=false` ("approval never
  publishes"), so a newly approved partner did not appear on `/our-partners` until Staff found
  the row in Partners and switched it on, and then it showed with no logo and no write-up unless
  the partner had filled them in Partner Hub first.
- A pending applicant had no way out but emailing us. The `partner_users` row was insert-only.
- Partner Hub settings already let an approved partner edit name, logo, write-up and clinics,
  live on `/our-partners`. It did not let them edit the website.

## Decisions

1. **The application carries the listing.** It asks for a write-up of what the practice does
   (required, shown to customers) and a logo (optional). The logo uploads when picked, to
   `media/partner-logos/applicants/{auth user id}/` (`POST /api/partner/apply/logo`, signed in,
   not yet applied, rate-limited), and the application stores its URL. The submit refuses any logo
   URL that is not in the applicant's own folder in our storage. The questionnaire stores only
   its known fields. The "how will you introduce Mpillow" answer stays Staff-only. Clinic
   addresses stay a Partner Hub setting.
2. **Approval publishes the listing.** Approving copies the logo (again only one from the
   applicant's own folder), write-up and website onto the new Location row and saves it
   `visible=true`. The approve dialog has a "List them on Our partners now" switch, on by default,
   for Staff who want to hold a listing back; it can be shown later in Partners as before.
   No listing is published before approval.
3. **A pending applicant can withdraw.** The under-review screen previews the listing and has
   *Withdraw application*, which first says that the application will be deleted and that joining
   later means filling it in and agreeing to the terms again. Withdrawing deletes the
   `partner_users` row and the applicant's uploaded logos. It is not a status: nothing references
   the row, and the applicant returns to an empty form with a note that they withdrew. Only the
   applicant's own `pending`, unlinked row can go, and the delete is guarded on that, so it races
   safely with Staff: approve and reject now update only a row still in the status they read, and
   an approval that finds the row gone removes the Location row it just created.
4. **Partners keep editing their listing.** Partner Hub settings now edits the website too, shows
   whether the listing is on `/our-partners`, and can remove the logo. The profile save accepts a
   logo URL that is either one uploaded for that partner or the one already on their row (the
   applicant logo approval put there, or one Staff set), so saving without touching the logo no
   longer fails.

## Consequences

- Staff see the logo and write-up in the application queue and approve once; the partner is live.
- A logo from an application that is never approved stays in storage until the applicant
  withdraws. That is a small public image per signed-in applicant, bounded by the upload limit.
- Applications made before this decision have no write-up or logo; approving one publishes a
  listing with the name and website only, as the partner can fill in the rest in Partner Hub.
