# Slice 18 — Page indexing issues from the URL Inspection API

Type: AFK + OPS
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
Asked for by the owner, 2026-11-27: stop exporting Search Console's Page indexing issues one reason at a time.

## What to build

- `lib/google/search-console.ts`: `inspectUrl` on the existing client (`urlInspection/index:inspect`, same service account and read-only scope)
- Migration: `seo_url_inspections`, one row per URL with Google's latest answer, the issue (null when fine) and when that issue was first seen; admin-only RLS
- `lib/seo-metrics/inspect-urls.ts`: each day, check every URL in `app/sitemap.ts` plus every page Search Console reported impressions for in the last 90 days, least recently checked first, inside a time limit
- Chain it last in the `results-sla` cron, and log a failed Search Console import or inspection to the function log
- Analytics → Traffic & search: a "Page indexing" list grouped by issue, with a copy-all button and a link to each page's Search Console inspection
- A warning on the search card when the daily import has brought nothing for 5 days

## What counts as an issue

- A sitemap page: any state other than indexed, in Google's own wording ("Crawled - currently not indexed", "Not found (404)", …)
- A page outside the sitemap: the same, except a redirect, an alternate with a proper canonical, or a noindex, which are deliberate
- An indexed page with a structured data error (warnings are ignored)

## Acceptance criteria

- [x] Request shape, refusal message and classification covered by `lib/seo-metrics/__tests__/inspect-urls.test.ts`
- [x] The first-seen date is kept while an issue persists, restarts when the issue changes, and clears when fixed
- [x] One failing page does not lose the others' results; repeated refusals stop the run after 5 requests
- [x] A page not checked for 14 days (removed from the site) drops off the list
- [ ] (OPS) Migration applied, and the cron response shows `urlInspections.inspected > 0`

## Blocked by

Slice 01's OPS step: the service account must be able to read the property in `GOOGLE_SEARCH_CONSOLE_SITE_URL`.

## Limits

- The API has no list of Google's Page indexing report. A URL Google knows that is neither in the sitemap nor shown in search in the last 90 days is not checked.
- The API cannot request indexing or press "Validate fix". An issue clears here when Google next reads the page.
- Google allows about 2,000 inspections a day per property; a run checks at most 300.
- Not confirmed: whether a Restricted user may call the inspection endpoint. If the cron reports `urlInspections.error` with a 403 while `gscIngest` succeeds, raise the service account to Full on the property.
- Sitemap read errors (the Sitemaps API) are not pulled.
