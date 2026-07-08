# Product slide-in section templates

Agent playbook for learn-more slide-in inner content. **TypeScript types in `lib/product-slide-sections/` are the source of truth**; this doc mirrors them for composition.

Parent PRD: `.claude/PRD-product-slide-sections/product-slide-sections-prd.md`

## Hard rules

1. **Do not modify** landing pages (`components/sections/landing/`), homepage page builder, or `landing_sections` data.
2. **Do not change** slide-in shell chrome (sticky header, progress bar, close button, sticky footer structure).
3. **Do not delete** existing i18n copy, images, videos, or tables — refactor is layout extraction only; reorder per approved recipes is allowed.
4. **No product copy inside templates** — templates receive JSON-serializable `content` props; copy lives in `m.slides.*` i18n.
5. **Media in config, copy in i18n** — image paths, video IDs, and CTA `href` values belong in per-product section config files, not locale files.

## Architecture

| Layer | Location | Role |
|-------|----------|------|
| Content schemas | `lib/product-slide-sections/types.ts` | `SplitHeroContent`, `FeatureCarouselContent`, … |
| Section config | `lib/product-slide-sections/section-config.ts` | `{ type, contentKey?, flip?, image?, … }` arrays |
| Resolver | `lib/product-slide-sections/resolve-slide-content.ts` | `contentKey` + messages → typed content |
| Product configs | `lib/product-slide-sections/configs/` | Per-product section arrays (e.g. `basic-mpillow.ts`) |
| Templates | `components/product-sections/` | Presentational layout only |
| Renderer | `components/product-sections/product-slide-section-renderer.tsx` | `type` → template; merges config media + resolved content |
| Wrapper | `components/product-sections/product-slide-section.tsx` | `px-4 md:px-6 py-6 md:py-8`, optional `border-t` |

Slide-in files stay thin shells: existing Sheet wrapper + `<ProductSlideSectionRenderer sections={…} messages={m.slides.{product}} />`.

## v1 template catalog

| `type` | Role | Implemented |
|--------|------|-------------|
| `product_slide_section` | Wrapper — padding, optional border-top | yes (`ProductSlideSection`) |
| `split_hero` | Text + optional list/table \| image; `flip` | yes |
| `split_hero_dual_media` | Full-width hero + 2-col text/media | slice 03 |
| `full_bleed_media` | Wide comparison or hero image | slice 04 |
| `media_intro` | Full-width image + eyebrow/title/description | slice 04 |
| `trust_strip` | 3–4 icon/label trust items | slice 03 |
| `icon_list` | Title, intro, bullets, conclusion | slice 03 |
| `feature_carousel` | Horizontal swipe cards | yes |
| `feature_card_grid` | Static benefit cards | slice 04 |
| `firmness_compare` | Text + `FirmnessScale` bars | yes |
| `spec_table` | Title + table + footnotes | slice 03 |
| `size_guide_split` | `split_hero` + embedded size table | yes |
| `video_section` | Title, description, YouTube embed | yes |
| `packaging_block` | Title, image, bullets, callout | slice 03/05 |
| `outcome_grid` | 2×2 benefit tiles | slice 05 |
| `testimonial_card` | Quote + attribution | slice 05 |
| `text_callout_block` | Paragraphs + bordered callout | slice 04 |
| `commitment_cards` | Warranty/readjustment cards | slice 03 |
| `help_contact` | Title + contact line | slice 03 |
| `purchase_panel` | **Complex** — Mbolster gallery/price/selectors | slice 05 |
| `measurement_grid` | **Complex** — Premium 4-step measurement cards | slice 03 |

## Approved recipes (section order)

**Basic Mpillow:** `split_hero` → `firmness_compare` → `feature_carousel` → `size_guide_split` → `video_section`

**Premium Mpillow:** `split_hero_dual_media` → `trust_strip` → `split_hero`(overseas) → `icon_list` → `feature_carousel` → `firmness_compare` → `split_hero`(accessory) → `spec_table` → `measurement_grid` → `packaging_block` → `video_section` ×2 → `commitment_cards` → `help_contact`

**Mbolster:** `purchase_panel` → `split_hero`(about) → `size_guide_split` → `packaging_block` → `outcome_grid` → `testimonial_card` → `feature_carousel`(story) → `split_hero`(discover)

**Cervical Neck Support:** `media_intro` → `split_hero`(why) → `full_bleed_media`(comparison) → `feature_card_grid`(benefits) → `text_callout_block`(difference)

## Adding a section

1. Define or extend the content interface in `types.ts`.
2. Add a discriminated config variant in `section-config.ts`.
3. Add an extractor in `resolve-slide-content.ts` (pure — no React).
4. Build the template in `components/product-sections/` using `ProductSlideSection` wrapper.
5. Register dispatch in `product-slide-section-renderer.tsx` and append to `IMPLEMENTED_SECTION_TYPES`.
6. Add config row to the product's section config file with `contentKey` + media props.
7. Run `npm test` — resolver/dispatch tests should cover new extractors.

## `split_hero` contentKey extractors (current)

| `contentKey` | i18n fields used |
|--------------|------------------|
| `hero` | `heroTitle`, `heroParagraphs`, `packagingTitle`, `packagingItems` |
| `sizeGuide` | `sizeTitle`, `sizeDescription`, `sizeTable` |
| `overseas` | `overseasTitle`, `overseasDescription` |
| `accessory` | `accessoryTitle`, `accessorySubtitle`, `accessoryDescription` |
| `why` | `whyTitle`, `whyDescription` |
| `about` | `heroTitle`, `heroDescription` |
| `discover` | `discoverTitle`, `discoverDescription` |

## Example config row

```ts
{
  type: "split_hero",
  contentKey: "hero",
  image: { src: "/m-pillow-518001-final-WEB.webp", alt: "Basic Mpillow" },
  cta: { href: "/mp-basic", labelKey: "bottomCustomise" },
}
```

## Content preservation checklist (before merge)

- Every paragraph, list item, table row, image `src`, `videoId`, CTA `href`, and selector option still present.
- Footer actions unchanged.
- Open triggers unchanged (Sheet trigger, controlled open, cervical event).

## Future settings (not built now)

Config shapes mirror future JSONB rows (`{ section_type, content, position }`). Same renderer can power a settings page builder later — no DB work in this PRD.
