# Slice 13 — Claim pass over the blog (D2, follow-up)

Type: AFK copy
Parent: PRD `guides-content`
Triage: ready after slice 00

## What to build

- Point `lib/claims.check.ts` at `data/blogs/*.mdx` (body and frontmatter title/description; slugs are URLs and stay).
- Rewrite every hit to D2 wording. Today, 16 posts have 1–8 hits each.
- **Highest risk first:** `how-a-customised-pillow-can-help-with-sleep-apnea-for-cpap-users` (8 hits). Google's Health category example is "Medical devices for sleep apnea like CPAP machines", and a pillow presented as helping sleep apnoea reads as a medical purpose under GL-06. Either rewrite it as comfort for people who already use CPAP, on their doctor's advice, or retire it (410) under the content-audit rules. The owner chooses.
- Posts whose slugs say "pain-relief" keep their URLs. Their titles and H1s change.
- The three hub posts are gone by slice 06, so they are not in scope.

## Acceptance criteria

- [ ] `pnpm checks claims` passes over the blog; paste the before count and after count in the PR.
- [ ] Owner decision on the CPAP post recorded in the PR.

## Blocked by

Slice 00
