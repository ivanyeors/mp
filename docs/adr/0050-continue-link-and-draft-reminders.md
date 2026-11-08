# A guest's Draft reopens from a continue link, and a guest who stopped is reminded 1 day, 1 week and 1 month later

Status: Accepted (PRD `guest-email-first` slices 02 and 04; owner, 2026-11-08: "1 day, 1 week,
1 month then stop"). Builds on ADR 0049.

## Context

ADR 0049 gave every guest's Draft Result an email, so Staff can reach a guest who stopped. Two
things still stood between that guest and paying:

- **Nothing to send them back to.** A Draft's answers are saved on the server as they are typed,
  but the configurator only read them back in the browser that typed them, and only to check the
  id was still a Draft. A reload started at the welcome; another device could not open it at all.
  *Request payment* needs a priced, assigned build, which a Draft is not.
- **Nobody reminding them.** A Draft only got followed up if Staff noticed it in Results and wrote
  to the guest by hand.

## Decision

### The continue link

**`/{lang}/mp-config?draft={id}&token={access token}` (or `/mp-basic`) reopens a guest's own Draft
on any device, where they carry on and pay through the normal hold.**

- **The proof is the token.** The page loads the Draft server-side
  (`lib/results/resume-draft.ts`) and opens it only when the link's token is the Draft's
  **Result access token**, it is still a Draft (`status` null), it is an Mpillow, and it is not an
  **Assisted customisation** (its Staff member's Assist link, not this one, is what makes it one).
  Anything else opens the ordinary configurator, so a stale or forged link learns nothing.
- **The device takes it over.** The configurator stores the Draft's id and token as its own
  session, fills the form with the saved answers, and removes the id and token from the address
  bar. It opens on the first question left unanswered, or on the preview once every one is: the
  welcome, *What to expect* and the optional photos are never stopped on
  (`lib/configurator/continue-draft.ts`). The guest's email is already there, so the first
  question does not hold up autosave.
- **The right configurator.** The first question's save now records where the Draft was started
  (`data.configurator`, `full` or `basic`), and the link opens that one. A Draft from before this
  opens in the full configurator.
- **Who measured it.** The page reads the Draft's `measured_by_type`, so a Draft Staff measured
  in the studio still shows the Measurement service when finished at home.

### The reminders

**A guest who gave their email on the first question and stopped before paying gets up to three
emails, 1 day, 1 week and 1 month after they last saved, each with the continue link. Then no
more.**

- **Whose Draft.** One whose email came from the first question (`data.configurator` is set), is
  an Mpillow, was not measured by Staff and was not sent by an Assist link: Staff follow those up
  themselves. One per email, the one saved last.
- **Consent.** Only to a Customer whose `marketing_email` is `subscribed`: the box beside the email
  on the first question, ticked by default (ADR 0039). The email is about something they started,
  not bought, so it is treated as marketing, as the Check-up reminder is. It is **sent like a
  campaign**: an Unsubscribe link in the footer and `List-Unsubscribe` on the send. A guest has no
  account to turn it off in, so that link is how they stop it, with the rest of our marketing.
  An address a campaign bounced from, or that reported one as spam, gets none, as
  `marketing_campaign_blocker` decides for campaigns. The Rest period does not apply: these answer
  something the guest did, and there are three at most. Nothing is sent while
  `UNSUBSCRIBE_SECRET` is unset.
- **When.** Counted from the Draft's last save (`updated_at`), so a guest who comes back and stops
  again is reminded from then. Each reminder has a window that closes when the next opens (1–7
  days, 7–30, 30–37). A day the job did not run never makes two arrive together, the day's
  reminder is skipped for a Draft first seen in the week's window, and an earlier reminder is never
  sent after a later one. Nothing saved more than 37 days ago is read, so turning this on does not
  write to old Drafts.
- **Stop.** After the 1-month email, which says it is the last. Sooner when the Draft is held,
  paid or sent to the build team (it is no longer a Draft), when a Result they started since was,
  or when they unsubscribe.
- **How.** Chained onto the daily `results-sla` cron (`lib/draft-reminders`), at most 100 a run.
  Each reminder is claimed in `customer_emails` (Customer, `results.draft_reminder_<1d|1w|1m>`,
  Draft) before it is sent, so a manual re-run sends nobody one twice. Outside production it goes
  only to `AFTERCARE_EMAIL_ALLOWLIST`, as the Aftercare emails do.
- **Switch and words.** On by default; *Remind guests to finish their pillow* under Settings →
  General → Review SLA turns it off (`draft_reminders_enabled`). Staff can reword it under Email
  templates (*Finish your pillow reminder*); the button, its link, the reason line and the
  Unsubscribe link stay in code.

## Considered options

- **Send to every guest with an email, consent or not.** It is about their own unfinished order,
  and they gave their email to save it. Rejected for now: it carries no offer but is still a
  commercial message they did not ask for, and the PDPA and the Spam Control Act should be read by
  counsel first, as for ADR 0039. If counsel agrees, drop the consent line in
  `planDraftReminders` and stop sending it like a campaign.
- **A counter and a clock on `mp_config_responses`**, as the payment reminders have. Not needed:
  `customer_emails` already guarantees one send per reminder, and the clock is the Draft's last
  save.
- **Make the Owner signed in, not the token, the proof.** A guest has no account, so the token
  is the only proof they can carry.

## Consequences

- A guest's Draft is now a thing they can come back to. Results can hand out the same link later
  (slice 03, *Send continue link*), and anyone holding a Draft's token can reopen it, which is why
  the link leaves the address bar once used.
- The default-ticked box now decides who gets these emails, so the share of guests who untick it
  is worth watching.
- Drafts saved before this change have no `data.configurator` and get no reminder; a link to one,
  if Staff build it by hand, opens in the full configurator.
