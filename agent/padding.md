
## Padding guardrails (AI must follow)

Padding is the **internal spacing** inside containers/components. Prefer adjusting **padding** (not margins) to create consistent gutters and readable density.

### Global rules
- **Use a consistent scale**: use Tailwind-style steps `p-2/3/4/6/8/10/12` (i.e. 8/12/16/24/32/40/48px) unless a component already defines its own padding API.
- **Mobile-first**: define base padding for mobile, then increase at breakpoints (e.g. `sm:`, `md:`, `lg:`).
- **Don’t mix arbitrary padding** (`p-[13px]`) unless matching an existing design token or aligning with an exact asset measurement.
- **Keep tap comfort**: interactive elements should have **at least 12px vertical + 12px horizontal internal padding** (or equivalent height), even when compact.

### Page-level padding (outer gutters)
- **Mobile (default)**:
  - **Page gutters**: `px-3` (12px) default; `px-2` (8px) for dense/admin screens.
  - **Top/bottom page padding**: `py-6` (24px) for standard pages; `py-4` (16px) if the page is dense/admin-like.
- **Desktop (`md`/`lg`)**:
  - **Page gutters**: `md:px-6 lg:px-8` (24–32px).
  - **Top/bottom page padding**: `md:py-8 lg:py-10` (32–40px).

### Section padding (stacked blocks within a page)
- **Mobile**: sections should default to `py-6` (24px). If a section is visually heavy (tables/canvases), use `py-8` (32px).
- **Desktop**: use `md:py-8 lg:py-10` (32–40px). Avoid going beyond 48px unless it’s a hero/landing section.

### Card / panel padding
- **Mobile**:
  - Default card padding: `p-4` (16px).
  - Compact card padding (only when many cards in a grid/list): `p-3` (12px).
- **Desktop**:
  - Default card padding: `md:p-6` (24px).
  - Dense admin panels: `md:p-5` (20px) if needed, but prefer `p-4 md:p-6`.

### Forms & field groups (internal padding in containers)
- **Mobile**:
  - Form container/panel: `p-4`.
  - Grouped subsections inside the panel: `p-3` or `px-3 py-2` for compact groups.
- **Desktop**:
  - Form container/panel: `md:p-6`.
  - Grouped subsections: `md:p-4`.

### Modal / sheet / drawer padding
- **Mobile**:
  - Content padding: `p-4`.
  - Header/footer areas: `px-4 py-3` (keep consistent with content gutter).
- **Desktop**:
  - Content padding: `md:p-6`.
  - Header/footer: `md:px-6 md:py-4`.

### Tables & dense data UIs
- **Mobile**:
  - Prefer horizontal scroll containers with **outer padding** `px-3` (or `px-2` if dense) so content doesn’t touch the screen edge.
  - Cell padding should stay readable: default to `px-3 py-2` unless the table component defines its own.
- **Desktop**:
  - Outer container/panel: `md:p-6`.
  - Cell padding: `md:px-4 md:py-2` for standard tables; `md:px-3 md:py-2` for dense tables.

### Responsive padding pattern (recommended)
- **Default**: `p-4 md:p-6`
- **Page gutters**: `px-3 md:px-6 lg:px-8` (use `px-2` on mobile if dense)
- **Section blocks**: `py-6 md:py-8 lg:py-10`

### When to reduce padding (allowed exceptions)
- **High-density admin screens** where more rows/cards must fit: reduce one step (e.g. `p-4 → p-3`, `md:p-6 → md:p-5`).
- **Icon-only controls**: keep at least `p-2` (8px) and ensure overall hit area remains comfortable.

