# 12: Web hardening: safe post-login redirect, escaped JSON-LD, security headers

**Type:** AFK
**Blocked by:** none
**User stories:** 33, 34, 35
**Labels:** `bug`, `needs-triage`, `P1`, `area:storefront`, `area:customer-accounts`

## Goal

Three small fixes, each closing a browser-side attack that works today.

## The gap, precisely

**1. Open redirect after sign-in.** `lib/auth/post-auth-redirect.ts:33-36`:
```ts
if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
```
- `next=/\evil.com`, or `/%09/evil.com` after decoding, gets through. Browsers treat `/\` as `//`.
- Exploitable from `app/[lang]/account/login/page.tsx:22,28`, where `redirect()` fires for an already signed-in user, and from `components/auth/login-form.tsx:99` (`window.location.assign(safeNextPath(...))` after the email code).
- `app/auth/callback` and `app/auth/signout` put the canonical origin in front, so they aren't exploitable.

**2. JSON-LD script breakout.** `components/seo/json-ld-script.tsx:5` and `components/marketing/faq-page.tsx:105,109`:
```tsx
dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
```
- `JSON.stringify` doesn't escape `<`. A product title, FAQ answer or blog title containing `</script><script>…` runs on public pages.
- The content is Staff-authored (`shop/[slug]/layout.tsx:104-106`, `blog/[slug]/page.tsx:83`, `page-faq-section.tsx:48`, `guides/[topic]/page.tsx:54`). A Staff member with a narrow permission could use it to steal an owner-role session: `@supabase/ssr` cookies are readable by JavaScript.

**3. No security headers.**
- `next.config.ts` has no `headers()` and no `poweredByHeader: false`. `vercel.json` and `proxy.ts` set none.
- So there's no HSTS, no frame protection (the Admin Panel can be framed), no nosniff, no Referrer-Policy and no Permissions-Policy, and `X-Powered-By: Next.js` is sent.

## Scope

- **`safeNextPath`:** also return the fallback when `next` contains `\` or any control character (`/[\\\x00-\x1f\x7f]/`), and when `new URL(next, "https://x.invalid").origin !== "https://x.invalid"`.
- **JSON-LD:** in the shared component, `JSON.stringify(data).replace(/</g, "\\u003c")`. Make `faq-page.tsx` use the shared component instead of its own `dangerouslySetInnerHTML`.
- **Headers:** `next.config.ts`:
  - `poweredByHeader: false`
  - `headers()` for `/:path*`:
    - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
    - `X-Frame-Options: DENY`
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

    Check first that nothing needs the camera: Reference photo upload uses a file input, which isn't affected.
  - **Before adding `DENY`,** confirm nothing embeds the site in an iframe (Stripe Checkout is a redirect, not an embed).
  - CSP is out of scope.

## Acceptance criteria

- [ ] vitest: `safeNextPath("/\\evil.com", "/")`, `safeNextPath("/\tevil.com", "/")` and `safeNextPath("//evil.com", "/")` return `"/"`, and `safeNextPath("/shop?x=1", "/")` is unchanged. Fails on today's code.
- [ ] vitest: rendering `JsonLdScript` with `{ name: "</script><script>alert(1)</script>" }` produces markup with no literal `</script>` inside the JSON.
- [ ] `curl -sI https://<preview>/` shows all five headers and no `X-Powered-By`.
- [ ] On preview: sign in, Stripe checkout redirect and return, the Admin Panel, and Reference photo upload all still work.
