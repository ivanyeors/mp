# Slice 06 — Merge the three blog hubs into their guides

Type: AFK (only if D1 = merge)
Parent: PRD `guides-content`
Triage: needs-triage

## What to build

- In `lib/blog-redirects.ts`, 308 these slugs to their guides in every locale:
  - `what-is-the-best-pillow-for-neck-pain-in-singapore` → `/guides/neck-pain`
  - `the-ultimate-guide-to-cervical-support-pillows-for-neck-pain-relief` → `/guides/cervical-pillow`
  - `tailored-to-you-understanding-the-process-of-crafting-custom-made-pillows-for-better-sleep` → `/guides/custom-pillow`
- Flatten chains: every post previously merged into those hubs, and every Shopify redirect pointing at them in `lib/shopify-redirects.ts`, now points straight at the guide.
- Remove the three hubs from `data/blogs/`, the sitemap and llms.txt. Re-point spoke links ("part of our guide to…") to the guides.
- Ping IndexNow for the guides and the redirected slugs. Add one `seo_annotations` row.

## Acceptance criteria

- [ ] `pnpm vitest run lib/__tests__/blog-redirects.test.ts` passes, and fails if any old slug is two hops from its guide.
- [ ] `curl -I` on each hub slug returns 308 to the guide on the staged build.
- [ ] No post body links to a hub slug.

## Blocked by

Slices 03, 04, 05 (ship in the same release as the last guide)
