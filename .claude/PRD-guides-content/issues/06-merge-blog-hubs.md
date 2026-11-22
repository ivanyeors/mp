# Slice 06 — Merge the three blog hubs into their guides (D1)

Type: AFK
Parent: PRD `guides-content`
Triage: ready

## What to build

Before this slice, slices 03–05 have already moved each hub's best sections into its guide.

- **Hubs.** In `MERGED_BLOG_SLUGS`, 308 each hub to its guide, in every locale:
  - `what-is-the-best-pillow-for-neck-pain-in-singapore` → `/guides/neck-pain`
  - `the-ultimate-guide-to-cervical-support-pillows-for-neck-pain-relief` → `/guides/cervical-pillow`
  - `tailored-to-you-understanding-the-process-of-crafting-custom-made-pillows-for-better-sleep` → `/guides/custom-pillow`
  
  `MERGED_BLOG_SLUGS` maps slug to slug today. Guides are not blog slugs, so extend the type to allow a path target (`{ path: "/guides/neck-pain" }`) rather than adding a second map.
- **Flatten, so 69 old URLs land in one hop.**
  - The 27 `MERGED_BLOG_SLUGS` entries that point at a hub now point at its guide: neck pain 12, custom 11, cervical 4.
  - The 39 rows in `lib/shopify-redirects.ts` (and its fixture) that point at a hub now point at its guide: neck pain 18, custom 12, cervical 9.
  - Add the 3 hubs themselves.
- **Content.** Delete the three hub files from `data/blogs/`. The sitemap and llms.txt follow from the file list; confirm they do.
- **Links.** Re-point links in the 14 posts that link to a hub (`grep -rln` the three slugs in `data/blogs/`) and in `lib/seo/guides-content.ts`.
- **Housekeeping.** Ping IndexNow for the three guides and the 69 old URLs, and add one `seo_annotations` row: "Blog hubs merged into guides (D1)".

## Acceptance criteria

- [ ] `pnpm vitest run lib/__tests__/blog-redirects.test.ts` passes. It fails if any of the 69 URLs is two hops from its guide, if a redirect target is itself redirected, or if a hub slug answers 200.
- [ ] `grep -rn` for the three hub slugs in `data/blogs/` returns nothing.
- [ ] `curl -sI` on each hub slug and on 3 sampled Shopify URLs returns one 308 straight to the guide on the staged build (output pasted in the PR).

## Blocked by

Slices 03, 04, 05. Ship in the same release as the last guide.
