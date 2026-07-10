# PRD: Marketing Copy Rewrite (Science of Sleep)

Status: Draft (needs-triage)
Source: Mpillow marketing copy gap audit canvas (Jul 2026) + Strategic Growth roadmap weave map
Locale: **en-US only** (zh-CN out of scope)

## Problem Statement

Mpillow's live en-US marketing copy still leads with gift/lifestyle framing and under-uses the **Science of Sleep** brand umbrella. High-intent Singapore searchers and the three canonical personas do not see themselves clearly:

- **Affluent Wellness / Pain Sufferers** — home hero leads with gift copy, not cervical neck-pain fit.
- **Tech Neck professionals** — Neck Pains + Cervical Neck Support never name desk/device strain.
- **Multi-generational families** — Mbolster never states household / kids-through-adults sizing (without inventing Family Bundles).

Page FAQ, Partners, configurator INTRO shells, and chrome (stories) have secondary gaps. Crawler surfaces (`llms.txt`, `robots.txt`) were already updated in the audit pass. Mobile layout/visibility for existing copy was partially fixed in a parallel pass; remaining work is applying the recommended strings so the new copy is readable on ~375px viewports.

## Solution

Use the gap-audit **Recommended** column as the source of truth. Rewrite en-US i18n (and hardcoded chrome) on existing surfaces only — no new routes, no invented offers (Family Bundles, workshops, quizzes, fitting-fee framing). Stay claim-safe: neck pain / cervical alignment / posture / sleep quality — never prescribe / treat / cure / rehab.

From the visitor's perspective:

1. Home hero and Premium path speak Science of Sleep + consultative fit for chronic neck pain.
2. Neck Pains → Cervical slide-in names tech-neck / desk-day recovery (new section inside the existing slide-in).
3. Mbolster surfaces speak household sizing for kids through adults.
4. FAQ and Partners answer buyer/clinical prompts with Singapore keywords.
5. Configurator shells name Science of Sleep / household support without losing existing AEO density.

## User Stories

### Affluent Wellness / Pain Sufferer (home + Premium path)

1. As an Affluent Pain visitor on the first viewport, I want the H1 to name customised cervical pillow / neck pain relief / Singapore / Science of Sleep, so that I know this is a clinical-fit brand not a gift shop.
2. As an Affluent Pain visitor, I want the Answer lede to open with Science of Sleep and in-store measurement for chronic neck stiffness, so that AEO and humans get the same fact-dense story.
3. As an Affluent Pain visitor, I want the hero subtitle to describe modular cervical support fitted to neck curve, sleep position, and body build, so that the promise is concrete.
4. As an Affluent Pain visitor, I want Size Matters landing copy to explain shoulder length → pillow height, so that measurement science is visible before the slide-in.
5. As an Affluent Pain visitor, I want Basic vs Premium pick cards to differentiate occasional tension vs chronic neck pain + consultative fitting + cervical accessory path, so that I can choose the right tier.
6. As an Affluent Pain visitor opening Premium learn-more, I want Science of Sleep + consultative fitting named in the hero, so that Premium feels clinical not just “better”.
7. As an Affluent Pain visitor on Premium, I want FibreCool described as helpful for sleepers who run warm after long device days, so that material choice is motivated without inventing Tech Neck-only SKUs.
8. As an Affluent Pain visitor on Premium whoItsFor, I want the conclusion softened to sleep comfort / overnight alignment (not medical treatment), so that claims stay safe.
9. As an Affluent Pain visitor on Basic learn-more, I want Singapore + custom-fit cervical keywords in the description, so that the entry tier still ranks and converts.
10. As an Affluent Pain visitor on mp-config, I want H1 “Customise Your Mpillow Cervical Pillow” and a lede that names Science of Sleep + in-store fitting, so that commercial intent matches the brand.
11. As an Affluent Pain visitor on Size Matters slide-in, I want the title branded Science of Sleep — why size matters, so that the best measurement content on site carries the umbrella.
12. As an Affluent Pain visitor on credibility tiles, I want descriptions tied to Science of Sleep / cervical fit / patented modular support, so that proof reinforces the brand.
13. As an Affluent Pain visitor on the clinician review section, I want a subtitle with customised cervical support / neck pain / Singapore, so that clinical proof is keyword-visible.
14. As an Affluent Pain visitor on the founder section, I want one paragraph on measurement-led cervical fit vs one-size foam, so that the founder story converts Affluent Pain without inventing claims.
15. As an Affluent Pain visitor on ambassadors landing, I want Consumer ambassador framing (Skyjin & Piggie) distinct from clinical partners, so that I am not confused about Local Ambassadors.

### Tech Neck professional

16. As a Tech Neck visitor on Neck Pains, I want the title to ask whether neck pain is from sleep or the desk, so that device strain is acknowledged.
17. As a Tech Neck visitor on Neck Pains, I want the description to mention Premium Mpillow + cervical neck support for overnight alignment after screen days, so that the weave into the cervical slide-in is clear.
18. As a Tech Neck visitor on mobile, I want the feel bullets and Learn More CTA visible (not desktop-only), so that I can open the cervical story.
19. As a Tech Neck visitor in Cervical Neck Support, I want a new section “Built for tech-neck days, recovered at night”, so that desk-day → overnight recovery is explicit.
20. As a Tech Neck visitor in Cervical Neck Support, I want a filled heroDescription with cervical support / screen days / Singapore, so that the AEO slot under the title is not empty.
21. As a Tech Neck visitor reading claim language, I want support/align wording only (no treat/cure), so that the brand stays clinically responsible.

### Multi-generational family (Mbolster)

22. As a Families visitor on the Mbolster home card, I want copy that sizes by height for kids through adults in the same household, so that the family persona is visible.
23. As a Families visitor on the Mbolster home card, I want a subtitle tying Mbolster to the same Science of Sleep system as Mpillow, so that the sleep system is coherent.
24. As a Families visitor in Mbolster learn-more about, I want explicit household / children-and-adults sizing language, so that the Families weave is not buried.
25. As a Families visitor in Mbolster discover, I want pairing Mpillow (neck) + Mbolster (side-sleep torso) framed as a consistent Science of Sleep setup, so that I understand the system without a Family Bundle offer.
26. As a Families visitor on mbolster-config, I want the Answer lede to mention short/medium/long by height including kids, so that commercial intent matches the persona.
27. As a Families visitor, I must not see invented Family Sleep Bundles, workshops, or fitting fees, so that copy only sells live offers.

### Cross-cutting FAQ, Partners, chrome

28. As a FAQ reader on home Page FAQ, I want the “what is Mpillow” answer free of internal “Storefront product” jargon, so that public copy is human.
29. As a FAQ reader, I want a Q on cervical vs ergonomic pillow, so that a high-intent buyer prompt is answered on-page.
30. As a FAQ reader, I want a Q on customised pillow help for tech neck strain at night, so that Tech Neck intent has an extractable answer.
31. As a clinical partner on `/our-partners`, I want an H1/subtitle that names clinical sleep support in Singapore and Local Ambassador audiences (chiro / physio / wellness), so that referral intent is clear.
32. As a clinical partner, I must not see invented voucher programs in copy, so that ops promises stay honest.
33. As a visitor on Stories, I want Singapore customers / custom-fit sleep and neck comfort framing via i18n (not hardcoded EN), so that chrome matches the brand and locales can follow later.
34. As a Consumer ambassador visitor, I want Skyjin & Piggie never labeled Local Ambassadors, so that clinical vs lifestyle proof stays distinct.

### SEO / SEM / AEO quality

35. As a searcher for “pillow for neck pain Singapore”, I want hero and FAQ language to match that intent naturally, so that SEM landing quality improves.
36. As a searcher for “tech neck pillow Singapore”, I want Neck Pains + cervical section + FAQ to answer without stuffing, so that AEO extractors can cite facts.
37. As a searcher for “customisable bolster Singapore”, I want Mbolster surfaces to carry household/side-sleeper facts, so that bolster intent is covered.
38. As an AI crawler, I want llms.txt Science of Sleep positioning and target queries to remain accurate after on-page rewrites, so that crawler and page stories stay aligned (already shipped; do not regress).
39. As a developer, I want a claim/SEO self-check over rewritten strings, so that treat/cure language and empty Answer ledes fail CI/local assert.

### Mobile copy visibility

40. As a mobile visitor on the hero, I want H1, subtitle, and CTAs readable above the dock with Answer lede not dominating the first viewport, so that conversion chrome stays usable.
41. As a mobile visitor on Neck Pains, I want Learn More reachable, so that the Tech Neck path works on phones.
42. As a mobile visitor in slide-ins, I want last sections not covered by sticky close bars and tap targets ≥ ~44px where we touch CTAs, so that rewritten copy remains readable.
43. As a QA reviewer on staging, I want a HITL pass of en-US copy on mobile + desktop for claim-safety and persona weave, so that launch is signed off.

### Operators and developers

44. As a marketing operator, I want CMS `landing_sections.content` overrides left alone unless defaults change, so that prod CMS overrides are not silently clobbered (document that CMS may still differ until re-seeded).
45. As a developer, I want all recommended strings applied only to live offers and existing routes, so that YAGNI holds (no new pages).
46. As a developer, I want glossary terms (Science of Sleep, three personas, Consumer vs Local Ambassador, Elusive Sleeper) respected from `CONTEXT.md`, so that agents stay consistent.
47. As a product owner, I want zh-CN deferred, so that en-US ships without blocking on translation.
48. As a product owner, I want crawler work (llms/robots) marked done in this PRD, so that agents do not re-open completed audit deliverables.

## Implementation Decisions

### Locked decisions (from audit grilling)

| Decision | Resolution |
|----------|------------|
| Brand umbrella | Science of Sleep; gift/customisation = conversion tactic, not primary story |
| Persona weave | Affluent → home/Premium path; Tech Neck → cervical slide-in (+ Neck Pains); Families → Mbolster only |
| Ambassadors | Consumer (Skyjin & Piggie) ≠ Local Ambassador (clinical / partners) |
| Claims gate | Live offers only; no Family Bundles / workshops / quizzes / fitting fees |
| Clinical register | support / align / sleep quality — no prescribe / treat / cure / rehab |
| Structure | May add a section inside Cervical slide-in; no new routes |
| Locale | en-US only |
| Crawler | llms.txt + robots already updated; protect from regression |
| Source of truth | Canvas Recommended column |

### Modules

| Module | Responsibility |
|--------|----------------|
| Marketing copy catalog (en-US) | Rewrite `home.*` / `slides.*` strings per canvas; keep CMS overrides as optional overlay |
| Cervical Tech Neck section | New section in Cervical Neck Support product-slide config + i18n keys |
| Configurator Answer ledes | mp-config / mbolster-config INTRO H1/lede |
| Page FAQ defaults | Home FAQ rewrite + two buyer prompts |
| Partners defaults | Local Ambassador H1/subtitle in partners defaults |
| Chrome i18n | Stories hardcoded EN → messages |
| Claims/SEO gate | Pure assert helper: no banned clinical verbs; Answer-lede length band where applicable; Singapore keyword presence on SEO-flagged surfaces |
| Mobile copy visibility | Layout already patched; verify after string length changes |

### Interfaces / contracts

- i18n: extend `Messages` types only when new keys are required (cervical Tech Neck section, stories).
- Cervical slide-in: add one section to existing recipe; preserve Back footer and `openCervicalNeckSupportSheet`.
- Page FAQ: defaults in `lib/page-faq/defaults.ts`; public answers must not mention Storefront jargon.
- Partners: `DEFAULT_WORK_WITH_US` en-US only in this pass.
- Claims/SEO gate: single function `assertMarketingCopySafe(strings)` (or equivalent) runnable via `tsx` self-check — no new test framework.

### Explicit non-goals in implementation

- No CMS migration/seed unless a follow-up issue is opened.
- No zh-CN string updates.
- No JSON-LD / schema rebuild (already shipped under SEO PRD).
- No new Family Bundle commerce.

## Testing Decisions

Good tests assert **external behavior** of the claims/SEO gate and that critical surfaces still render required keys — not snapshotting every marketing paragraph.

| Module | Test |
|--------|------|
| Claims/SEO gate | Assert banned verbs absent; SEO-flagged samples include Singapore or cervical/neck intent where required; Answer lede length band for hero seoAnswer |
| Cervical Tech Neck section | Config includes new section id; i18n keys resolve (lightweight assert) |
| Other copy modules | Manual / staging HITL (slice 08); no per-string unit tests |

Prior art: `lib/seo/seo.check.ts` assert style; page-faq / configurator `*.check.ts` files.

## Out of Scope

- zh-CN rewrites
- New routes or landing pages
- Building Neck Pain Quiz, workshops, Family Sleep Bundles, clinical ambassador voucher ops
- Rebuilding JSON-LD / AggregateRating / guides hubs
- Re-doing llms.txt / robots.txt (complete; regression-only)
- Bulk CMS content re-seed in production
- Paid SEM campaign setup

## Further Notes

- Mobile layout visibility fixes (hero clamp/scrim/dock, Neck Pains mobile CTA, pick CTA stack, slide-in scroll padding, Mbolster tap targets, stories/partners) landed ahead of copy rewrite — re-check after longer Science of Sleep strings.
- If prod CMS `landing_sections.content` overrides hero/neck/mbolster strings, defaults alone will not change the live homepage until CMS is updated — call that out in staging sign-off.
- Canvas path (IDE): `~/.cursor/projects/Volumes-Crucial-SSD-2TB-Projects-mp/canvases/marketing-copy-gap-audit.canvas.tsx`
