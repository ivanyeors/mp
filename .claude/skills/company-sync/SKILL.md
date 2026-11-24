---
name: company-sync
description: Copy the agent harness in company/ (manual, OKRs, one file per agent) to Google Drive, Agents / _company, where the scheduled agents read it, and keep each agent's scheduled task on the short loader. Use after any change to company/ is merged, when the Company page says instruction files differ from the code, or when someone asks to sync, publish or roll out an agent change.
---

# Company sync

The scheduled agents cannot read this repository. Each one reads two files from
Google Drive: `Agents/_company/manual.md` and `Agents/_company/agents/<id>.md`.
This skill copies `company/` there and checks the scheduled tasks still point at
those files. `company/README.md` explains the layout.

Drive folders (owner sg@mpillow.com):

| Folder | Id |
|---|---|
| Agents | `1Zxnuc9ko1AhWLIiKAnKDgLKWb7Mxxd4P` |
| Agents / _company | `1KJZVgvYzs4dz_txG69sUEimWX4CZXOnL` |
| Agents / _company / agents | `1RrY0fE2SwFxXyy9UJI7ym6IcuttfAMID` |

## Steps

1. Copy from `main` (or the branch the user names), never from unmerged work
   they have not approved: `git fetch origin main && git checkout origin/main -- company/`
   in a scratch worktree if your branch differs.
2. List what is in Drive: Google Drive `search_files` with
   `parentId = '<_company id>'` and with `parentId = '<agents folder id>'`.
   Note each file's id and size.
3. For each of `manual.md`, `okrs.md` and `agents/*.md`, compare with Drive.
   Upload by file reference, never by retyping the text: compute
   `sha256sum <file>`, then pass `base64Content` = `sha256:<hex>:<absolute path>`.
   The Drive connector cannot replace a file's content (`update_file` changes
   only its name and settings), so a changed file is a new copy:
   - `create_file` in the right folder, same title, `contentMimeType`
     `text/markdown`, `disableConversionToGoogleType` true.
   - Then `trash_file` the old copy. The loaders find files by title and skip
     trashed ones, so no scheduled task changes.
   - A file in Drive with no file in `company/`: leave it and tell the user.
4. Scheduled tasks (`list_triggers`): for every task in an agent's frontmatter
   `tasks` with `loader: drive`, its prompt must be the loader in
   `company/README.md` with that agent's name and id. Fix any
   that differ with `update_trigger` (prompt only). For `loader: inline`
   (Finance's invoice report, which has only the Gmail connector), the prompt
   is that task's section of `agents/fin.md`: paste it with `update_trigger`.
   A new agent with no scheduled task yet: ask the user before creating one.
   A task the user created in the claude.ai app (not by an agent) refuses
   `update_trigger`: give the user the loader text to paste into it there.
   Today that is SEO (`trig_0143EmTAMiseqotPitwFLe2p`).
5. Check: re-list both Drive folders and confirm every size matches
   `wc -c`; read one changed file back with `read_file_content`. The Company
   page (Analytics → Company) shows "Drive copy matches the code" once Drive
   is read again (Refresh).

Tell the user which files changed in Drive, which scheduled tasks you updated,
and anything left out of step.
