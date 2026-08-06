## Parent

PRD: Partner Hub — #70

## What to build

The **Referral** attribution rail (ADR 0015), end to end. Each approved partner gets a unique referral code; the hub shows a share card with the copyable link and a generated QR. Landing with `?ref=CODE` stamps the code on the **Visitor** (existing journey rail) with a **30-day window, last-touch overwrites**; the stamp is carried onto the **Result** at hold create and the **Order** at capture. Customers who arrived without the link can type the code in an optional "Partner / referral code" field on the customisation contact step (mp-config and mbolster-config) and on shop checkout, validated inline against active partner codes; a typed code outranks a link stamp. One Referral per Order, never split.

## Acceptance criteria

- [ ] Approved partner sees their code, copyable link, and QR in the hub
- [ ] Visiting `?ref=CODE` then completing a customisation hold → Result carries the partner attribution; capture → Order carries it
- [ ] Second partner's link within 30 days overwrites the first (last-touch); stamps older than 30 days do not attribute
- [ ] Typed valid code at contact step or shop checkout attributes and outranks any link stamp; invalid code shows inline error and does not block submission
- [ ] Attribution is single-partner per Order in all cases
- [ ] Self-reported Discovery source remains untouched and never attributes

## Blocked by

- #71
