## What changed and why

## Done looks like

<!-- The acceptance criteria this meets. Link the PRD issue if there is one. -->

## Checks that prove it

<!-- The commands you ran and their actual output, or screenshots (say if they
     are sample data). "Tests pass" on its own is not enough. -->

Lint baseline (`node scripts/lint-baseline.mjs --against origin/main`):

## Risk

- [ ] Docs or copy only: may auto-merge once checks pass
- [ ] Touches money (Stripe, checkout, refunds, payment links, Costings or prices): second check by the `reviewer` subagent, result:
- [ ] Includes a migration the owner must apply
