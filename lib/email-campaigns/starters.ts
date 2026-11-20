import type { CampaignWords } from "./clear-all";
import { CONTENT_VERSION, contentFromLegacy, emptyBlock, newBlockId, type CampaignContent, type EmailBlock, type EmailBlockType } from "./content";
import { EMPTY_CAMPAIGN_DRAFT, FIRST_CAMPAIGN_DRAFT, newCampaignDraft, type CampaignAudience, type CampaignDraft } from "./rules";
import {
  afterParam,
  findWanted,
  followUpWanted,
  foundSegments,
  stageWanted,
  wantedKey,
  wantedToCreate,
  type FoundSegments,
  type MatchableSegment,
  type WantedSegment,
} from "./wanted-segment";

export type StarterAudience =
  | { audience: Exclude<CampaignAudience, "segment"> }
  | { audience: "segment"; segment: string; filters: string; includeUnengaged?: boolean };

export interface Starter {
  id: string;
  label: string;
  description: string;
  blocks: (id?: () => string) => EmailBlock[];
  words?: { name: string; subject: string; preheader: string };
  audience?: StarterAudience;
}

type Of<T extends EmailBlockType> = Extract<EmailBlock, { type: T }>;

const block = <T extends EmailBlockType>(type: T, id: () => string) => emptyBlock(type, id()) as Of<T>;

const title = (id: () => string): Of<"heading"> => ({ ...block("heading", id), level: 1 });

function hero(id: () => string): Of<"hero"> {
  const b = block("hero", id);
  delete b.button;
  return b;
}

function split(id: () => string): Of<"split"> {
  const b = block("split", id);
  delete b.button;
  return b;
}

const button = (id: () => string, target: Of<"buttons">["buttons"][number]["target"] = "shop"): Of<"buttons"> => ({
  ...block("buttons", id),
  buttons: [{ label: "", target, style: "primary" }],
});

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

export const INVITATION_STARTER: Starter = {
  id: "sign_in_invitation",
  label: FIRST_CAMPAIGN_DRAFT.name,
  description: "The invitation to imported customers, written in full, with its sign-in button",
  blocks: (id = newBlockId) => contentFromLegacy(FIRST_CAMPAIGN_DRAFT, id).blocks,
  words: { name: FIRST_CAMPAIGN_DRAFT.name, subject: FIRST_CAMPAIGN_DRAFT.subject, preheader: FIRST_CAMPAIGN_DRAFT.preheader ?? "" },
  audience: { audience: "imported_not_signed_in" },
};

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
  {
    id: "playbook_how_its_made",
    label: "How your pillow is made",
    description: "For Leads: how a custom pillow is made for them, and the two ways to start: customise online, or book a fitting",
    words: {
      name: "How your pillow is made",
      subject: "How an Mpillow is made to fit you",
      preheader: "Measured to you, its height and width tailored to you. Start by customising yours on our website.",
    },
    audience: { audience: "segment", segment: "Lead", filters: "stage=lead" },
    blocks: (id = newBlockId) => [
      heading(id, "Made to fit you"),
      text(id, ["If one-size pillows have never felt right, an Mpillow starts the other way round: from you."]),
      heading(id, "How it's made", 2),
      text(
        id,
        ["We measure things like your shoulder width and how you sleep, and tailor the pillow's height and width to you."],
        [
          "The height is adjustable, so you can fine-tune it.",
          "One pillow supports both back and side sleeping.",
          "The covers and components are washable, and layers can be replaced without replacing the whole pillow.",
        ],
      ),
      heading(id, "Two ways to start", 2),
      text(id, ["Customise your pillow on our website."]),
      go(id, "Customise your Mpillow", "customise_mpillow"),
      text(id, ["If you're in Singapore, you can book an appointment for a fitting instead."]),
      go(id, "Book a fitting in Singapore", "book_fitting"),
    ],
  },
];

export const APPROVED_PLAYBOOKS: ReadonlySet<string> = new Set<string>([
  "playbook_second_purchase",
  "playbook_thank_you",
  "playbook_we_miss_you",
  "playbook_welcome_back",
]);

export const PLAYBOOK_STARTERS: readonly Starter[] = PLAYBOOK_DRAFTS.filter((p) => APPROVED_PLAYBOOKS.has(p.id));

export const STARTERS: readonly Starter[] = [...LAYOUT_STARTERS, INVITATION_STARTER, ...PLAYBOOK_STARTERS];

export const BLANK_PREVIEW = "blank";

export const starterById = (id: string): Starter | null => STARTERS.find((s) => s.id === id) ?? null;

export function starterContent(s: Starter, id: () => string = newBlockId): CampaignContent {
  return { v: CONTENT_VERSION, blocks: s.blocks(id), fallbacks: {} };
}

export function starterDraft(s: Starter, id: () => string = newBlockId): CampaignDraft {
  return {
    ...EMPTY_CAMPAIGN_DRAFT,
    ...(s.words ? { name: s.words.name, subject: s.words.subject, preheader: s.words.preheader || null } : { name: s.label }),
    content: starterContent(s, id),
    ...(s.audience ? { audience: s.audience.audience } : {}),
    ...(s.audience?.audience === "segment" && s.audience.includeUnengaged ? { includeUnengaged: true } : {}),
  };
}

export const emailSaysNothing = (w: CampaignWords) =>
  w.subject === "" && w.preheader === "" && w.body === "" && w.button.choice === "none" && !w.content?.blocks.length;

interface Audienced {
  audience: CampaignAudience;
  segmentId: string;
}

export function starterWants(s: Starter): WantedSegment | null {
  const a = s.audience;
  return a?.audience === "segment" ? { address: { starter: s.id }, name: a.segment, filters: a.filters, who: "This Playbook", playbook: true } : null;
}

export const wantedAfterStarter = (s: Starter, current: WantedSegment | null): WantedSegment | null =>
  s.audience ? starterWants(s) : current?.playbook ? null : current;

export function playbookSegment<S extends MatchableSegment>(s: Starter, segments: readonly S[]): S | null {
  const w = starterWants(s);
  return w ? findWanted(w, segments) : null;
}

export const playbooksFound = (segments: readonly MatchableSegment[]) => foundSegments(PLAYBOOK_STARTERS.map(starterWants), segments);

export function starterAudience(s: Starter, found: FoundSegments): Partial<Audienced> & { includeUnengaged?: boolean } {
  const a = s.audience;
  if (!a) return {};
  if (a.audience !== "segment") return { audience: a.audience };
  return {
    audience: "segment",
    segmentId: found[wantedKey({ filters: a.filters })] ?? "",
    ...(a.includeUnengaged ? { includeUnengaged: true } : {}),
  };
}

export function playbookSegmentToCreate(s: Starter): { name: string; filters: Record<string, string> } | null {
  const w = starterWants(s);
  return w ? wantedToCreate(w) : null;
}

export function startedFrom<T extends CampaignWords & Audienced & { includeUnengaged?: boolean }>(
  draft: T,
  s: Starter,
  blocks: EmailBlock[],
  found: FoundSegments,
): T {
  return {
    ...draft,
    ...(s.words ?? {}),
    body: "",
    button: { choice: "none", label: "", url: "" },
    content: { v: CONTENT_VERSION, blocks, fallbacks: draft.content?.fallbacks ?? {} },
    ...starterAudience(s, found),
  };
}

export function startedFromParam(
  base: CampaignDraft,
  starterParam: string | string[] | undefined,
  found: FoundSegments,
  id: () => string = newBlockId,
): CampaignDraft {
  const wanted = Array.isArray(starterParam) ? starterParam[0] : starterParam;
  const s = wanted ? starterById(wanted) : null;
  if (!s) return base;
  const goesTo = starterAudience(s, found);
  return {
    ...base,
    ...(s.words ? { name: s.words.name, subject: s.words.subject, preheader: s.words.preheader || null } : {}),
    body: "",
    button: null,
    content: { v: CONTENT_VERSION, blocks: s.blocks(id), fallbacks: base.content?.fallbacks ?? {} },
    ...(goesTo.audience ? { audience: goesTo.audience } : {}),
    ...(goesTo.segmentId !== undefined ? { segmentId: goesTo.segmentId || null } : {}),
    ...(goesTo.includeUnengaged ? { includeUnengaged: true } : {}),
  };
}

export function newCampaignFromAddress(
  query: Readonly<Record<string, string | string[] | undefined>>,
  segments: readonly (MatchableSegment & { needsReview: boolean })[],
  parent: { id: string; name: string; archivedAt: string | null } | null,
  id: () => string = newBlockId,
): { draft: CampaignDraft; wanted: WantedSegment | null; note: string | null; found: FoundSegments } {
  const fromStage = stageWanted(query.stage);
  const followUp = followUpWanted(afterParam(query.after), parent, segments);
  const fromAddress = followUp ?? (fromStage && "wanted" in fromStage ? fromStage.wanted : null);
  const note = !followUp && fromStage && "note" in fromStage ? fromStage.note : null;
  const found = { ...playbooksFound(segments), ...foundSegments([fromAddress], segments) };

  let base = newCampaignDraft(query.segment, segments);
  if (fromAddress) base = { ...EMPTY_CAMPAIGN_DRAFT, audience: "segment", segmentId: found[wantedKey(fromAddress)] ?? null };
  else if (note) base = EMPTY_CAMPAIGN_DRAFT;
  const draft = startedFromParam(base, query.starter, found, id);

  const starter = Array.isArray(query.starter) ? query.starter[0] : query.starter;
  const s = starter ? starterById(starter) : null;
  if (s?.audience) return { draft, wanted: starterWants(s), note: null, found };
  return { draft, wanted: fromAddress, note, found };
}
