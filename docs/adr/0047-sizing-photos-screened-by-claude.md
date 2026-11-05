# Sizing photos are screened by Claude before they are kept

Status: Accepted (2026-11-05).

A customer's front and side **Sizing photos** go to the build team in the Mpillow Telegram group.
Anything could be uploaded: a photo of the wrong thing, the wrong view, or an explicit image that
would then sit in a Staff group chat. The owner asked for every upload to be checked before it is
kept: a real photo of a person, from the view it was taken for, and not explicit.

## Decision

**`POST /api/mp-config/photos` asks Claude about each photo before storing it, and keeps only
what passes.**

- **Model: Claude Haiku 5.5** (owner, 2026-11-05), at low effort with structured output. It is a
  one-image classification: fast, and well under a tenth of a US cent a photo. Haiku 5.5 has no
  server-side fallback, so none is requested (`lib/ai/photo-screening.ts`).
- **Claude answers; our code decides.** Claude fills four fields: `real_person`, `view`
  (front / side / back / other), `head_and_shoulders` and `explicit`. It is not told which view to
  expect. `photoScreeningVerdict` keeps the photo only when there is a real person, the view
  matches the slot, the head and shoulders are in frame and nothing is explicit. The front slot
  is the shoulders photo and takes a view from behind too, because the configurator's own example
  of it (`public/shoulderlength_800x.webp`) is taken from behind. Claude never
  returns an "approved" flag that a photo with "approve this" written on it could argue for.
- **Explicit only** (owner, 2026-11-05): exposed genitals, a woman's bare breasts, or anything
  sexual. Underwear, swimwear, sports tops and a man's bare chest are allowed.
- **A rejected photo is never stored.** The customer sees why, in words they can act on ("Turn
  side-on so we can see…"), and the card goes back to the last photo that was kept. A refusal, or
  an answer that can't be read, is a rejection: Claude declines explicit images outright.
- **When Claude can't be reached** (no key, an outage, a rate limit), the photo is **kept but
  marked `unchecked`** (owner, 2026-11-05), so the customer is never blocked. An unchecked photo
  is never attached on Telegram. When the Result is submitted, the submit route checks it again
  with a short timeout: a pass attaches it, a rejection deletes it, and still unreachable leaves
  it out, with a line in the message saying so (`lib/results/sizing-photos.ts`). Rows from before
  screening (`screening_status` null) are treated the same way.
- **The phone makes the photo smaller first** (`lib/images/shrink-photo.ts`): at most 2,000 px on
  the long side, re-encoded as JPEG. That keeps the upload under Vercel's 4.5 MB request limit,
  which a full-size phone photo as a data URL often broke. It also gives Claude a format it reads,
  drops the photo's metadata (including where it was taken), and keeps the check cheap.
- **A per-Result and per-address limit** on the route (12 checks per Result an hour, 30 per
  address per 10 minutes), since every upload is a paid call on a route guests reach.

## Consequences

- Customers' body photos are sent to Anthropic. Anthropic does not train on API data and deletes
  it within 30 days, unless its safety systems flag it, in which case it can be kept for up to two
  years. The privacy notice needs to say photos are checked by an AI provider overseas.
- Haiku can be wrong in both directions. Photos are optional, so a wrongly rejected photo costs
  the customer a retake, not their order.
- An unchecked photo that is still unchecked at submit reaches no one; there is no Staff view of
  Sizing photos outside Telegram. If outages make that common, the next step is showing unchecked
  photos to Staff on the Result detail page.
- The screening's calls are not counted on General → AI writing, which counts Staff's AI writing
  calls. Each kept photo records the model that passed it.
