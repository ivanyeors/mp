/**
 * Starters (PRD-campaign-email-editor slice 08, decision 8): the owner's
 * ready-made layouts, made of the same Email blocks Staff drag in one by one,
 * already arranged. Pure, and safe in the browser.
 *
 * A Starter is not a template. Started from (the Start panel of an empty
 * email) or dragged into an email (the palette's Starters tab), it becomes
 * ordinary blocks, and nothing remembers where they came from: each moves,
 * changes and deletes like any other. Its words to write are empty, on their
 * placeholders (decision 7), never sample words; its images are empty image
 * fields for Staff to fill from the Media Library, and its products none
 * until Staff choose them, so a Starter has no photo, price or offer of its
 * own. The one with finished words is the sign-in invitation: a whole email
 * someone picks on purpose, not a default to delete.
 *
 * They live in code: reviewed in a pull request, rendered by the real
 * renderer, checked against the schema (starters.test.ts). The CRM's
 * Playbooks (PRD-crm-retention-loop slice 07) are `PLAYBOOK_DRAFTS`, written
 * word for word for one stage's Segment, and join them in
 * `PLAYBOOK_STARTERS` once the owner approves each one's words.
 */
import type { CampaignWords } from "./clear-all";
import { CONTENT_VERSION, contentFromLegacy, emptyBlock, newBlockId, type CampaignContent, type EmailBlock, type EmailBlockType } from "./content";
import { EMPTY_CAMPAIGN_DRAFT, FIRST_CAMPAIGN_DRAFT, type CampaignAudience, type CampaignDraft } from "./rules";

/**
 * Who a Starter is written for: the audience it sets as it lands, in the same
 * step as its blocks. A Playbook names its stage's Segment, found among the
 * Segments by name; the Segment is left to choose when none has that name.
 * `filters` is the Customers list query that Segment saves (so Staff can make
 * it once), and a win-back sets `includeUnengaged` (PRD-campaign-audiences
 * slice 12).
 */
export type StarterAudience =
  | { audience: Exclude<CampaignAudience, "segment"> }
  | { audience: "segment"; segment: string; filters: string; includeUnengaged?: boolean };

export interface Starter {
  id: string;
  label: string;
  /** One line: what it holds. */
  description: string;
  /** Its blocks, with new ids each time it is used. */
  blocks: (id?: () => string) => EmailBlock[];
  /**
   * The words around its blocks, for a Starter written word for word (the
   * sign-in invitation, a Playbook): they fill the email it starts. Dragged
   * into an email, it brings its blocks only.
   */
  words?: { name: string; subject: string; preheader: string };
  audience?: StarterAudience;
}

type Of<T extends EmailBlockType> = Extract<EmailBlock, { type: T }>;

/** A new block of `type`, on its placeholders, as the palette adds one. */
const block = <T extends EmailBlockType>(type: T, id: () => string) => emptyBlock(type, id()) as Of<T>;

const title = (id: () => string): Of<"heading"> => ({ ...block("heading", id), level: 1 });

/** A hero's photo, heading and line, without the button: the Starter's button comes after its words. */
function hero(id: () => string): Of<"hero"> {
  const b = block("hero", id);
  delete b.button;
  return b;
}

/** An image + text without its own button. */
function split(id: () => string): Of<"split"> {
  const b = block("split", id);
  delete b.button;
  return b;
}

/** One primary button to `target`, its label on its placeholder. */
const button = (id: () => string, target: Of<"buttons">["buttons"][number]["target"] = "shop"): Of<"buttons"> => ({
  ...block("buttons", id),
  buttons: [{ label: "", target, style: "primary" }],
});

/** The layouts, each on its placeholders, in the order the Start panel and the palette show them. */
export const LAYOUT_STARTERS: readonly Starter[] = [
  {
    id: "product_launch",
    label: "Product launch",
    description: "A hero photo, a heading, some text, products and a button",
    blocks: (id = newBlockId) => [hero(id), block("heading", id), block("text", id), block("products", id), button(id)],
  },
  {
    id: "care_tips",
    label: "Care tips",
    description: "A title, some text, a photo beside a few lines, the tips and a button",
    // The tips are a text block: an empty bullet list holds no words to keep, and Bullets, or a line started with "- ", makes them one.
    blocks: (id = newBlockId) => [title(id), block("text", id), split(id), block("text", id), button(id)],
  },
  {
    id: "event",
    label: "Event or fitting day",
    description: "A hero photo, some text and a Book a fitting button",
    blocks: (id = newBlockId) => [hero(id), block("text", id), button(id, "book_fitting")],
  },
  {
    id: "short_note",
    label: "A short note",
    description: "A title, some text and a button: the closest to a plain email",
    blocks: (id = newBlockId) => [title(id), block("text", id), button(id)],
  },
];

/**
 * *New website: sign in for points*: the sign-in invitation
 * (`FIRST_CAMPAIGN_DRAFT`) as blocks, with its words and its audience, the
 * imported customers who have not signed in yet. The one Starter with
 * finished words; its points are the Claim bonus, which `pointsCheck` holds
 * back until points are live.
 */
export const INVITATION_STARTER: Starter = {
  id: "sign_in_invitation",
  label: FIRST_CAMPAIGN_DRAFT.name,
  description: "The invitation to imported customers, written in full, with its sign-in button",
  blocks: (id = newBlockId) => contentFromLegacy(FIRST_CAMPAIGN_DRAFT, id).blocks,
  words: { name: FIRST_CAMPAIGN_DRAFT.name, subject: FIRST_CAMPAIGN_DRAFT.subject, preheader: FIRST_CAMPAIGN_DRAFT.preheader ?? "" },
  audience: { audience: "imported_not_signed_in" },
};

/** A text block of paragraphs and, after them, bullets. */
const text = (id: () => string, paragraphs: readonly string[], bullets: readonly string[] = []): Of<"text"> => ({
  id: id(),
  type: "text",
  paragraphs: [
    ...paragraphs.map((p) => ({ kind: "p" as const, runs: [{ text: p }] })),
    ...(bullets.length ? [{ kind: "bullets" as const, items: bullets.map((b) => [{ text: b }]) }] : []),
  ],
});
const heading = (id: () => string, words: string, level: 1 | 2 = 1): Of<"heading"> => ({ id: id(), type: "heading", level, text: words });
const go = (id: () => string, label: string, target: Of<"buttons">["buttons"][number]["target"]): Of<"buttons"> => ({
  id: id(),
  type: "buttons",
  buttons: [{ label, target, style: "primary" }],
});

/**
 * The CRM's Playbooks (PRD-crm-retention-loop slice 07): a ready-written
 * campaign for each stage, its words (`words`) and blocks written in full for
 * its stage's Segment (`audience`). Every claim is one of `MPILLOW_FACTS`
 * (lib/ai/mpillow-facts.ts); none offers a discount, asks for a review or a
 * rating, or carries an aftercare message, and the two that speak of points
 * wait for points to be live, as every campaign that mentions them does.
 *
 * Offered once the owner approves their words: only those in
 * `APPROVED_PLAYBOOKS` are (`PLAYBOOK_STARTERS`). All four were approved on
 * 2026-11-01.
 */
export const PLAYBOOK_DRAFTS: readonly Starter[] = [
  {
    id: "playbook_second_purchase",
    label: "Second purchase",
    description: "For New customers two months after delivery: caring for their pillow, and the Mbolster that pairs with it",
    words: {
      name: "Second purchase: caring for your pillow",
      subject: "Getting the most from {your_pillow}",
      preheader: "How to keep it feeling like the first night, and the Mbolster that pairs with it.",
    },
    audience: { audience: "segment", segment: "New · delivered over 60 days ago", filters: "stage=new&delivered=over:60" },
    blocks: (id = newBlockId) => [
      heading(id, "Two months with {your_pillow}"),
      text(
        id,
        ["We hope you're sleeping well. A few things keep your pillow feeling the way it did on the first night:"],
        [
          "Its height adjusts, so you can fine-tune it as you settle in.",
          "The covers and components are washable.",
          "Layers can be replaced on their own, without replacing the whole pillow.",
        ],
      ),
      heading(id, "Meet the Mbolster", 2),
      text(id, ["Like your pillow, the Mbolster is custom-fit: made to your measurements, to support you as you sleep."]),
      go(id, "Customise your Mbolster", "customise_mbolster"),
    ],
  },
  {
    id: "playbook_thank_you",
    label: "Thank you",
    description: "For Loyal customers: a thank-you, a first look at what's new, and their points",
    words: {
      name: "Thank you: what's new, and your points",
      subject: "Thank you for coming back to Mpillow",
      preheader: "A first look at what's new, and where your points stand.",
    },
    audience: { audience: "segment", segment: "Loyal", filters: "stage=loyal" },
    blocks: (id = newBlockId) => [
      heading(id, "Thank you"),
      text(id, ["You've come back to us more than once, and that means a lot to a small Singapore team. Here's a first look at what's new."]),
      go(id, "See what's new", "shop"),
      heading(id, "Your points", 2),
      text(id, ["Your points are in your account, ready for your next order, and they never expire. Your account also shows the milestones you've reached."]),
      go(id, "See your points", "sign_in"),
    ],
  },
  {
    id: "playbook_we_miss_you",
    label: "We miss you",
    description: "For At risk customers (12 to 24 months): what's new since their last order, and their points",
    words: {
      name: "We miss you",
      subject: "It's been a while since we last saw you",
      preheader: "What's new at Mpillow, and your points, still waiting for you.",
    },
    audience: { audience: "segment", segment: "At risk · 12 to 24 months", filters: "stage=at-risk&last_order=within:24" },
    blocks: (id = newBlockId) => [
      heading(id, "It's been a while"),
      text(id, ["A lot has changed since your last order. Here's what's new in the shop."]),
      go(id, "See what's new", "shop"),
      heading(id, "Your points are still here", 2),
      text(id, ["Points never expire, so whatever you've earned is still in your account for your next order."]),
      go(id, "Sign in to see your points", "sign_in"),
    ],
  },
  {
    id: "playbook_welcome_back",
    label: "Welcome back",
    description: "For At risk · Lapsed customers (over 24 months): the re-adjustment visit, and how to reach us",
    words: {
      name: "Welcome back",
      subject: "Your pillow's fit can be retuned",
      preheader: "Book a re-adjustment visit, and see what's changed since you were last with us.",
    },
    // A win-back: it reaches the Unengaged too (PRD-campaign-audiences slice 12).
    audience: { audience: "segment", segment: "At risk · Lapsed", filters: "stage=at-risk:lapsed", includeUnengaged: true },
    blocks: (id = newBlockId) => [
      heading(id, "Welcome back"),
      text(id, [
        "It's been a while since you were last with us. Your pillow was fitted to you, and a re-adjustment visit retunes that fit to how you sleep now.",
      ]),
      text(id, ["Layers can be replaced without replacing the whole pillow, and the stuffing is covered by a 10-year warranty."]),
      go(id, "Book a visit", "book_fitting"),
      text(id, ["Questions first? Reply to this email, or reach our support team on WhatsApp or through the Support page on our website."]),
    ],
  },
];

/**
 * The Playbooks the owner has approved, by id: only these are offered. Add an
 * id once the owner has read its words (PRD-crm-retention-loop slice 07,
 * acceptance criteria). A change to an approved Playbook's words goes back to
 * the owner first.
 */
export const APPROVED_PLAYBOOKS: ReadonlySet<string> = new Set<string>([
  // Owner, 2026-11-01.
  "playbook_second_purchase",
  "playbook_thank_you",
  "playbook_we_miss_you",
  "playbook_welcome_back",
]);

/** The Playbooks offered: the approved drafts, listed after the invitation by the Start panel and the palette. */
export const PLAYBOOK_STARTERS: readonly Starter[] = PLAYBOOK_DRAFTS.filter((p) => APPROVED_PLAYBOOKS.has(p.id));

/** Every Starter, in the order they are offered. */
export const STARTERS: readonly Starter[] = [...LAYOUT_STARTERS, INVITATION_STARTER, ...PLAYBOOK_STARTERS];

/** The blank email's thumbnail, beside the Starters' (`previewStarters`): no Starter has this id. */
export const BLANK_PREVIEW = "blank";

/** Pure — the Starter called `id`, or null. */
export const starterById = (id: string): Starter | null => STARTERS.find((s) => s.id === id) ?? null;

/** Pure — a Starter's blocks as an email's content: fresh ids, no fallbacks of its own. */
export function starterContent(s: Starter, id: () => string = newBlockId): CampaignContent {
  return { v: CONTENT_VERSION, blocks: s.blocks(id), fallbacks: {} };
}

/** Pure — a new campaign started from `s`, as its thumbnail draws it and the tests read it. */
export function starterDraft(s: Starter, id: () => string = newBlockId): CampaignDraft {
  return {
    ...EMPTY_CAMPAIGN_DRAFT,
    ...(s.words ? { name: s.words.name, subject: s.words.subject, preheader: s.words.preheader || null } : { name: s.label }),
    content: starterContent(s, id),
    ...(s.audience ? { audience: s.audience.audience } : {}),
    ...(s.audience?.audience === "segment" && s.audience.includeUnengaged ? { includeUnengaged: true } : {}),
  };
}

/**
 * Pure — the email says nothing yet, whatever it is named: where the Start
 * panel is offered, on *New campaign* (a Segment's included, which is named
 * after it) and after Clear all. Typing in it, or dropping a block, ends it.
 */
export const emailSaysNothing = (w: CampaignWords) =>
  w.subject === "" && w.preheader === "" && w.body === "" && w.button.choice === "none" && !w.content?.blocks.length;

/** Who an email goes to, as the editor holds it. */
interface Audienced {
  audience: CampaignAudience;
  segmentId: string;
}

/**
 * Pure — who `s` sends the email to, or nothing for a Starter written for
 * anyone. A Playbook's Segment is the one of `segments` with its name, and a
 * win-back includes the Unengaged.
 */
export function starterAudience(
  s: Starter,
  segments: readonly { id: string; name: string }[],
): Partial<Audienced> & { includeUnengaged?: boolean } {
  const a = s.audience;
  if (!a) return {};
  if (a.audience !== "segment") return { audience: a.audience };
  return {
    audience: "segment",
    segmentId: segments.find((x) => x.name === a.segment)?.id ?? "",
    ...(a.includeUnengaged ? { includeUnengaged: true } : {}),
  };
}

/**
 * Pure — an email started from `s` (the Start panel): `blocks` (the
 * Starter's, as the editor put them in) in place of nothing, its words when
 * it has them, and its audience. A campaign written before blocks becomes a
 * block campaign, its empty message box and button gone; the greeting
 * switch and the fallbacks set so far stay.
 */
export function startedFrom<T extends CampaignWords & Audienced & { includeUnengaged?: boolean }>(
  draft: T,
  s: Starter,
  blocks: EmailBlock[],
  segments: readonly { id: string; name: string }[],
): T {
  return {
    ...draft,
    ...(s.words ?? {}),
    body: "",
    button: { choice: "none", label: "", url: "" },
    content: { v: CONTENT_VERSION, blocks, fallbacks: draft.content?.fallbacks ?? {} },
    ...starterAudience(s, segments),
  };
}
