# Slice 00 — Claim-safe site copy and a claims check (D2, D2b)

Type: AFK (copy plus one check)
Parent: PRD `guides-content`
Status: built 22 Nov 2026; the owner approved the wording by asking for this slice to ship.

## Why first

D2 sets the wording for every guide. The same risk already sits in live copy, so the rule and its check land first, and every later slice inherits them. HSA GL-06 lists products "generally intended for pain relief" as medical devices. It treats products that "promote good sleep, to soothe or relax muscle" as not medical devices (`research.md` §11).

## What to build

1. **One shared list** in `lib/claims.ts`: the banned phrases (English and Chinese) and the banned "who it's for" conditions, exported for every check.
2. **`lib/claims.check.ts`** runs over every string in `lib/i18n/messages/en-US.ts` and `zh-CN.ts`, plus the copy held in code: the site meta description (`app/layout.tsx`), the Organization JSON-LD, the blog index description, the mp-config ledes, `lib/seo/guides-content.ts`, and the product seeds in `lib/ecommerce/inventory-sync.ts`. It must fail on today's copy (34 problems) and pass after the rewrite below. Slice 02 points the same list at `data/guides/*.md`.
3. **Rules:** in `docs/marketing-page/persona.md` rule 2 and `.claude/rules/storefront-copy.md`, replace "relief, alignment, posture, sleep quality" with: "support, alignment, comfort, fit, less strain, sleep quality. Never relieve, treat, cure, heal, correct or rehab; never pain-free, orthopaedic pillow, clinically proven or doctor-recommended; never a medical condition as who a product is for (HSA GL-06: a product presented for pain relief is a medical device)."
4. **Rewrite these strings** (en-US, then the zh-CN equivalents):

| Key | Today | Draft for approval |
|---|---|---|
| Basic slide-in feature "Ergonomic support, made simple" (`basicMpillow.features[0]`) | "A supportive shape designed to help relieve neck tension and keep you comfortable." | "A supportive shape that keeps your neck comfortable all night." |
| `configurationsParagraphs[1]` | "These different configurations support ideal sleeping posture for unrestricted airways." | "Each configuration keeps your head, neck and spine in line while you sleep." |
| `premiumMpillow.whoItsForIntro` | "…suitable for individuals who have experienced:" | "Our patented M-shaped pillow is fitted to you. It suits people who:" |
| `premiumMpillow.whoItsForItems` | neck pain; shoulder and cervical spine pain; head and cervical spine surgery; uneven shoulder height (scoliosis); acid reflux; reversed neck; sleep apnea; numb fingers | wake up with a stiff neck or shoulders · find standard pillows too high or too low · have broad or narrow shoulders · switch between back and side sleeping · have a more curved neck (ask about cervical neck support) · have uneven shoulder heights |
| `premiumMpillow.whoItsForConclusion` (appended; no new key or component) | "…improve sleep comfort and overnight alignment." | "…improve sleep comfort and overnight alignment. Had neck surgery or have a medical condition? Ask your doctor first, and bring their advice to your fitting." |
| `cervicalNeckSupport.description` | "Cervical Pillow For Neck Pain" | "Cervical support for a curved neck" |
| `cervicalNeckSupport.whyDescription` | "…to relieve that neck stiffness or neck pain caused during your sleep." | "Some necks curve more than others. Our cervical neck support fills the space under a curved neck, so it is supported all night." |
| `benefits[0]` | "Improves Neck Alignment" / "…a more comfortable and pain-free sleep." | "Supports your neck's natural curve" / "The insert fills the space under your neck, so your head and spine stay in line. Your neck muscles take less strain overnight." |
| `benefits[1]` | "Reduces Neck and Shoulder Pain" / "…can significantly reduce pain and discomfort…" | "Comfort for neck and shoulders" / "Support where your neck needs it spreads the load across your neck and shoulders, so they can stay relaxed through the night." |
| `benefits[2]` | "Enhances Sleep Quality" / "…promotes better breathing…" | "More comfortable sleep" / "A supported, comfortable position means less tossing and turning, so you can sleep more soundly." |

zh-CN drafts, same keys:

| Key | Today | Draft |
|---|---|---|
| landing feature | 稳定承托结构，帮助缓解颈部紧绷并提升舒适感。 | 稳定承托结构，整夜让颈部保持舒适。 |
| `configurationsParagraphs[1]` | 这些配置帮助你在睡眠时保持理想姿势，让呼吸更顺畅。 | 每一种配置都让头、颈与脊柱在睡眠中保持一条直线。 |
| `whoItsForIntro` | 我们的专利 M 型颈肩枕适合有以下困扰的人群： | 我们的专利 M 型枕头按你的身形定制，适合： |
| `whoItsForItems` | 颈部疼痛 … 手指麻木 | 早上醒来颈肩僵硬的人 · 觉得普通枕头太高或太低的人 · 肩膀较宽或较窄的人 · 仰睡与侧睡交替的人 · 颈部曲线较明显的人（可询问颈椎支撑垫） · 两边肩膀高度不同的人 |
| `whoItsForNote` | — | 做过颈部手术，或有睡眠呼吸暂停等状况？请先咨询医生，并把医生的建议带来量身时告诉我们。 |
| `whoItsForConclusion` | …并帮助缓解不适。 | 量身定制的颈枕，让睡眠更舒适，整夜保持对齐。 |
| `cervicalNeckSupport.description` | 颈椎枕（缓解颈部疼痛） | 为颈部曲线提供承托的颈椎支撑垫 |
| `whyDescription` | …帮助缓解睡眠中造成的颈部僵硬或颈部疼痛。 | 每个人的颈部曲线不同。颈椎支撑垫填补弯曲颈部下方的空间，让颈部整夜得到承托。 |
| `benefits[1].title` | 缓解颈部与肩部疼痛 | 颈肩更舒适 |
| `benefits[1].description` | …减轻不适，让你醒来更放松、更不僵硬。 | 在颈部需要的位置提供承托，把压力分散到颈肩，让它们整夜保持放松。 |
| `benefits[2].description` | …促进更顺畅的呼吸… | 承托稳定、姿势舒适，减少夜间翻身，睡得更安稳。 |

Found while building, and fixed in the same slice:

| Where | Today | Now |
|---|---|---|
| `mbolster.aboutParagraphs[1]` | "…help stomach sleepers breath better…" / 帮助俯睡时更易呼吸 | "…leave room for your face when you sleep on your stomach, and to help keep your spine in line." / 俯睡时为脸部留出空间，并帮助脊柱保持一条直线 |
| `app/layout.tsx` meta description and Organization JSON-LD | "fitted in-store for neck pain relief and ergonomic sleep" | "fitted in-store for neck support and ergonomic sleep" |
| Blog index description | "…improving sleep posture, neck pain relief, and choosing the perfect pillow…" | "…sleeping positions, neck support and choosing the right pillow…" |
| mp-config zh-CN lede | 模块化设计面向缓解颈椎不适… | 模块化设计支持颈椎对齐、人体工学承托与长期舒适… |
| Premium `seo_answer` seed (`inventory-sync.ts`, `answer-lede-coverage.check.ts`) | "Built for neck pain relief…" / 专为缓解颈椎不适… | "Built for cervical support…" / 专为颈椎承托… |

**Owner step (live data):** the Premium product's live `seo_answer` is stored in the database, so the seed change does not reach it. Paste the new sentences in Settings → Products → Mpillow Premium → SEO (English: "Built for cervical support, modular serviceability, and long-term comfort that goes well beyond one-size foam."; Chinese: "专为颈椎承托、模块化维护与长期舒适而设计，超越一刀切泡沫枕。").

## Acceptance criteria

- [x] `pnpm checks lib/claims.check.ts` fails on `main` today (34 problems, in the PR), and passes on the branch.
- [x] The check also fails if one banned phrase is put back: it asserts the list flags 12 known-bad sentences and passes 7 safe ones before it scans the copy.
- [x] Preview screenshots of the Premium, Basic, Cervical Neck Support, size-matters and Mbolster slide-ins, desktop and phone, sent to the owner.
- [x] Persona rule 2 and `storefront-copy.md` updated in the same PR (a correction becomes a check).

## Blocked by

None. This slice ships before the guides.
