## Purpose (LLM section guidance)

Use this document as the **single source of truth** when implementing or editing **page sections** (marketing sections, landing sections, stacked blocks).

This doc is **sections-only**. For layout primitives outside section work, see `layout.md` in this folder.

---

## Scope: what counts as a “section”

A “section” is a top-level page block with:
- A wrapper container (usually `<section>`)
- Consistent vertical padding (top + bottom)
- One of two width modes (filled vs contained)
- A predictable content structure (below)

Not a section:
- Small in-component card blocks
- Modals/dialogs/sheets
- Global layout (header/footer/dock)

---

## Non‑negotiable rules (follow these first)

### Section padding (always top + bottom)

- **Every section wrapper must have top and bottom padding.**
- Default vertical padding tokens:
  - **Mobile**: `py-6`
  - **Desktop**: `md:py-8 lg:py-10`
- If a section is explicitly meant to be a “hero” or needs more breathing room:
  - Use `py-10 md:py-16` (avoid going beyond that unless instructed).

### Width mode: filled vs contained

Sections can be either:

- **Filled (full-bleed surface)**: the *section background* spans the full viewport width.
  - Use when instructions say “filled”, “full width”, “full bleed”, “tinted background”, etc.
  - Pattern: outer wrapper owns background + vertical padding; inner container owns max-width + gutters.

- **Contained (max container width)**: the section has no full-bleed background and content is bounded by a max width.
  - Only use when instructions explicitly call for a max container width (or the section is clearly part of a bounded content column).

**Hard rule**: Do not guess. If instructions don’t specify filled vs contained, default to **contained**.

---

## Required section content structure (in order)

Unless instructions explicitly remove/reorder an element, every section must follow this structure:

1. **Overhead text** (eyebrow / kicker)
2. **Title**
3. **Description**
4. **Content media** (image/video) or a primary content block
5. **Primary CTA** and optional **Secondary CTA**

Notes:
- Any of these can be omitted **only if instructed** (or if the section type truly doesn’t have it).
- Keep the order consistent for scanability and predictable rhythm.

---

## Canonical markup + spacing pattern (copy this)

Use this as the default skeleton. Adjust classes only when instructions require it.

```tsx
import { AspectRatio } from "@/components/ui/aspect-ratio"

type SectionCta = { label: string; href: string }

type SectionProps = {
  id?: string
  overhead?: string
  title: string
  description?: string
  primaryCta?: SectionCta
  secondaryCta?: SectionCta
  widthMode?: "contained" | "filled"
}

export function MarketingSection({
  id,
  overhead,
  title,
  description,
  primaryCta,
  secondaryCta,
  widthMode = "contained",
}: SectionProps) {
  const outer =
    widthMode === "filled"
      ? "w-full py-6 md:py-8 lg:py-10 bg-muted/30"
      : "w-full py-6 md:py-8 lg:py-10"

  const inner =
    widthMode === "filled"
      ? "mx-auto max-w-5xl px-3 md:px-6 lg:px-8"
      : "mx-auto max-w-5xl px-3 md:px-6 lg:px-8"

  return (
    <section id={id} className={outer}>
      <div className={inner}>
        <div className="space-y-4 md:space-y-6">
          <header className="space-y-2">
            {overhead ? (
              <p className="text-sm font-medium text-muted-foreground">
                {overhead}
              </p>
            ) : null}
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {title}
            </h2>
            {description ? (
              <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
                {description}
              </p>
            ) : null}
          </header>

          {/* Content: image/video/primary block */}
          <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
            <div className="h-full w-full bg-muted/40" />
          </AspectRatio>

          {(primaryCta || secondaryCta) ? (
            <div className="flex flex-wrap gap-3">
              {/* Primary CTA goes first */}
              {primaryCta ? (
                <a className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground" href={primaryCta.href}>
                  {primaryCta.label}
                </a>
              ) : null}
              {secondaryCta ? (
                <a className="inline-flex h-11 items-center justify-center rounded-md border px-5 text-sm font-medium" href={secondaryCta.href}>
                  {secondaryCta.label}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
```

Implementation notes:
- **Media must reserve space** using `AspectRatio` (per `layout.md`) to avoid CLS.
- **CTA hit targets** should remain comfortable; prefer `h-11` (44px) as a safe baseline.
- **Theme safety**: use tokens/classes that work in light and dark.

---

## Container sizing rules (choose intentionally)

Pick max widths based on the section’s content type:
- **Default section**: `max-w-5xl`
- **Hero**: `max-w-6xl`
- **Text-heavy** (long paragraphs): `max-w-3xl` (prevents overly wide line length)

If instructions specify a specific width, follow them.

---

## Spacing rules inside a section

- Prefer parent `space-y-*` / `gap-*` over manual child margins.
- Recommended internal rhythm:
  - Outer stack: `space-y-4 md:space-y-6`
  - Header stack: `space-y-2`
  - CTA row: `gap-3`

Avoid:
- Random one-off margins like `mt-7` unless matching an established token/rhythm
- “Double padding” (don’t add inner horizontal padding if the container already has gutters)

---

## Review checklist (run before finishing)

- **Padding**: section wrapper has top + bottom padding.
- **Width mode**: correctly applied (filled vs contained) per instructions.
- **Structure**: overhead → title → description → media/content → CTAs (primary then secondary).
- **Media stability**: uses `AspectRatio` (or otherwise reserves space) to avoid CLS.
- **Theme**: looks correct in both light/dark; no hard-coded colors.
- **Responsiveness**: no horizontal scroll; content stacks sensibly on mobile.
