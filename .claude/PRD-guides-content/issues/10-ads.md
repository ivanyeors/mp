# Slice 10 — Ads: research ad groups to guides, buying searches to the configurator (D5)

Type: OPS (Google Ads account), owner sets budget
Parent: PRD `guides-content`
Triage: ready

## What to build

The full keyword lists, negatives and headlines are in `media-plan.md` §4.

- **Campaign split.**
  - **Research ad groups** land on the guides: neck pain → `/guides/neck-pain`, cervical → `/guides/cervical-pillow`, fitting → `/guides/custom-pillow`.
  - **Buying ad groups** land on `/mp-config`: "custom pillow fitting singapore", "buy cervical pillow singapore", brand terms.
- **Message match.** Each research ad's headline 1 mirrors the guide's H1 question. The guide's first button ("Find your size online") is the ad's call to action.
- **Copy.** D2 wording only: fit, support, alignment, comfort. No "relief", "pain-free", "treat" or "doctor". The Misrepresentation policy bans "an improbable result", and pain promises would pull the campaign into Health.
- **Audiences.** Build no remarketing list (your data segments) or Customer Match list from guide visitors. If the pages read as Health, those lists are "Not supported", and they could imply a condition. Retarget, if at all, from `/mp-config` starts, whose page is about fit.
- **Negatives** on every "custom pillow" ad group: photo, picture, print, printed, personalised, personalized, name, face, pet, cushion cover, corporate gift, wedding, baby.
- **AI Max.** Keep final URL expansion on only with URL exclusions: `URL contains` account, checkout, result, admin, partner and shop/cart (whole tokens). Review the search-terms report and landing pages weekly for 4 weeks.
- **Tracking.** Conversions: `/mp-config` start, appointment booked, order. Add a guide-to-configurator click as a secondary conversion.

## Acceptance criteria

- [ ] Ad groups, negatives and URL exclusions are live (screenshot in this folder).
- [ ] No ad is disapproved, or limited, for health or unreliable claims after 7 days.
- [ ] Landing page experience reads "Average" or better on each guide ad group after 2 weeks.
- [ ] The search-terms report shows under 5% photo-pillow queries on the custom ad groups after 2 weeks.

## Blocked by

Slices 03, 04, 05 (the guides the ads land on)
