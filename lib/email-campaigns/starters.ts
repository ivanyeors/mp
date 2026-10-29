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
 * Playbooks (PRD-crm-retention-loop slice 07) join them in
 * `PLAYBOOK_STARTERS`, written word for word for one stage's Segment.
 */
import type { CampaignWords } from "./clear-all";
import { CONTENT_VERSION, contentFromLegacy, emptyBlock, newBlockId, type CampaignContent, type EmailBlock, type EmailBlockType } from "./content";
import { EMPTY_CAMPAIGN_DRAFT, FIRST_CAMPAIGN_DRAFT, type CampaignAudience, type CampaignDraft } from "./rules";

/**
 * Who a Starter is written for: the audience it sets as it lands, in the same
 * step as its blocks. A Playbook names its stage's Segment, found among the
 * Segments by name; the Segment is left to choose when none has that name.
 */
export type StarterAudience = { audience: Exclude<CampaignAudience, "segment"> } | { audience: "segment"; segment: string };

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

/**
 * The CRM's Playbooks (PRD-crm-retention-loop slice 07): *Second purchase*,
 * *Thank you*, *We miss you* and *Welcome back*, each written word for word
 * (`words`) for its stage's Segment (`audience`). That slice adds them here,
 * once the owner has approved their words; the Start panel and the palette
 * list them after the invitation.
 */
export const PLAYBOOK_STARTERS: readonly Starter[] = [];

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
 * anyone. A Playbook's Segment is the one of `segments` with its name.
 */
export function starterAudience(s: Starter, segments: readonly { id: string; name: string }[]): Partial<Audienced> {
  const a = s.audience;
  if (!a) return {};
  if (a.audience !== "segment") return { audience: a.audience };
  return { audience: "segment", segmentId: segments.find((x) => x.name === a.segment)?.id ?? "" };
}

/**
 * Pure — an email started from `s` (the Start panel): `blocks` (the
 * Starter's, as the editor put them in) in place of nothing, its words when
 * it has them, and its audience. A campaign written before blocks becomes a
 * block campaign, its empty message box and button gone; the greeting
 * switch and the fallbacks set so far stay.
 */
export function startedFrom<T extends CampaignWords & Audienced>(
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
