---
paths:
  - "supabase/migrations/**"
---

# Migrations

- Before changing a table or the meaning of a column, check every code path
  that writes it in `graphify-out/DATA_LAYER.md` ("Written by").
- Name domain concepts with the terms in `CONTEXT.md`; the wrong term
  produces the wrong schema.
- You may apply migrations. One that drops a table or column, truncates, or
  deletes or updates rows without a WHERE is blocked for Claude: write it, and
  say in the pull request that the owner must apply it.
