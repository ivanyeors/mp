# Slice 08 — Publish history: snapshot list, restore into draft, retention

Type: AFK
Parent: PRD `page-builder-redesign` (`.claude/PRD-page-builder-redesign/page-builder-redesign-prd.md`)
Triage: needs-triage
User stories covered: 41–43

## What to build

The recovery path over the **Publish snapshot** table slice 05 created. The landing page has
no staging environment, so a bad publish is live to shoppers; restoring a previous one should
not mean retyping it.

A history panel listing snapshots newest first, each with when it was published and by whom,
and enough of a summary to tell them apart — section count and which sections differ from the
current published state.

**Restore writes into the draft layer, never directly into published state.** That keeps one
publish path and lets **Staff** review a restore in **Preview mode** before it goes live, which
matters because a snapshot can reference a **Media Asset** that has since been deleted. Restoring
replaces any pending draft, so it must warn first and say how many pending changes it will discard.

Restore records an audit entry naming the snapshot restored.

Use the repo's confirmation dialog, not a native browser confirm.

Demoable outcome: **Staff** publish a change, publish a second one, open History, restore the
first, see the restore land as a pending draft in the preview, and publish it to roll back.

## Acceptance criteria

- [ ] A history panel lists **Publish snapshots** newest first with publish time and author.
- [ ] Each entry summarises what it holds well enough to distinguish it from its neighbours.
- [ ] Restore writes the snapshot into the draft layer and never directly into published state.
- [ ] Restoring warns first, naming how many pending draft changes it will discard, using the design system's confirmation dialog rather than a native confirm.
- [ ] After a restore the header reflects the resulting pending-change count, and the preview shows the restored layout.
- [ ] A restore is recorded in the audit log naming the snapshot.
- [ ] Restoring a snapshot that references a since-deleted image does not break the builder; the missing reference is visible in the preview before publishing.
- [ ] Retention is enforced and the panel never lists more than the retained bound.
- [ ] `pnpm ci` passes.

Proof: `npx tsx --env-file=.env.local lib/page-builder/history.check.ts` → `landing-history self-check ok`

## Blocked by

- Slice 05 (snapshot table and publish function)
