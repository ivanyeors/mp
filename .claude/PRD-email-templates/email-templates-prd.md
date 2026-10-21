# PRD — Email templates: edit the words of every email

**Status:** v1 built on `claude/admiring-ride-40h2o6` (2026-10-21): Admin Panel → **Email
templates**, beside Email campaigns (`PRD-email-marketing`). It is live once the migration
`20261021110000_email_template_copy.sql` is applied to production.
**Owner request (2026-10-21):** "when we develop the email sending tool, we can also bring in all
emails templates that we will be sending that exists in our platform so we can also edit and save
them with ease as well".

## What it does

A page listing every email the platform sends to customers and partners, grouped by kind:

- orders and deliveries;
- returns;
- customisation;
- aftercare;
- the partner programme;
- partner applications.

Each email shows whether its words were edited, when, and by whom. Opening one shows:

- **Its words, field by field.** The subject, the inbox preview line, the heading, each message
  and closing line, and the button labels. Each field has the original words one click away
  ("Use the original words").
- **Fields per version.** An email with several versions shows the shared fields first, then
  each version's own fields. Examples are a customisation with or without a card hold, or a
  shipment with or without a tracking link.
- **Placeholders**, such as `{customer_name}`, `{order_number}` and `{refund_amount}`. Each is
  listed with what it becomes, and the email fills in its own value.
- **A live preview** with sample data, in any version of the email.
- **Save.** Every email of that kind sends with the new words within 30 seconds.
- **Back to the original words**, with a confirmation.
- **Send a test.** Sends the words on screen, saved or not, with sample data, through the
  mailbox those emails really go out from. Up to three addresses, with "[Test]" in the subject.

## What stays fixed, on purpose

**Words, not layout or data.** Order tables, amounts, addresses, tracking rows, codes, links,
the logo and the footer are added by the platform and cannot be edited. So an edit cannot drop
an order's items, a refund amount or a sign-in code, or break the design. Labels inside data
blocks ("Tracking number", "Authorized amount") are part of the data and stay fixed too.

**Never blocks a send.** A send reads the saved words, and every failure falls back to the
original words:

- no saved edit, or a failed read (`loadEmailCopy`);
- a saved field that no longer fits, such as a placeholder the email dropped since. That field
  falls back alone (`resolveEmailCopy`).

**Validated on save.** Every field must:

- be present, and not empty unless it is optional;
- fit its length limit;
- name only that email's placeholders.

Everything typed is escaped, so nothing becomes markup.

**Not editable here:**

- The sign-in code emails. Supabase sends them from its dashboard's templates
  (`scripts/build-auth-email-templates.ts`).
- Campaigns: each one is written on Email campaigns.
- Staff notices: support messages, the held-Result reminder, Admin Panel invitations.
- The Welcome-back voucher and the Shopify-move templates, which are being retired.

## Who can use it

A new permission, `email-templates` (*Email templates*, Store group,
`/settings/email-templates`), held by Owner and Admin through `grants_all`. Every action checks
it. Saves, resets and tests are in the audit log; a save records the words before and after, so
an edit can be recovered.

## How it is built

- **The copy framework** (`lib/email/copy.ts`). An `EmailCopySpec` holds:
  - the email's fields, each with label, default, hint, optional or multiline, a length limit,
    and its version group;
  - its placeholders, each with a description;
  - pure `defaultEmailCopy`, `fillCopy`, `validateEmailCopy`, `resolveEmailCopy` and
    `copyParagraphs`.
- **Each renderer takes its copy as an optional last argument**, defaulting to the spec's
  defaults. So a renderer stays pure, and a test or preview renders exactly as before. The HTML
  and the plain text are both built from the same filled fields.
- **Each send path loads the copy first.** `loadEmailCopy(spec)` (`lib/email/copy-store.ts`) has
  a 30-second cache, and saving clears it on that server. Send paths covered:
  - `sendOrderEmail`;
  - `sendRmaEmail`;
  - every customisation, aftercare, re-adjustment and partner send site.
- **The registry** (`lib/email/registry.ts`). Each entry carries its email's `copy` spec, and
  `render(fixture, copy?)`. Entries that are versions of one email share a spec; they are the
  editor's preview versions. The shipment emails gained "no tracking link" previews, so their
  second button label shows.
- **Storage.** `email_template_copy` holds one row per edited email: `template_id`, `copy` (jsonb
  object), `updated_at` and `updated_by_profile_id`. It is server-only. A save whose words equal
  the originals deletes the row instead.
- **The page** (`app/[lang]/settings/email-templates/`):
  - the list;
  - the editor (`email-copy-editor.tsx`);
  - the server actions (`actions.ts`), on `lib/email/copy-admin.ts`.

  A Campaigns / Templates switch sits at the top of both email pages.

## Tests

- **`lib/email/__tests__/copy.test.ts`.**
  - The rules: filling, paragraphs, validation, field-by-field fallback.
  - `loadEmailCopy`: its cache, and never throwing.
  - For every editable email in the registry:
    - its defaults are valid;
    - rendering with the defaults equals rendering with none;
    - every field's words appear in at least one of its versions, so no field is dead;
    - what Staff type is escaped.
- **A golden check during the build.** Every registered email was rendered before the change.
  With the default words, every subject and every HTML body is byte-identical after it.
  Customers see no change until someone edits. Only the plain-text versions changed, to be built
  from the same words as the HTML.
- **`app/[lang]/settings/email-templates/__tests__/email-templates.test.tsx`.**
  - The permission on the page and on every action.
  - Save, audited before and after.
  - A refused placeholder or empty field.
  - Original words store nothing; reset deletes.
  - The preview of a chosen version.
  - The test send: through the order mailbox, with "[Test]", at most three addresses.
  - The list.
- **`supabase/tests/email-marketing/assert-02-email-template-copy.sql`.** Grants, the id and
  object checks, one row per email, and `updated_at`.

## Not in v1

- **Editing layout, images or the data blocks' labels.**
- **Chinese copy.** Every email is English today, as the site's emails always were.
- **A version history to restore from.** The audit log has every earlier wording, to copy back by
  hand.
- **The Supabase sign-in emails.** Editing them here would need the Supabase Management API to
  push the template. They stay generated from code and pasted into the dashboard.
