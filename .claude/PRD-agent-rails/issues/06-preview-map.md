# 06 — `preview map`: every page by the name a person uses

**Type:** AFK
**Blocked by:** none

## Goal

When the owner says "the orders page" or "the thing in the left sidebar", an
agent finds the route and the screenshot command without guessing. Read
first: `../agent-rails-prd.md` (decision 8), `.claude/skills/preview/SKILL.md`,
the `preview` script and its `lib/`, and how the Admin Panel and storefront
navigation name their pages.

## Requirements

1. **`.claude/skills/preview/preview map [words]`** prints one line per page:
   the name people see (navigation label, else the page's title), the route,
   and the `preview shoot` command for it. With words, only the pages whose
   name or route matches. It is generated from the app as it is on disk each
   time it runs: nothing is committed, so nothing goes stale.
2. **Every `page.tsx` appears.** A page with no label anywhere is listed under
   its route. A dynamic route shows its pattern and, where the preview
   fixtures hold a matching record, one path that works.
3. **Where a page has tabs or sub-views a person names** and they can be read
   from the code without running it, list them under the page with the
   `--click` that opens each. Skip this if it needs guesswork.
4. `SKILL.md` step 1 ("Pick the pages") points to `preview map`.

## Done when

- A test asserts every `app/**/page.tsx` in the repository is in the map, and
  that known names resolve (`orders`, `inventory`, `costings`, and one
  storefront page).
- Real output shown for `preview map`, `preview map orders` and one dynamic
  route; and one `preview shoot` of a path the map printed for a dynamic
  route, to prove the path works.
- `preview selftest` still passes.
