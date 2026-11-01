# The sign-up is the Customer sign-in, and Staff sign in on their own tab

Status: Accepted (PRD `campaign-audiences` slice 03, owner, 2026-11-01). Replaces the slice's
first plan (a footer form with its own double opt-in email). Amends the glossary's **Sign in**
("role is decided after the session exists").

## Context

Slice 03 planned a newsletter sign-up for people who have not bought: a footer field, its own
`POST /api/newsletter` with a rate limit and a honeypot, a signed confirm link, a confirm email
on the campaign transport, and a Customer made on the click.

The owner asked on 2026-11-01 whether the sign-up should simply be the sign-in: the magic link
already proves the address, so it confirms the sign-up at once. It does. Sign in already sends a
link and a 6-digit code, and the first sign-in already finds or makes the Customer by the proven
email (`linkCustomerToAuthUser`). A second confirm email would be a weaker copy of the same proof.

The owner then asked for the page to serve customers and Staff with two tabs, Customer by
default, and for the two flows to be split very clearly. Until now one form served everyone and
the role was decided afterwards: a Staff member landed in the Admin Panel, everyone else on
Profile, and nothing kept a Staff sign-in from making a Customer row.

Two faults in the emailed link mattered more once it confirms a sign-up:

- **Mail filters spend it.** Corporate filters open every link to check it. Supabase's link
  verifies on open, so the filter uses up the one-time token and the person's click, and the code
  in the same email, fail as expired.
- **It works only in the browser that asked.** The PKCE link needs a verifier cookie from that
  browser, so an email opened on a phone fails.

## Decision

1. **One page, two tabs.** `/account/login` opens on **Customer**; an Admin Panel destination
   (or `?as=staff`) opens **Staff**, and so does this device's last tab. The Partner Hub keeps
   its own single form.
2. **Customer: signing in and signing up are one step**, with Google, the link or the code, and
   no password. The first sign-in makes their Customer at once, in the language of the page, so
   the CRM, the Lifecycle stage (*Lead*) and every campaign Audience see them immediately. Before,
   the Customer was made only on the first account page.
3. **A box on the Customer tab, ticked by default** (owner decision 1), with the same line as the
   other boxes, records consent `sign_in`. **The footer's "Get our emails"** sends the same link
   and records `newsletter`. Both are recorded only after the address is proven, on that person's
   own Customer, and only for someone nobody has asked, as every box does (ADR 0039). Neither
   re-subscribes someone who unsubscribed: after a footer sign-up the page offers them "Email me
   again", their own click, recorded as `account`.
4. **Staff: the Admin Panel and nothing else.** A Staff sign-in never makes a Customer and never
   records consent. An email that is not on the team is signed out again and told so on the Staff
   tab. A Staff member who signs in on the Customer tab is a customer for that visit, but the box
   is not recorded for them: a tick left out of habit must not put the team on the list.
5. **The intent rides in the link's return address** (`/auth/callback?next=…&as=…&consent=…&lang=…`)
   and every way of finishing (Google and the link through `/auth/callback`, the code, the new
   confirm page) ends in one function, `completeSignIn`.
6. **The emailed link lands on our own `/auth/confirm` page**, which spends nothing when opened.
   Its button verifies `token_hash` on the server, on any device. The Magic Link and Confirm
   signup templates link there; until they are pasted into the Supabase dashboard, the old link
   keeps working through `/auth/callback`.
7. **People see what it did.** A notice on the page they land on says they are on the list,
   already were, or (after a footer sign-up) that they unsubscribed before, with the way back.

## Consequences

- No newsletter endpoint, signed token, rate limiter, honeypot or confirm email to keep. Sign-up
  emails are Supabase's sign-in emails: they do not pass through the campaign sender, so its
  daily count does not include them.
- Supabase makes an unconfirmed login record when a link is asked for, as every sign-in request
  always has. No Customer and no consent exist before the click.
- Anyone can ask for a sign-in email to any address with any return address on this site. Because
  the sign-up consents act only on someone nobody has asked, the worst such a link can do, if its
  owner clicks a sign-in email they did not ask for, is subscribe that never-asked person, who
  sees the notice and can unsubscribe. It cannot bring back someone who left.
- A sign-in email still says "sign in". The two templates now add that signing in confirms an
  email sign-up, if they asked for one.
- Staff who habitually use the bare `/account/login` land on the Customer tab the first time on a
  device; after one Staff sign-in there, the page remembers.
