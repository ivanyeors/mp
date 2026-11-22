# Slice 08 — Videos: measure at home, studio fitting, cervical insert (in-house, D4)

Type: HITL (staff shoot) + AFK (embed)
Parent: PRD `guides-content`
Triage: ready

## What to build

- **Shoot.** Staff shoot three clips in the Singapore studio from the shot lists in `media-plan.md` §2. Kit: a phone, a clip-on mic, window light or one soft lamp, and a tripod. Get signed consent from anyone on camera who is not staff.
  1. **How to measure your shoulder width at home** (60–75 s). It replaces the third-party clip `r9XfezALQhA` on the Basic slide-in and in the custom-pillow guide.
  2. **What happens at a studio fitting** (75–90 s): measure, build, try on, adjust.
  3. **Cervical neck support: what it is and who it suits** (45–60 s).
- **Captions.** The narration describes everything shown, so captions cover WCAG 1.2.2 and no separate audio description is needed. Upload an edited caption file, not YouTube's raw auto-captions.
- **YouTube.** Upload to the Mpillow channel with the titles, descriptions and chapters in `media-plan.md` §2. Descriptions use D2 wording and link the matching guide.
- **Vertical cut-downs** (≤30 s) for TikTok and Reels, from the same footage.
- **Embed.** Use the existing nocookie facade inside the section each clip demonstrates, with the steps also written in the text. No VideoObject on guides (D4).
- **Allowlist.** Add the three IDs to the "our channel" list that `pnpm checks guides` reads.

## Acceptance criteria

- [ ] Each clip has edited captions on YouTube; each guide shows the same steps as text beside it.
- [ ] `pnpm checks guides` fails if `r9XfezALQhA` (third-party) is embedded anywhere in a guide, and passes after the swap.
- [ ] The Basic slide-in plays the new measuring clip (preview screenshot).

## Blocked by

None to shoot. Embeds need slice 02.
