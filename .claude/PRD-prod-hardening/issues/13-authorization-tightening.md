# 13: Authorization tightening: owner-only role grants, Reference photo permission, cart ownership, partner logo host

**Type:** AFK
**Blocked by:** none
**User stories:** 36, 37, 38, 39
**Labels:** `bug`, `needs-triage`, `P1`, `area:admin`

## Goal

Four places where a signed-in or anonymous caller can do more than their role allows.

## The gap, precisely

**1. An admin can mint owners.** `app/api/admin/users/[id]/route.ts:20-22,74-77` (and `admin/users/route.ts` POST) only require the `staff` permission, which the `admin` role also has.
- An admin can promote anyone, including themselves, to `owner`, or demote and deactivate owners, as long as one active owner remains.
- The role matrix is in `lib/auth/permissions.ts`.

**2. Any Staff role can change Reference photos.** `app/api/config-uploads/route.ts:22,31,55` checks `if (!(await getAdminContext()))` with no permission, so `viewer` can upload and delete customer Reference photos.

**3. Cart items by id.** `app/api/shop/cart/items/[itemId]/route.ts:11-45` never reads the `cart_token` cookie.
- `lib/ecommerce/cart.ts:91-110` updates or deletes `cart_items` by `id` alone with the service role.
- PATCH returns the row.

**4. Partner logo host not checked.** `app/api/partner/profile/route.ts:25-33` `isOwnLogoUrl` checks only the path.
- `https://evil.host/storage/v1/object/public/media/partner-logos/<id>/x.png` is accepted.
- `next/image` throws for an unconfigured host in `partner-logo-marquee.tsx:27`, `partners-logo-grid.tsx:17` and `co-brand-banner.tsx:18`. With no `[lang]/error.tsx`, one Partner takes the public partners page down.

## Scope

- **Owner grants.** In both admin user routes, if the request sets `role` to `owner`, or changes or deactivates a user whose current role is `owner`, the acting Staff role must be `owner`; otherwise 403. Everything else keeps the `staff` permission.
- **Reference photos.** `config-uploads` uses `requireAdmin("results")` for POST and DELETE, and `results` or `orders` for GET, matching `mp-config/responses`.
- **Cart ownership:**
  - Resolve the cart from the `cart_token` cookie (the same helper `app/api/shop/cart/route.ts` uses).
  - PATCH and DELETE with `.eq("id", itemId).eq("cart_id", cart.id)`.
  - No match returns 404.
- **Logo host.** `isOwnLogoUrl` also requires `url.host === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host`. Defensively, the three logo components skip rendering a logo whose host isn't the Supabase host.

## Acceptance criteria

- [ ] vitest: an admin-role context PATCHing a user to `owner` gets 403, and an owner-role context gets 200. Fails on today's code.
- [ ] vitest: an admin-role context deactivating an owner gets 403.
- [ ] vitest: a `viewer` context POSTing to config-uploads gets 403.
- [ ] vitest: PATCH or DELETE of a cart item with a different cart's cookie returns 404 and the row is unchanged.
- [ ] vitest: `isOwnLogoUrl` rejects a foreign host with a matching path.
- [ ] On preview: the Staff management page, Reference photo upload in Result detail, and cart quantity change all still work.
