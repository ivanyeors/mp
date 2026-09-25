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

- [ ] Fixture CSVs parse to the expected rows; wrong-format files are rejected with a clear message
- [ ] Re-uploading an overlapping range upserts and does not duplicate
- [ ] Ahrefs attribution rendered wherever DR is displayed

## Blocked by

Slice 01
