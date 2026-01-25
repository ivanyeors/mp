## Purpose (LLM theme guidance)

Use this document whenever you touch **UI styling**: colors, backgrounds, borders, shadows, icons, imagery, states, or any component that might look different across themes.

**Hard rule:** every UI change must be evaluated for **both Light and Dark theme**. Assume nothing is “fine by default”.

---

## Non‑negotiable theme rules

- **Always consider both themes**
  - If you change a color/token/class in one place, check its appearance in **Light** and **Dark**.
  - If you add a new UI surface (card, sheet, popover, input, toast), ensure it has appropriate contrast in both.

- **Use theme tokens, not raw colors**
  - Prefer existing design tokens / CSS variables / utility classes.
  - Avoid hard-coded hex/rgb values unless the system already uses them as tokens.

- **Contrast + readability**
  - Text must remain readable on its background in both themes.
  - Secondary text must still be legible (don’t “dim” it into invisibility in dark mode).

- **Borders and dividers**
  - Borders that look subtle in light mode can disappear in dark mode (and vice versa).
  - Validate that dividers, outlines, and focus rings are visible in both themes.

- **States must work in both themes**
  - Hover/active/pressed
  - Disabled
  - Focus-visible
  - Selected/checked
  - Destructive/warning/success/info variants

---

## Common theme pitfalls (watch for these)

- **“Washed out” dark surfaces**: using light-mode grays in dark mode makes UI look low-contrast.
- **Invisible shadows in dark mode**: prefer tokens that adapt; sometimes borders work better than shadows.
- **Icon/illustration mismatch**: ensure SVG fills/strokes adapt (or use currentColor) so icons don’t vanish.
- **Skeletons/placeholders**: must have visible contrast in both themes.
- **Muted chips/badges**: muted backgrounds can become too close to the page background in one theme.

---

## Workflow: what the LLM should do

When implementing UI/styling changes:
- Identify the surfaces involved (page background, cards, popovers, inputs, buttons).
- Apply tokens/variables that adapt to theme.
- Validate interactive states in both themes.
- If adding imagery/icons, confirm they remain legible against both backgrounds.

---

## Theme review checklist (run before finishing)

- **Light theme**: background, text, borders, icons, and states look correct.
- **Dark theme**: background, text, borders, icons, and states look correct.
- **Focus ring**: visible and accessible in both themes.
- **Disabled/hover/active**: still distinguishable in both themes.
- **No hard-coded colors**: unless they’re official tokens.
