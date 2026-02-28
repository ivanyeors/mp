## Purpose (LLM layout guidance)

Use this document as the **single source of truth** for implementing and editing **page + component layouts** in this repo.

It is meant for an LLM (and humans) to:
- Decide **which layout primitives/components** to use
- Apply consistent **responsive behavior** and **spacing**
- Avoid layout regressions (overflow, CLS, weird breakpoints)
- Provide a repeatable **layout review checklist**

If a request is *not* about layout (data fetching, business logic, auth, etc.), do not use this doc as the primary guide.

---

## Scope: what “layout” includes here

- Page structure: containers, columns, grids, headers/sidebars/footers, sticky regions
- Spacing + rhythm: padding, margin, gaps, section spacing
- Responsive behavior: breakpoints, wrapping, stacking, min/max widths, container queries if present
- Media layout: aspect ratios, cropping, poster frames, skeletons
- Overflow management: scroll regions, truncation, safe-area, fixed headers
- Accessibility layout constraints: focus order, logical DOM order (visual order ≠ DOM order)

Not layout:
- Copywriting
- API/data modeling
- State management (unless it affects layout measurement)

---

## Golden rules (follow these first)

- **Prefer simple CSS flow** before complex positioning:
  - Use flex/grid + gap, not manual margins between siblings.
- **DOM order stays logical** (keyboard and screen readers):
  - Avoid reordering content visually in a way that breaks reading order.
- **Avoid layout shift**:
  - Reserve space for images/media using `AspectRatio` (below).
  - Prefer predictable heights for above-the-fold components.
- **Constrain width intentionally**:
  - Use a container/max-width pattern; avoid full-bleed by accident.
- **Never “fix” layout with magic numbers**:
  - If you must use an arbitrary value, explain why and look for a token/utility alternative.
- **Mobile-first**:
  - Start with a single-column layout; enhance at breakpoints.

---

## Layout building blocks (recommended patterns)

### Container + sections

- Use a consistent container for page content:
  - Typical pattern: centered content with a max width and horizontal padding.
- Use section wrappers with consistent vertical spacing:
  - Prefer `space-y-*` or `gap-*` (if using Tailwind) instead of repeated margins.

### Grid/flex decision guide

- Use **grid** when:
  - You need consistent columns/rows alignment
  - Cards should align in a masonry-like but still structured way
  - You need precise control over column spans at breakpoints
- Use **flex** when:
  - Layout is one-dimensional (row or column)
  - You need “push one thing to the end” (`justify-between`, `ml-auto`)
  - Chips/tags wrap naturally

### Common responsive layout recipes

- **Stack → split**:
  - Mobile: `flex-col`
  - Desktop: `flex-row` with a left fixed-ish column and right flexible column
- **Cards grid**:
  - Mobile: 1 column
  - Tablet: 2 columns
  - Desktop: 3–4 columns (keep card widths readable)
- **Sidebar**:
  - Mobile: off-canvas or collapsible (avoid always-visible sidebars)
  - Desktop: sticky sidebar with bounded height and its own scroll only if needed

---

## Media placeholders + aspect ratio (use this)

When you need an image/video placeholder (especially above the fold), always reserve space with:
- `@components/ui/aspect-ratio.tsx` (`AspectRatio`)

What it is:
- A thin wrapper over Radix `@radix-ui/react-aspect-ratio` root with `data-slot="aspect-ratio"`.

When to use:
- Any media block where the final asset loads async (images, thumbnails, posters)
- Skeleton placeholders for media
- Ensuring stable card heights in grids

How to use:
- Wrap the media content in `<AspectRatio ratio={W/H}>...</AspectRatio>`
- Inside, make the child fill the box (`w-full h-full`) and apply `object-cover` for crops (if using an `<img>`-like element)

Example pattern (placeholder + future image):

```tsx
import { AspectRatio } from "@/components/ui/aspect-ratio"

export function MediaCard() {
  return (
    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-lg bg-muted">
      <div className="h-full w-full" />
      {/* replace with actual <img /> / <Image /> later; ensure it fills */}
    </AspectRatio>
  )
}
```

Notes:
- Prefer common ratios: **1:1**, **4:3**, **16:9**, **3:4** (choose based on the design).
- Add `overflow-hidden` + `rounded-*` on the `AspectRatio` wrapper when you want clipped corners.

---

## Spacing + alignment guidance

- Prefer `gap-*` on flex/grid parents over child margins.
- Align baselines for text-heavy rows when possible; otherwise center align.
- Use consistent vertical rhythm:
  - Section spacing > component spacing > intra-component spacing
- Avoid “double padding”:
  - If a container has horizontal padding, inner sections generally should not.

---

## Mobile ergonomics (touch-first rules)

### Selects: dropdown → slide-up drawer on mobile

When the layout changes into **small screens / mobile view**, any “select-style” UI that would normally open a dropdown/popover should instead use a **slide-up drawer (bottom sheet)** interaction.

- Use **dropdown/popover** on larger screens (pointer + more space).
- Use a **drawer** on mobile (thumb-friendly, avoids clipped popovers, easier scanning).
- The selected value + label should remain visible in the trigger in both modes.
- Keep the same options + semantics; only the **presentation** changes.

Implementation note (high level):
- Use a breakpoint-aware switch (media query hook / responsive rendering) so the same “Select” control renders either Popover/Dropdown or Drawer content depending on screen size.

### Tappable areas (minimum hit target)

Interactive elements on mobile must have a **minimum hit target of 44×44 px** (or equivalent).

- Buttons, icon buttons, row actions, chips, dropdown triggers, and list items should be sized/padded to hit this minimum.
- If visual density is required, keep the **hit area** large even if the **icon/text** looks compact.

### Mobile padding (reduce chrome, not tap targets)

On mobile, it’s OK to use **smaller layout padding** (to maximize content), but:
- Do **not** reduce padding in a way that shrinks hit targets below the minimum.
- Prefer reducing **outer container padding** before reducing **internal control padding**.

---

## Overflow + sizing pitfalls (avoid these)

- Avoid `h-screen` unless you truly need viewport height; prefer `min-h-[...]` patterns.
- If a child needs to scroll:
  - Ensure its parent has a bounded height and that `min-h-0` is applied in nested flex layouts.
- Avoid `position: fixed` for headers unless you also add top padding/margin to prevent overlap.

---

## Implementation workflow (how to apply this doc)

When asked to implement a layout:
- Identify the layout type: **single column**, **stack→split**, **cards grid**, **sidebar**, **dashboard**
- Choose primitives: container + grid/flex + section wrappers
- Add stable media sizing using `AspectRatio` if there’s any media
- Verify responsive behavior at typical breakpoints (small → medium → large)
- Run the checklist below

---

## Layout review checklist (use before finishing)

- **Responsiveness**: Works from small to large without horizontal scrolling.
- **Width**: Content is readable; line lengths aren’t overly wide.
- **Spacing**: Consistent gaps; no random one-off margins.
- **Media**: Uses `AspectRatio` where needed; no CLS.
- **Overflow**: Scroll regions behave; nested flex has `min-h-0` where needed.
- **A11y**: DOM order matches reading order; focus order makes sense.
- **Sticky/fixed**: Doesn’t overlap content; safe-area considered if relevant.

---

## Homepage recipe (marketing landing)

Use this recipe for the homepage layout in `[app/page.tsx](/Volumes/Crucial%20SSD%202TB/Projects/mp/app/page.tsx)`.

Source content reference (structure only, not copywriting):
- `[info/mpillow_final_report.md](/Volumes/Crucial%20SSD%202TB/Projects/mp/info/mpillow_final_report.md)` → **Homepage** section (e.g. Hero, Pick your Mpillow, Why choose, Review, Customers, Founder note, Innovation).

### Section map (recommended order)

- **Sticky top bar**: Logo + anchor nav + `ModeToggle`
  - Anchor nav targets: `#ambassadors`, `#pick`, `#why`, `#review`, `#stories`
  - Style: `bg-background/60 backdrop-blur border-b` (theme-adaptive)
- **Hero**: stack→split (copy + CTAs | media)
  - Media block uses `AspectRatio` to reserve space.
- **Ambassadors / how it’s made** (`#ambassadors`): split section with media placeholder + CTA
- **Pick your Mpillow** (`#pick`): 3-card grid (“three levels of customisation”) + primary CTA repeated after the grid
- **Why choose / neck pain** (`#why`): statement + benefits list (icon rows) + CTA
- **Credibility strip**: 3 proof tiles (award / years / patents)
- **Review** (`#review`): featured media placeholder + CTA
- **Customers** (`#stories`): testimonials grid + CTA
- **Founder note**: long-form quote card + CTA
- **Innovation challenge**: chip/grid of “elements” placeholders + CTA

### Container + spacing defaults

- Page wrapper: `min-h-screen bg-background`
- Content width:
  - Hero container: `max-w-6xl`
  - Most sections: `max-w-5xl`
  - Text-heavy sections: `max-w-3xl` for readable line length
- Section spacing: `py-12 md:py-16` with inner rhythm `space-y-6 md:space-y-8`
- Prefer `grid gap-*` / `flex gap-*` over child margins.

### Media placeholders (ratios)

Always reserve space with `AspectRatio` to prevent CLS:
- **Hero media**: `16 / 9` (desktop), acceptable to clamp height with `max-h` via parent if needed.
- **Ambassadors/video**: `16 / 9`
- **Pick cards thumbnails**: `4 / 3` (keeps cards readable in grids)
- **Review feature**: `16 / 9`

Placeholder styling recommendation (theme-adaptive):
- Wrapper: `overflow-hidden rounded-xl border bg-card/40 backdrop-blur-sm`
- Inner: `h-full w-full bg-muted/40` (optional subtle gradient)

### CTA placement rules

- Always include:
  - **Primary CTA** above the fold (Hero).
  - Repeat the **Primary CTA** after any long “decision” sections (at minimum after `#pick` and `#why`).
- When using placeholder CTAs (unknown routes), keep them visually as buttons but disable interaction:
  - Use `disabled` or `aria-disabled` and label them explicitly as placeholders.

### Dock-safe bottom padding

This app uses a fixed bottom `AppDock` (`components/ui/app-dock.tsx`). Ensure the homepage never ends underneath it:
- Add a bottom padding buffer on the main content wrapper, e.g. `pb-28 md:pb-24`
- Prefer safe-area friendly spacing: `pb-[calc(7rem+env(safe-area-inset-bottom))]` when using arbitrary values.

---

## Useful additions (suggestions for future)

- Add a shared `Container` component (or standardize a container class) to avoid per-page drift.
- Add layout “recipes” as small reusable components:
  - `PageHeader` (title + actions + breadcrumbs)
  - `TwoColumnLayout` (stack→split with sensible defaults)
  - `CardGrid` (responsive columns + gap tokens)
- Add visual regression snapshots for key layout pages (to catch spacing/breakpoint regressions).
