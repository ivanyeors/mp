# mp

The Mpillow platform: the storefront, configurators and Admin Panel for custom
pillows, bolsters and accessories, built on Next.js, Supabase and Stripe. It
replaces Shopify rather than running beside it. The Shopify code still here
(`app/api/shopify/`, `lib/shopify/`) serves only the move off Shopify (ADR 0029)
and gains no features.

## Run it

```bash
corepack enable
pnpm install
cp .env.example .env.local   # then fill in the values you need
pnpm dev
```

The app runs at http://localhost:3000. To see pages on made-up sample data
without any real keys, use the preview skill: `.claude/skills/preview/SKILL.md`.

## Check it

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm checks
```

`pnpm checks` runs the `*.check.ts` invariant scripts. The ones that need a
live database or a running site are skipped unless you pass `--live`. CI runs
all four on every pull request.

## Where things are written down

- `CLAUDE.md`: what an agent (or a new person) can't learn from the code.
- `CONTEXT.md`: the domain glossary.
- `.claude/PRD-*/`: one folder per initiative, with numbered issues.
- `docs/adr/`, `docs/data-flows/`, `docs/marketing-page/`, `docs/known-issues.md`.
