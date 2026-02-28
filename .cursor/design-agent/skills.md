---
description: When to use design-agent skills; consult this to route to the right skill for the task.
trigger: model_decision
---

# Design Agent Skills Router

Use this document to determine which skill(s) in `design-agent/` to load for the current task. Before implementing, scan the task for the domains below and load the matching skill(s).

---

## Skill → Task Mapping

| Skill File | Use When |
|------------|----------|
| `padding.md` | Spacing, gutters, section padding, card/panel padding, form layout, modal/sheet padding |
| `spacing.md` | General spacing rhythm, gaps, margins (when not padding-specific) |
| `animation.md` | Transitions, motion, micro-interactions, page transitions |
| `interaction.md` | Hover/focus/active states, gestures, touch targets, select/drawer behavior |
| `ux.md` | User flows, information architecture, accessibility, usability patterns |
| `component-import.md` | Adding or importing UI components, shadcn/ui usage |
| `background-effects.md` | Gradients, blur, overlays, visual effects |
| `content-structure.md` | Page structure, section ordering, content hierarchy |
| `product-strategy.md` | Product decisions, feature prioritization, positioning |
| `logic.md` | Pillow configuration, formula/calculation logic, product config |
| `review.md` | Post-implementation review (invoked by Task Master) |

---

## Routing Logic

- **Before implementing**: Scan the task for keywords/domains above; load the matching skill(s).
- **Design-heavy tasks**: Prefer loading `ux.md`, `interaction.md`, `animation.md` together.
- **Layout/spacing tasks**: Load `padding.md`, `spacing.md`, and cross-reference `.agents/rules/marketing-page/sections.md` and `layout.md`.
- **Marketing page UI**: Also consult `.agents/rules/marketing-page/ui-debug.md` for QA checklist.
