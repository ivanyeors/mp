# 16: Low cleanup: escaped search, no raw DB errors, one lockfile, Reference photos private

**Type:** AFK
**Blocked by:** 13 (#179) (Reference photo permission lands first)
**User stories:** 45, 46, 47
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:storefront`, `area:admin`

## Goal

Close the remaining low-severity leaks and remove one privacy exposure.

## The gap, precisely

**1. PostgREST filter injection.** `lib/ecommerce/products.ts:78`:
```ts
query.or(`slug.ilike.%${opts.search}%,content->>'en-US'->>'title'.ilike.%${opts.search}%`)
```
- It is fed by the public `app/[lang]/shop/page.tsx:25,34` `?search=` through the service-role client.
- Commas or parentheses inject filter terms or cause a 500. The result is still ANDed with `status=active`, so drafts shouldn't leak, but it's fragile.
- The prod error `operator does not exist: text ->> unknown` on `/[lang]/shop` (first seen 2026-07-10, last seen 2026-09-11) likely comes from this query's `content->>` path on a non-jsonb value. Confirm while fixing.
- Admin-only copies of the pattern: `lib/ecommerce/admin/customers.ts:40`, `lib/ecommerce/admin/orders-list.ts:78`, `lib/ecommerce/customers.ts:50`, `lib/ecommerce/orders.ts:33`.

**2. Raw error text returned to clients.**
- About 93 responses return a Supabase, Stripe or Google `error.message`.
- Public ones matter most: `shop/checkout:518,628`, `results/hold:269,703,761` and `appointments/book:150`.

**3. Reference photos are public.**
- `lib/config-upload/index.ts:51,61` stores Staff-uploaded Reference photos in the **public** `media` bucket at `config-uploads/{resultId}/…`. Anyone with the URL can view photos of a customer.
- A private bucket, `partner-private`, already exists with no anon policies.

**4. Two lockfiles.** `package-lock.json` and `pnpm-lock.yaml` are both committed. CI uses pnpm with a frozen lockfile.

## Scope

- **Search:** a small `escapePostgrestValue(s)` that strips or quotes `,` `(` `)` `"` `\` and escapes like-wildcards (reuse `escapeLikePattern`). Apply it at all 5 `.or()` sites. Also fix the `content->>` operator error: `content` must be `jsonb`, or the path needs a cast.
- **Errors:** on the public routes above, return a stable message and `console.error` the detail (Sentry picks it up after slice 14). Admin routes may keep detail.
- **Photos:**
  - Create a private `config-uploads` bucket (a migration or storage config in the repo) and upload there.
  - Read through `createSignedUrl` (short TTL, for example 10 min) in the Result detail view and the customer's Result page, gated by `requireResultAccess` or Staff `results`.
  - A one-off script moves existing objects and rewrites their stored paths. Run it in the same sitting as the deploy.
- **Lockfile:** delete `package-lock.json`, and add `package-lock.json` to `.gitignore`.

## Acceptance criteria

- [ ] vitest: the product search with `a,status.eq.draft` or `a)` returns normally (no 500) and doesn't widen the filter.
- [ ] `/shop?search=test` renders on preview, and the `text ->> unknown` error no longer appears in runtime errors.
- [ ] vitest: `results/hold` with a forced DB error returns a response body with no Postgres text.
- [ ] A new Reference photo URL is a signed URL. The old public URL form returns 400 or 404 after the move.
- [ ] Staff and the owning customer can still see Reference photos on preview.
- [ ] `pnpm install --frozen-lockfile` passes in CI, and `package-lock.json` is gone.
