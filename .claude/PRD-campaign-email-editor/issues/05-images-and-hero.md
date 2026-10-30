# 05 — Images and the hero: from the Media Library, safe in every inbox

**Issue:** [#359](https://github.com/ivanyeors/mp/issues/359) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** done (rendering in real inboxes, light and dark, is checked in slice 12's matrix)
**Blocked by:** 03 (04 for the editor UI)
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:email`

## Goal

The owner adds a hero photo of the new cover from the Media Library, writes its alt text, links
it to the shop, and it shows in Gmail, Apple Mail and classic Outlook alike, sharp on a phone.
Nobody can delete that photo from the library while any campaign uses it.

## What to build

**Two block types:**

- `image`: a **Media Asset** id, `alt` (required, ≤ 150) or `decorative: true` (empty alt and
  `role="presentation"`), an optional link (https or a site target), width *Full* (600px) or
  *Inset* (440px), centred.
- `hero`: an image, then an optional heading, one line of text and a button, **stacked, never
  text on the image** (PRD decision 6: text over an image is lost when images are off, and
  breaks in dark mode and classic Outlook).

**Email renditions.** Media Library images are WebP masters up to 2,400px
(`lib/media-assets/optimize.ts`), and classic Outlook for Windows shows no WebP. So:

- When an image is placed in a campaign, the server makes an **email rendition** from the master
  with `sharp`: 1,200px wide (2× the 600px column), JPEG at quality 80, or PNG when the image has
  transparency; aimed at under 300 KB.
- Stored in the media bucket under `email/`, and recorded in a new `media_asset_renditions`
  table (`asset_id`, `kind = 'email_1200'`, `url`, `width`, `height`, `bytes`, `has_alpha`),
  made once per asset and reused.
- The renderer uses the rendition's absolute https URL with `width` and `height` attributes, and
  `style="display:block;max-width:100%;height:auto"`.

**Light and dark, by itself** (PRD decision 2, slice 15's rules). A photo needs nothing. An image
with transparency (`has_alpha`: a logo, a product cut-out) sits on a **light plate**, a padded
panel in the card's light colour that keeps its colour in dark mode, so dark ink never lands on
a dark background. The plate's class joins the shell's dark list. Nobody chooses any of this.

**Pick and manage:** the existing `ImagePicker` (`components/ui/image-picker.tsx`): library,
upload, or *Select from Drive*. Its alt text prefills the block's alt (the Media Asset's own alt),
and the block can override it.

**Used means used.** `email_campaigns` joins the Media Library's usage resolver
(`lib/media/image-usages.ts`, a new `ConsumerTable` reading `content`), so an image in any
campaign — draft, sent or archived — is **Used**, names the campaign, and cannot be deleted. A
sent email points at that URL forever.

**Readiness** (with slice 11): every image is a rendition at an absolute https URL that answers.

## Acceptance criteria

- [ ] An image placed from a WebP master is sent as JPEG or PNG, ≤ 1,200px wide, with width and
  height attributes.
- [ ] Missing alt text (and not marked decorative) is a field error on save.
- [ ] The Media Library shows the campaign under the image's usages and refuses its deletion.
- [ ] A hero's heading and button are real text and links below the image, in every client.
- [ ] A rendition is made once per asset, not once per campaign or per send.
- [ ] A transparent PNG renders on its light plate in dark mode (Apple Mail, Outlook.com); a
  photo renders with no plate.

## Verify

```bash
npx vitest run lib/email lib/email-campaigns lib/media-assets lib/media
```

A rendition test with a transparent PNG and a photo; a usage-resolver test for a campaign
referencing an asset; renderer snapshots for `image` and `hero`, light and dark.
