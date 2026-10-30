# 16 — AI writing settings on General: on or off, the model, the effort and the limits

**Issue:** [#373](https://github.com/ivanyeors/mp/issues/373) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** done
**Blocked by:** none. Slices 09, 10 and 17 read it.
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

The owner's answer to decision 10: "make this a setting we can set in our general setting page".
The demo: on *Admin Panel → General*, the owner opens **AI writing**, sees Claude is configured,
the model (*Claude Opus 5.5*), the effort for whole drafts (*Medium*) and for quick actions
(*Low*), the limits per Staff member (10 in 10 minutes, 60 a day), and this month's use: *38
drafts, 51 quick actions, about US$3.40*. They lower the daily limit to 30 and save; the next
draft past 30 that day is refused.

## What to build

**The section** (`components/settings/ai-writing-section.tsx`), on `/settings/general` below the
review SLA section and behind the page's own permission (`api-configs`), in the same collapsible
card pattern as `ReviewSlaSection`:

| Setting | Control | Default |
|---|---|---|
| AI writing | switch: off hides every ✨ button in campaigns | on |
| Model | select, from the list in code | Claude Opus 5.5 |
| Effort for whole drafts (✨ Generate, ✨ Translate) | Low · Medium · High | Medium |
| Effort for quick actions (subject ideas, preview lines, rewriting a block) | Low · Medium · High | Low |
| Limit per Staff member, per 10 minutes | number, 1–50 | 10 |
| Limit per Staff member, per day | number, 1–500 | 60 |

- A status line above them: *"Claude is configured"*, or *"Set the Anthropic credentials in Vercel
  to use AI writing"* (`claudeConfigured()`, slice 09's shared client). No key is entered or
  stored here: the credentials stay in Vercel and the OIDC federation rule.
- **This month**, read-only: AI calls by kind, input and output tokens, and an estimated cost
  (tokens × the model's price in the list), counted from the `email_campaign.ai_*` audit entries
  (slices 09, 10, 17). Labelled as an estimate; the Anthropic Console has the bill. This is how
  the owner tests spend (PRD *Open*, D).

**The list of models** (`lib/ai/models.ts`): each entry is the model id, its label, its price per
million input and output tokens (from Anthropic's pricing page when it is added), and the effort
levels it accepts. It starts with Claude Opus 5.5 (`claude-opus-5-5`, US$4 / US$20). Adding a
model is a code change, so a typo in a setting can never call a model that does not exist.

**Storage and reading:**

- `site_settings` keys, seeded with the defaults by an idempotent migration (`insert … on conflict
  do nothing`), as other settings are: `ai_writing_enabled`, `ai_writing_model`,
  `ai_writing_effort_draft`, `ai_writing_effort_quick`, `ai_writing_limit_10min`,
  `ai_writing_limit_day`. `site_settings` is publicly readable; none of these is a secret.
- `/api/settings/ai-writing` [GET, PUT], `api-configs` permission, values validated with Zod (the
  model must be in the list and accept the chosen efforts). Each save is in the audit log
  (`settings.ai_writing`, before and after).
- `readAiWritingSettings()` (`lib/ai/settings.ts`, server-only) is read at every AI call. A stored
  value that no longer parses (a model removed from the list) uses that field's default. A
  failed read turns AI writing off for that call (*"Couldn't read the AI writing settings. Try
  again."*): a read error never turns on what the owner turned off.
- Review replies keep their settings in code (PRD decision 10).

## Acceptance criteria

- [ ] Changing the model or effort here changes the next ✨ call's request (tested with a fake
  client in slice 09's tests).
- [ ] Lowering a limit takes effect on the next call; switching AI writing off hides every ✨ button.
- [ ] A model id not in the list, or an effort the model does not accept, is refused on save.
- [ ] The month's estimate equals the sum over this month's audit entries of tokens × price.
- [ ] The section works at 375px and every control has a label.

## Verify

```bash
npx vitest run lib/ai components/settings "app/api/settings"
npm run typecheck && npm run lint
```
