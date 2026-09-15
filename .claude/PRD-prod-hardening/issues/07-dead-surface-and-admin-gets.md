# 07: Remove dead endpoints, fix the reviews route, lock the product and blog GETs

**Type:** AFK
**Blocked by:** none
**User stories:** 15, 16, 17, 18, 32
**Labels:** `bug`, `needs-triage`, `P0`, `area:storefront`

## Goal

Nothing in prod answers anonymously unless a customer-facing page actually needs it.

## The gap, precisely

**Delete (grep confirmed no callers in `app/`, `components/`, `hooks/` or `lib/`):**
- **`app/api/mp-maker/configs/route.ts` and `[name]/route.ts`:** no auth. The POST upserts `mp_maker_configs` by `name` (`onConflict: 'name'`) with the service role and an unbounded `items` array.
- **`app/api/google/place-id/route.ts`:** an unauthenticated, billed Places Text Search proxy with `cache: "no-store"` and free-text `q`. It echoes Google's error text (`:69-71`).
- **`app/stripe-test/page.tsx` and `app/api/stripe/test-checkout/route.ts`:** the page ships to prod, while the API 404s in production.

**Fix the reviews route.** `app/api/shop/reviews/route.ts` *is* called by the storefront (`app/[lang]/shop/[slug]/product-reviews.tsx:44,108`, rendered by `product-detail-client.tsx:539`), but:
- It reads the table `reviews`, which **doesn't exist in prod** (verified 2026-09-15). The real table is `product_reviews`, with 0 rows. So the widget is broken today.
- The GET (`:17-39`) takes `?status=` from the caller and selects `*`, so pending and rejected reviews would leak with `customer_id` and `order_id`.
- The POST (`:41-56`) trusts `customer_id` and `order_id` from the body, with no rate limit and no body length cap.

**Admin data from public GETs.** Only the Admin Panel calls these: `settings/products/**` and `settings/blogs/**` (grep confirmed).
- `app/api/shop/products/route.ts:7-14` (`listAdminProducts`, any `?status=`)
- `app/api/shop/products/[id]/route.ts:31-37` and `[id]/variants/route.ts:28-40`: `product_variants(*)` includes `cost_price`
- `app/api/blogs/route.ts:27-39` and `app/api/blogs/[id]/route.ts:29-34`: drafts

## Scope

- **Delete** the four files above (plus empty folders). Grep again before deleting.
- **Reviews route:**
  - Point it at `product_reviews`.
  - GET: forced `status = 'approved'`, a selected public column list (rating, title, body, author display name, created_at), paginated.
  - POST: requires `getAuthUser`. `customer_id` comes from the session. `order_id`, if given, must belong to that Customer and contain the product. `body` gets a max length. New reviews start as pending.
  - Update `product-reviews.tsx` only if the payload shape changes.
- **Product and blog GETs:** `requireAdmin` with the same permission each route's writes already require (`products` / `page-builder`). The settings clients send the session cookie, so no client change is expected.

## Acceptance criteria

- [ ] `GET /api/google/place-id`, `/api/mp-maker/configs` and `/stripe-test` return 404 on preview.
- [ ] vitest: anonymous `GET /api/shop/products?status=draft` returns 401 or 403. The `products` Staff session returns 200.
- [ ] vitest: anonymous `GET /api/shop/products/[id]/variants` returns 401 or 403.
- [ ] vitest: anonymous `GET /api/blogs` returns 401 or 403.
- [ ] vitest: `GET /api/shop/reviews?product_id=…&status=pending` returns only approved rows and no `customer_id` field.
- [ ] vitest: anonymous `POST /api/shop/reviews` returns 401. A signed-in POST with someone else's `order_id` returns 403.
- [ ] The storefront product page loads reviews without an error on preview.
- [ ] The Admin Panel product list, product editor, blog list and blog editor still load on preview.
