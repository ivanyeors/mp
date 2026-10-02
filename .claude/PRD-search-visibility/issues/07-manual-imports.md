# Slice 07 — CSV imports (GSC Gen-AI, Bing AI Performance) + Ahrefs DR

Type: AFK
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 12, 22

## What to build

- `lib/seo-metrics/csv-import.ts`: parsers for the GSC Generative AI performance export and the Bing Webmaster AI Performance export → `seo_daily_metrics` (`source` = `gsc_genai` / `bing_ai`)
- Upload UI in the visibility section, with a "last imported" date on each chart
- Weekly Ahrefs free Domain Rating fetch → `seo_authority_snapshots`, shown as a small line with "Data by Ahrefs" attribution
- When Google/Bing ship APIs for these reports, replace the import with ingest (tracked in Further Notes)

## Acceptance criteria

- [x] Fixture CSVs (shapes from real exports, 2026-10-02) parse to the expected rows; wrong-format files are rejected with a clear message
- [x] Re-uploading an overlapping range upserts and does not duplicate (same unique key as the GSC ingest; repeated keys within a file are merged)
- [ ] Ahrefs attribution rendered wherever DR is displayed

## Blocked by

Slice 01

## Implementation notes (CSV imports done; Ahrefs DR pending a key)

- Recognised by header: Google's Generative AI export set (`Chart.csv` daily impressions; `Pages` / `Countries` / `Devices` period totals; `Filters.csv` gives the period label) and Bing's AI Performance export (`…_AIPerformanceOverviewStats_….csv`: Date, Citations, Cited Pages; US-format dates).
- Storage in `seo_daily_metrics`:
  - `gsc_genai/total` = AI impressions
  - `bing_ai/total`: impressions = citations, `extra.cited_pages`
  - period totals as `*_period` dimensions dated on the import day, never in daily rollups
- Charts are blank outside each export's span, not zero.
- **The first Bing export (2026-10-02) is for `www.mpillow.com`, not `custom.mpillow.com`, and ends 2026-06-13.** The importer warns when the file name's host differs. Add `custom.mpillow.com` in Bing Webmaster Tools (import from GSC) to track the live site.
- 8 of 19 pages in the Google AI export are `zh-CN` copies of English posts. Note this for the slice 09 audit: the Chinese URLs compete with the English ones.
- Ahrefs Domain Rating: waits for `AHREFS_API_KEY`.
