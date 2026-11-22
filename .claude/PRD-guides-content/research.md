# Research: neck pain, cervical pillow and custom pillow guides

Gathered 21 Nov 2026 for `guides-content-prd.md`. Three web research passes (Singapore search results, search and ads guidance with Singapore claim rules, evidence and UX) plus a read of this repo. Each finding names its source. Treat anything marked **[secondary]** or **[unverified]** as a lead, not a fact.

## 1. Where the guides stand today

- Each guide shows about 150–200 words: H1, a 60–70 word lede, 0–4 reviews, a link list, 2–3 FAQs and one CTA. No images, breadcrumb, table of contents, byline, updated date, sources or video. No page-specific OG image.
- Meta titles open with "A guide to…", so the search words come late.
- On a phone, a "Got it" chip covers the second review card on `/guides/custom-pillow`.
- Content is hard-coded in `lib/seo/guides-content.ts`. `CONTEXT.md` (**Page FAQ**) already lists "hardcoding page Q&A in TS like guide hubs" as something to avoid.

### The guides compete with the blog hubs

| Guide | Blog page on the same search | Words | Overlap |
|---|---|---|---|
| `/guides/neck-pain` "Best Pillow for Neck Pain in Singapore" | `/blog/what-is-the-best-pillow-for-neck-pain-in-singapore` "What Is the Best Pillow for Neck Pain in Singapore?" | 2,455 | Same head query, same title |
| `/guides/cervical-pillow` "Best Cervical Pillow in Singapore" | `/blog/the-ultimate-guide-to-cervical-support-pillows-for-neck-pain-relief` "Does a Cervical Pillow Help Neck Pain, and Who Does It Suit?" | 1,712 | What it is, who it suits, how to choose |
| `/guides/custom-pillow` "Customised Pillow in Singapore" | `/blog/tailored-to-you-understanding-the-process-of-crafting-custom-made-pillows-for-better-sleep` "How Is a Custom Pillow Made and Fitted?" | 2,335 | The fitting process is the core of both |

Google's guidance now names "substantially similar pages" under doorway abuse and asks each page to serve a distinct intent ([spam policies](https://developers.google.com/search/docs/essentials/spam-policies), 28 Aug 2026; [AI optimisation guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), May 2026).

### The guides inherited the old site's long articles

At cutover, `lib/shopify-redirects.ts` sent these mpillow.com pages to the guides (word counts from `docs/cutover/shopify-snapshot-2026-11-18.json`):

| Old page | Words | Now goes to |
|---|---|---|
| `finding-the-best-pillow-for-neck-pain-an-evidence-based-guide` | 1,714 | `/guides/neck-pain` |
| `systematic-review-pillow-design-neck-pain-cervicogenic-headache` | 1,746 | `/guides/neck-pain` |
| `what-is-a-cervical-pillow-and-how-do-i-know-if-i-need-one` | 1,474 | `/guides/cervical-pillow` |
| `/pages/cervical-support-pillow-customisable-pillow` | 3 | `/guides/cervical-pillow` |
| `why-customised-pillows-are-the-secret-to-better-sleep` | 1,340 | `/guides/custom-pillow` |

A 1,700-word evidence guide redirected to a 150-word page reads to Google like a soft 404, so the rankings those URLs earned are at risk. The redirect check also tests `gclid`, so ad clicks land here too.

## 2. What Singapore searchers see

Source: WebSearch (US index, so only a proxy for google.com.sg) plus Google autocomplete with `gl=sg`. People Also Ask boxes and AI Overviews could not be observed.

- **Page 1 is affiliate listicles**: Shopee blog, Her World / Women's Weekly / Home & Decor (SPH, syndicated), TheSmartLocal, ProductNation, Honeycombers. Megafurniture publishes 10+ near-duplicate pillow posts with "Quick answer" boxes.
- **Nobody shows expertise or evidence.** No page cites a study and only one (Physio & Sole) has a clinical reviewer. No page has a diagram, a how-to-measure image or a video.
- **Numbers are rare.** Only Megafurniture (side sleeper loft 12–14 cm) and Maxi Home give heights, unsourced.
- **"Cervical pillow" is never explained well**: what it is, who it suits, which side goes up.
- **"Custom pillow singapore" mostly means printed photo or gift pillows** (Vistaprint, SHEIN, Lazada cushions). The fitted-pillow intent shows as "custom pillow for neck pain singapore", "pillow fitting singapore" and "nishikawa custom pillow singapore" / "customised pillow japan". Vogue SG wrote about Japanese pillow fittings and quoted ENT Dr Kenny Pang that there are "no large-scale medical evidence-based studies to show that pillows affect sleep health" **[snippet only; page 403]**.
- **Local clinical voice:** SKH's principal physiotherapist says there is "no strong evidence that specific cervical pillows or ergonomic neck supports directly reduce or prevent neck pain" ([SKH](https://www.skh.com.sg/about-skh/news/skoop/skoop-issue-16/not-all-it-s-cracked-up-to-be)).
- **Fitted-pillow competitors in Singapore:** Dunlopillo ran a Takashimaya pop-up with one-to-one height consultations (page now 404); Ergoworks sells a 1 mm-adjustable pillow and suggests showroom fitting; adjustable-layer pillows (King Koil, GIVMI, Blissbury) are self-adjusted. None explains a measured fit online.
- **No mpillow.com page appeared in any result seen.** The DBC Singapore award listing ranks #1 for "customised pillow singapore neck fit".

### Questions people type (Singapore autocomplete)

- do cervical pillows work / are they worth it / good for side sleepers / how long do they last
- what is an orthopedic pillow; are ergonomic pillows good
- can a (high / low / hard / soft / new) pillow cause neck pain or headaches
- hard or soft pillow for neck pain; is memory foam good for neck pain
- how to choose pillow height; pillow height for side / back / stomach sleepers
- contour pillow: which side to use, how to use
- how often to change your pillow
- custom pillow for neck pain singapore; pillow fitting singapore; how much is a custom pillow
- how do I know if my pillow is causing neck pain; latex vs memory foam; pillows for humid climate

## 3. What the evidence supports

Trials on pillows and neck pain are small, short and mixed. Defensible claims are about **alignment, comfort and fit**. Claims that a pillow reduces pain are weak, and claims that it improves sleep quality are contradicted.

| Claim a guide can make | Source | Supporting sentence | Confidence |
|---|---|---|---|
| Pillow shape and height affect neck alignment | [Pang et al. 2021, SR+MA](https://pubmed.ncbi.nlm.nih.gov/33895703/) | "the cervical alignment may be significantly impacted by the shape and height of the pillow" | Moderate |
| No pillow material is proven best | [Ghosh et al. 2025, SR](https://pubmed.ncbi.nlm.nih.gov/40633255/) | "no particular type (latex, foam or standard) demonstrating clear superiority" | High |
| There is no single right height for everyone | [Lei et al. 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8544534) | "no firm conclusions about the optimal pillow height for the supine and lateral positions" | High |
| A contour shape alone is no guarantee | [Gordon et al. 2009](https://pubmed.ncbi.nlm.nih.gov/19427257/) | "no evidence that the use of a foam contour pillow has advantages over the regular shaped pillows" | Moderate-low |
| Feather pillows did worst for waking symptoms; your own pillow may not suit you | [Gordon et al. 2010](https://pmc.ncbi.nlm.nih.gov/articles/PMC3004642) | "The feather trial pillow performed least well… 'Own' pillows did not guarantee symptom-free waking" | Moderate-low |
| For side sleepers, the right height tracks shoulder width | [Tian et al. 2025](https://pubmed.ncbi.nlm.nih.gov/39412632/) | optimal height "well predicted" by a shoulder-width index | Low (n=9) |
| Fit depends on body size | [Sun et al. 2026](https://pubmed.ncbi.nlm.nih.gov/42321272/) | "Body height showed a significant positive monotonic association with optimal pillow height" | Low (pilot) |
| Adjusting height to the person was followed by less neck pain | [Yamada et al. 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC9889209/) | 50% reached a clinically important drop | Low (no control group) |
| Research suggests a central height of about 7–11 cm as a starting range | [Radwan et al. 2021, SR](https://doi.org/10.1016/j.eujim.2020.101269) | "moderate evidence that some of the following pillow parameters could improve… spinal alignment" | Moderate-low |
| Higher is not better | [Egashira et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11318437/) | high pillows associated with vertebral artery dissection | Low; use gently, never as fear copy |
| Keep head and neck aligned with the body; avoid sleeping on your stomach | [HealthHub](https://www.healthhub.sg/health-conditions/neck-pain) | "your head and neck should be comfortably supported and aligned with your body"; "Try not to sleep on your stomach." | High |
| Most neck pain settles within weeks | HealthHub | "In most cases, your pain should improve in 6 weeks." | High |
| About 1 in 4 Singapore adults had neck pain in the past 6 months | [Hey et al. 2021, *Spine*](https://pubmed.ncbi.nlm.nih.gov/34714794/) | "6-month period prevalence of 23.0%" | Moderate |
| Looking down at a phone loads the neck | [HealthXchange (SGH)](https://www.healthxchange.sg/how-to-manage/neck-pain/tech-neck-text-neck-when-to-see-doctor-for-neck-pain) | at about 60° "the load on the neck can reach around 27kg" | Moderate (model estimate) |

**Do not claim:** better sleep quality (Pang 2021 and Ghosh 2025 found no effect), "clinically proven", or any figure from a vendor survey (Philips sleep survey, Wyzowl, Wistia).

### Red flags the page must carry (exact wording to adapt)

- HealthHub, see a doctor **urgently**: "Left-sided chest pain spreading to arm, shoulder, neck or jaw"; "Sudden loss of function (e.g. Difficulty in balancing when walking, unsteady walking)". **Early**: "Unexplained weight loss", "Fever or night sweat", pain not improving with rest or medication, swelling or redness around the neck.
- HealthXchange (SGH): "Neck pain that persists for several weeks", "Worsening headache", "Severe neck stiffness or restricted movement", "Pain that radiates down the arm", "Numbness or tingling in the hands or fingers", "Weakness in the arms or hands".
- Mayo Clinic: seek immediate care if severe neck pain follows an injury **[wording from search results; page returned 403]**.

## 4. What search engines and AI answers reward now

- **Google AI Overviews / AI Mode need nothing special.** The page must be indexed and snippet-eligible. The biggest factor is "non-commodity" content: first-hand, expert, beyond common knowledge. Google says not to rewrite or "chunk" for AI, and that making fan-out pages to manipulate AI answers is scaled content abuse ([AI optimisation guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), May 2026; [AI features](https://developers.google.com/search/docs/appearance/ai-features)).
- **Structured data:**
  - FAQ rich results stopped showing on 7 May 2026 ([Search Engine Land](https://searchengineland.com/google-to-no-longer-support-faq-rich-results-476957), [SE Roundtable](https://www.seroundtable.com/google-drops-faq-rich-results-41298.html)). FAQPage markup stays valid but earns no Google feature.
  - Article (author, dates, image) and BreadcrumbList are still supported.
  - VideoObject: video features need a watch page where the video is the main content. A guide that embeds one is "complementary".
  - Product markup belongs on product pages, not guides.
- **AI citation research:**
  - Adding statistics, quotations and cited sources raised visibility up to 40% ([GEO, Aggarwal et al. 2024](https://arxiv.org/abs/2311.09735)).
  - Most "conversational SEO" tricks did little; ordinary SEO that gets the page retrieved matters most ([C-SEO Bench 2025](https://arxiv.org/abs/2506.11097)).
  - AI search favours earned media over brand pages ([Chen et al. 2025](https://arxiv.org/abs/2509.08919)).
  - AI assistants cite fresher content ([Ahrefs, Jul 2025](https://ahrefs.com/blog/do-ai-assistants-prefer-to-cite-fresh-content/)).
  - YouTube is a large share of AI Overview citations ([Ahrefs, Mar 2026](https://ahrefs.com/blog/ai-overview-citations-top-10/)).
- **Bing / Copilot** asks for headings, tables, FAQ sections, evidence and freshness via IndexNow ([Bing AI Performance](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/); [Microsoft Advertising](https://about.ads.microsoft.com/en/blog/post/october-2025/optimizing-your-content-for-inclusion-in-ai-search-answers)). IndexNow already runs here.
- **llms.txt:** Google says Search does not use it; 97% of llms.txt files got no requests in May 2026 ([Ahrefs](https://ahrefs.com/blog/llmstxt-study/)). Keep ours as a free extra and expect nothing from it.
- **AI clicks are scarce:** users clicked a result on 8% of visits with an AI summary vs 15% without ([Pew 2025](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)). The page has to win the click with something a summary cannot give: a fitting, a measured size, real photos.

## 5. Paid search

- Quality Score includes landing page experience: relevance to the keyword, the ad's CTA mirrored, key information near the top, fast on mobile, no clutter ([Google Ads](https://support.google.com/google-ads/answer/6167118)).
- The healthcare policy's Singapore section does not restrict a pillow. The real risk is **Misrepresentation → unreliable claims** ("unproven claims of cures", improbable results); Google may defer to local rules on health claims and testimonials ([policy](https://support.google.com/adspolicy/answer/6020955)).
- "Health" is a sensitive interest category. Positioning the pillow as managing a **chronic** condition can block remarketing and Customer Match.
- AI Max **final URL expansion** can send ad traffic to any relevant page, guides included, and writes ad text from page copy ([Google Ads](https://support.google.com/google-ads/answer/15910187)). Every guide must stay claim-safe, or be excluded.
- No study settles guide vs dedicated landing page. Guidance points to guides for informational keywords and a shorter, noindexed variant for transactional ones.
- "custom pillow" needs negative keywords: photo, print, printed, personalised, name, cushion, face, pet, corporate gift.

## 6. Singapore claim rules (not legal advice; owner to confirm)

- **HSA:** the Health Products Act defines a medical device by intended purpose, including the "alleviation" of injury and support of the anatomy for medical purposes. HSA judges intended purpose by how the product is designed and/or presented (GL-06). A heat pad for "pain relief" is a device; the same pad "for keeping warm" is not ([HSA overview](https://www.hsa.gov.sg/medical-devices/regulatory-overview); [classification guide](https://www.hsa.gov.sg/docs/default-source/hprg-mdb/regulatory-updates/medical-devices-product-classification-guide.pdf)).
  - Likely fine: "supports your head and neck", "helps keep your neck in a neutral position", "fitted to your shoulder width and sleep position".
  - Likely to make it a device: "relieves / treats neck pain", "for cervical spondylosis", "corrects posture or spinal alignment", "orthopaedic", "clinically proven".
  - If a device (likely Class A), advertising rules (GN-08) ban healthcare-professional testimonials, unqualified superlatives and "guaranteed".
- **ASAS Singapore Code of Advertising Practice:** substantiate claims; testimonials must be genuine and typical; no cure claims. Appendix G bars treatment references for chronic backache, arthritis, osteoarthritis (so cervical spondylosis), migraine and chronic insomnia. A named doctor must be Singapore-registered; a non-medical "Dr" needs a footnote ([SCAP](https://asas.org.sg/Portals/0/SCAP%202008_1.pdf)).
- **Consumer Protection (Fair Trading) Act, Second Schedule item 16:** content presented as an objective editorial or scientific report, but made mainly to sell, is unfair unless it says it is a promotion. A seller-written guide must say who wrote it and that we make and sell the pillow ([CPFTA](https://sso.agc.gov.sg/Act/CPFTA2003)).
- **Conflict with `docs/marketing-page/persona.md`:** it allows "neck pain relief" as claim-safe wording, but the HSA reading above treats "relief" as the word most likely to make the pillow a device. Existing copy to review: `premiumMpillow.whoItsForItems` (lists head and spine surgery, scoliosis, acid reflux, sleep apnea, numb fingers) and `cervicalNeckSupport.benefits` ("significantly reduce pain", "promotes better breathing").

## 7. Layout and writing research

| Finding | Source | Rule for the guides |
|---|---|---|
| Readers scan headings first and dive into one section (layer-cake), the most effective pattern | [NN/g](https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/) | H2s read as an outline on their own, keyword first |
| Conclusion first; readers can stop anywhere | [NN/g inverted pyramid](https://www.nngroup.com/articles/inverted-pyramid/) | Each section opens with a 1–2 sentence answer |
| A summary at the top helps readers judge relevance | [NN/g long-form](https://www.nngroup.com/articles/formatting-long-form-content/) | The Answer lede, styled as a shaded "Short answer" block. Per `CONTEXT.md`, it is the same field, not a second TL;DR |
| A table of contents near the top, in the body, beats a sticky one on mobile | [NN/g TOC](https://www.nngroup.com/articles/table-of-contents/) | Inline "On this page" list after the lede |
| Accordions hurt when people need most of the content | [NN/g accordions](https://www.nngroup.com/articles/accordions-complex-content/) | Body stays open; only FAQ and sources collapse |
| Comparison tables work for ≤5 options with consistent attributes | [NN/g comparison tables](https://www.nngroup.com/articles/comparison-tables/) | At most 3–4 options × 5–6 rows; cards on phones |
| Split sentences over 25 words; plain English | [GOV.UK](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/) | Matches `content-standard.md`; enforce in a check |
| Anything that looks like an ad is ignored | [NN/g banner blindness](https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/) | Inline CTAs look like content: a sentence plus a button at decision points |
| Advertising lowers trust in health pages; clear layout and authorship raise it | [Sbaffi & Rowley 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5495972) | No CTA inside the red-flags box; byline and dates visible |
| Only 41% of users watched product videos; place video beside the images it explains | [Baymard](https://www.baymard.com/blog/embedding-product-page-videos) | Video sits in the section it demonstrates, with the steps also in text |
| A facade replaces the ~540 KB YouTube player until click | [Chrome Lighthouse](https://developer.chrome.com/docs/lighthouse/performance/third-party-facades) | Reuse `components/effects/youtube-autoplay-on-view.tsx` |
| Captions are WCAG 2.2 Level A; audio description not needed if narration covers what is shown | [W3C 1.2.2](https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html), [1.2.5](https://www.w3.org/WAI/WCAG22/Understanding/audio-description-prerecorded.html) | Narrate each step ("measure from here to here"), caption it, add a text summary |

A reference page that combines most of this: [Sleep Foundation, best sleeping position for neck pain](https://www.sleepfoundation.org/sleeping-positions/best-sleeping-position-for-neck-pain).

## 8. Media

### Already on the site (`public/`)

| File | Shows | Best guide |
|---|---|---|
| `sizecomparison.webp` | Shoulder width sets size XS–XL | custom, neck pain |
| `diff-body-back-sleep.webp` | Flat head, round head, long neck, short neck, curved neck, each with its build | neck pain, custom |
| `3way-side-sleep.jpg` | Back and side sleeping on one pillow (4 frames) | neck pain |
| `round-flat-head-comp.png` | Cervical support suits a round head and curved neck, not a flat head | cervical |
| `cns-insert.png`, `cns-contact-point.png`, `mpillow-cervical-neck.webp`, `bev-back-sleep.png` | Cervical neck support insert and contact points | cervical |
| `shoulderlength_800x.webp`, `NeckDepth_800x.webp`, `HeadDepth_800x.webp`, `necklength_800x.webp` | Real how-to-measure photos | custom |
| `3_compartment.webp`, `stitch-inner-component.webp`, `fillings.webp`, `five-sizes.webp`, `wash-care.webp` | Build, compartments, fillings, sizes, care | custom |

YouTube (titles from oEmbed):
- `nvFI6woJD9g`: "New Bespoke Ergonomic Pillow Review - The MPillow", from Dr Steven Hulme's channel. Check his registration before calling him "Dr" in copy (SCAP).
- `V2H03lq9IYU`: "Premium Mpillow Customisation Process" (own channel).
- `LxtHJL9s58E`: "Mpillow Washing Dismantle Guide" (own).
- `r9XfezALQhA`: "How to measure male horizontal shoulder-width", a **third-party** channel, used on the Basic slide-in.

### Missing (in priority order)

1. **Alignment diagrams**: side and back sleeper, each too high / too low / about right, with the neck line drawn. Used on all three guides. Commission them; no X-rays, MRIs or red pain overlays.
2. **Own how-to-measure video** (30–60 s, narrated, captioned) to replace the third-party clip.
3. **Studio fitting**: photos of a real fitting in the Singapore studio, plus a 60–120 s clip (measure → build → try → adjust), with signed consent.
4. **Cervical neck support clip** (20–40 s): what the insert is, where it sits, how staff decide.
5. **Pillow-types illustration** for the cervical guide: standard, contour, cervical roll, adjustable, fitted modular.
6. **One OG image per guide** (1200×630).

Licensing: commissioned work with a written licence; [Servier Medical Art](https://smart.servier.com/terms-of-use) (CC BY 4.0) only for anatomy if needed, with credit.

## 11. Decision research (22 Nov 2026)

Done before the owner answered D1–D6. Primary texts were read where they could be reached; the HSA and AHPC PDFs were extracted with `pdftotext` and quoted verbatim.

### D1: blog hubs vs guides

- **Inherited URLs.** In `lib/__fixtures__/shopify-redirect-map.json`, 39 mpillow.com URLs redirect to the three blog hubs (neck pain 18, custom 12, cervical 9) and 5 to the guides. `MERGED_BLOG_SLUGS` sends 27 more old custom.mpillow.com slugs to the hubs (12, 11, 4). 14 live posts link to a hub.
- **Google.** "Redirects and Google Search": 301 and 308 both mean "a page has permanently moved", and for permanent redirects "the indexing pipeline uses the redirect as a signal" that the target should be canonical. The page says nothing on chains or a hop limit, so repoint every row straight at the final URL rather than relying on Google to follow chains. [Google](https://developers.google.com/search/docs/crawling-indexing/301-redirects), [canonical methods](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- **Practice.** Consolidation means moving the best sections into the surviving page, then redirecting. [Search Engine Land](https://searchengineland.com/content-consolidation-seo-386518)

### D2: HSA and claim wording

From HSA **GL-06-R2 Medical Devices Product Classification Guide (Oct 2023)**:

- Definition (First Schedule, Health Products Act): "Diagnosis, prevention, monitoring, treatment or alleviat[ion] of disease"; "Diagnosis, monitoring, treatment or alleviation of, or compensation for, an injury"; "Investigation, replacement, modification or support of the anatomy or of a physiological process, mainly for medical purposes".
- Test: "The intended purpose of the product taking into account the way the product is designed and/or presented", and "the primary mode of action … is typically achieved by physical means (including mechanical action, replacement of, or support of the anatomy …)". A pillow acts physically, so presentation decides it.
- p.16: "Hot or cold packs, Heat pads" are a **Medical Device**: "Generally intended for pain relief." They are **Not Medical Device** when "Labelled with specific intended purpose to exclude these products … An example is heat pads labelled for keeping warmth in cold weather."
- p.27: "products intended for … maintenance of general state of health (ie. weight management, recreational use, sleep management …) are not considered medical devices." A "Foot patch intended to maintain good health, promote good sleep, to soothe or relax muscle" is **Not Medical Device**. "Bandages or support for sprains or injuries" is a **Medical Device**.
- HSA's overview page: products for "general well-being without specific medical claims, such as … massagers, are **not** medical devices". Class A devices are exempt from product registration, but every medical device needs a dealer's licence. [HSA overview](https://www.hsa.gov.sg/medical-devices/regulatory-overview)
- If it were a device, its ads must have claims "substantiated with scientific studies", no "unqualified superlatives", and must "not in any way discourage the public from seeking the advice of a medical professional". [HSA advertisements](https://www.hsa.gov.sg/medical-devices/advertisement-post-market-surveillance-and-safety-monitoring/advertisements-and-promotions/)
- Route to ask: HSA's self-help tool "Is my product a medical device?" (selfhelp.hsa.gov.sg), then a written enquiry.
- **Site copy at risk today:** `en-US.ts` lines 226, 272–281, 341, 353, 357–370, and the zh-CN lines with 缓解 / 呼吸 / 手术 / 脊柱侧弯 / 胃酸逆流 / 睡眠呼吸暂停. In the blog, 16 posts have 1–8 risky phrases; the CPAP / sleep apnoea post has 8, and Google's own Health-category example is "Medical devices for sleep apnea like CPAP machines".

### D3: a named physiotherapist

AHPC **Code of Professional Conduct** (extracted from the PDF):

- 5.2: advertising a registrant does or supports must be "truthful, factual and accurate" and must not have "unsubstantiated or embellished claims in relation to a product or service".
- 5.3: "You must not support or engage in any advertisements that are misleading, false, unfair or exaggerated."
- **5.7.2**: "You may be invited to participate in activities not limited to events, conferences, talks, publications or educational websites sponsored by companies marketing healthcare, pharmaceutical or medical products. You must ensure that your participation does not occur in such a way as to appear to endorse such products, or persuade patients or members of the public to use the products. All potential conflicts of interest should be declared to the audience."
- 11.5: no "marketing and sales of products or services which are not in keeping with the practices of the profession … when acting in your professional capacity".
- Partners earn Commission on referred sales (`CONTEXT.md`, Partner portal), which is a conflict to declare under 5.7.2.

So the credit has to be an accuracy check on the health facts, away from buttons and product photos, with the commission declared. [AHPC regulations and code](https://www.ahpc.gov.sg/for-professionals/regulations-guidelines-and-circulars/)

### D4: media

- Google Search shows video results only for pages where the video is the main content. Since 2023, "Video mode" shows "only … pages where video is the main content", and the indexing report flags "Video isn't on a watch page". A guide with an embedded clip is a text page, so the clip earns no video result there; YouTube is its watch page. [Google blog](https://developers.google.com/search/blog/2023/12/video-is-the-main-content), [Video SEO](https://developers.google.com/search/docs/appearance/video), [indexing report](https://support.google.com/webmasters/answer/9495631)
- Google's AI-features guidance rewards first-hand, non-commodity content (§4), which favours real staff and real fittings over stock polish.

### D5: Google Ads

- Personalised advertising: Health is a sensitive interest category, including "Physical or mental health conditions" and "Products, services, or procedures to treat or manage chronic health conditions". When promoting in one, "Your data segments" (formerly remarketing) and Customer Match are "Not supported". Custom segments "pointing to sensitive landing pages will only serve with Display campaigns to non-sensitive audiences or contextually". [Policy](https://support.google.com/adspolicy/answer/143465), [Health](https://support.google.com/adspolicy/answer/16701855)
- Misrepresentation, unreliable claims: no "inaccurate claims or claims that entice the user with an improbable result". [Policy](https://support.google.com/adspolicy/answer/6020955)
- AI Max final URL expansion sends users "to the landing page from your domain that is predicted to perform best". URL exclusions take exact URLs, page-feed labels or "URL contains" rules. These match whole tokens: "guide" does not match "guides". [AI Max](https://support.google.com/google-ads/answer/15910187), [URL exclusions](https://support.google.com/google-ads/answer/18788711)
- Healthcare and medicines policy has no section on non-medical consumer products such as pillows. [Policy](https://support.google.com/adspolicy/answer/176031)

### D6: who reads Chinese

Census 2020, Chinese residents, language most often spoken at home (data.gov.sg dataset `d_68860ef451f948e62754a830b6ae5024`, computed here):

| Age | English | Mandarin | Dialects | Mandarin only |
|---|---|---|---|---|
| 25–34 | 54% | 43% | — | — |
| 35–54 | 46% | 46% | 8% | 9% |
| 55–74 | 32% | 46% | 21% | 12% |

Nationally, English is the most-spoken home language for 48.3% of residents (2020, up from 32.3% in 2010). [SingStat](https://www.singstat.gov.sg/-/media/files/publications/cop2020/sr1/executive-summary.pdf)
