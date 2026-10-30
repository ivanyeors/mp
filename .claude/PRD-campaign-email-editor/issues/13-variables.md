# 13 — Variables: drag a customer's first name, last name or points into any text

**Issue:** [#370](https://github.com/ivanyeors/mp/issues/370) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** done
**Blocked by:** 04 (the editor, its palette and `RichText`)
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:email`

## Goal

The owner asked for "variables a user can drag and build into the email templates / edm" (PRD
decision 3). The demo: in the palette's **Variables** tab, the owner drags *First name* into the
subject, so it reads *{First name}, sleep cooler this December*, then drags *Points balance* into
a paragraph: *You have {Points balance} points waiting.* They set the fallback words once (*there*,
and *some*), switch the preview between *A customer* and *No details*, and send a test that reads
*Mei Ling, sleep cooler this December*.

## What to build

**The catalogue** (`lib/email-campaigns/variables.ts`, pure). Each Variable has a key, a label,
one line saying what it is, a sample value for the preview, default fallback words, and how the
sender fills it. v1:

| Variable | Filled with | Sample | Default fallback | Offered |
|---|---|---|---|---|
| *First name* (`first_name`) | the customer's first name | Mei Ling | *there* | always |
| *Last name* (`last_name`) | the customer's last name | Tan | none: Staff write one | always |
| *Points balance* (`points_balance`) | available points, as `1,250` | 1,250 | none: Staff write one | only while points are live (`pointsLive`) |

A new Variable is one entry here and its value in the sender: a code change, reviewed like a
block type.

**In the editor:**

- The palette's **Variables** tab (`BlockPalette`, slice 04) lists them as chips. Drag one into
  any heading, text block, the subject or the preview line, or click it to insert at the cursor.
  Typing `{` in a text opens the same list, for the keyboard.
- In the text, a Variable is a chip showing its label (*First name*), never a code. Backspace
  removes it whole. It cannot go in a link, a button label or alt text.
- **Fallbacks, once per campaign.** Under the chips, every Variable the email uses has a
  *"If a customer has none, say:"* field, prefilled with the catalogue's default where it has
  one. Stored in `content.fallbacks` (slice 03). An empty fallback is a field error on save.
- *Points balance* is greyed while points are not live, with why (*"Points aren't live yet"*).
  The points rule counts it as a mention (`mentionsPoints`, `pointsCheck`).
- **The subject and the preview line** become single-line `RichText` inputs with Variables. They
  stay strings in their columns, with each Variable written `{first_name}`, the same syntax and
  the same parser (`placeholdersIn`, `lib/email/copy.ts`) Email templates use.
- **Preview as**: *A customer* (the sample values) or *No details* (the fallbacks), in the
  preview and the inbox row. A test send uses the sample values, so it reads like the real thing.

**At send** (`lib/email-campaigns/sender.ts`): each Variable is filled per recipient, escaped and
whitespace-collapsed as the greeting is today, at most 60 characters, or replaced by the
campaign's fallback words when the customer has none (an empty name, or a points balance of 0).
The send claim also returns `last_name` (a migration replacing the claim function; its other
columns unchanged), and the points balance is read with `readPointsBalance` only for a campaign
that uses it. The plain-text part is filled the same way. Today's *Start with "Hi first name,"*
switch stays, and in a block campaign it uses the *First name* Variable and its fallback, so a
campaign has one fallback for a first name, wherever it appears.

## Acceptance criteria

- [ ] A Variable dragged into a heading, a text block, the subject or the preview line renders the
  recipient's value in the sent email, and the fallback words for a customer without one.
- [ ] A campaign cannot be saved with a used Variable whose fallback is empty.
- [ ] *Points balance* cannot be placed while points are not live, and a campaign holding it fails
  `pointsCheck` if points stop being live before a wave.
- [ ] A customer's name containing `<`, `&` or a newline renders as text, not markup.
- [ ] Every drag has a keyboard way (`{`, or Enter on a chip), announced by name.
- [ ] Legacy campaigns with the greeting switch render exactly as before.

## Verify

```bash
npx vitest run components/block-editor lib/email lib/email-campaigns "app/[lang]/settings/campaigns"
npm run typecheck && npm run lint
```

Renderer tests with fixture recipients (a name, no name, a hostile name, 0 points); a sender test
that the points balance is read only when used; a component test dragging a chip into the subject
and into a paragraph; an SQL assert that the claim function returns `last_name`.
