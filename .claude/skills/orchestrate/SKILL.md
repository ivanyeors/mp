---
name: orchestrate
description: Run a PRD as its orchestrator. Hand each slice to a worker subagent (Opus 5.5), verify what comes back with the checks and a reviewer subagent, and send back anything not done. Run the session on Fable first.
argument-hint: "[PRD folder, e.g. .claude/PRD-loyalty-points]"
disable-model-invocation: true
---

# Orchestrate a PRD

You decide what gets built and judge what comes back. Worker subagents write
the code. Don't write code yourself.

This session should run on Fable (`/model fable`). Workers run on Opus 5.5:
`.claude/agents/worker.md` pins it. If this session is on another model, say
so and ask whether to continue.

## 1. Read and plan

Read the PRD in `$ARGUMENTS` and every file in its `issues/`. For each slice
note its status, its Type (AFK or HITL), its Blocked by, and the files it will
likely touch. Leave out slices already built.

- HITL slices need the user. Ask their questions now, before dispatching
  anything that depends on them.
- Order the AFK slices by Blocked by. Slices with no blocker between them, and
  no files in common, can run at the same time.

Show the plan (each wave of slices, and what runs in parallel) and confirm it
with the user once. Then run without checking in until something needs them.

## 2. Dispatch

Start one `worker` subagent per ready slice, in the background. Its brief:

- the issue file path
- the branch to create: `prd/<prd-name>/<NN>-<slug>`
- the branch to start from: `main`, or the branch of a blocker that has not
  merged yet
- that done means every acceptance criterion with a check that proves it, and
  that it must return the commands it ran and their real output
- whether to push and open a pull request (only if the user asked)

## 3. Verify every result

A worker saying it's done is not the verdict. For each one:

1. Check its reply: does every acceptance criterion have a check, and real
   output showing it passes?
2. Run the checks yourself in its worktree: `pnpm checks <changed files>` and
   `pnpm test <its test files>`.
3. Write the diff to a file (`git -C <worktree> diff main...HEAD > <scratch>/<NN>.patch`)
   and run the `reviewer` subagent with the issue path and that patch.
4. Anything missing or failing goes back to the same worker (message it by
   its id) with the specific gap and the evidence. Repeat until it passes.
   After three rounds on the same gap, stop and ask the user.

A slice that touches a money path (`.claude/rules/money.md`) is not done
until the reviewer has passed it.

## 4. Report

When every slice is done or blocked, give the user one table: slice, branch,
the checks run and their result, the reviewer's verdict, and what needs them
(HITL answers, a migration they must apply, a money change to review). Then
list the manual touchpoints you hit. Those are the next things to hand over.
