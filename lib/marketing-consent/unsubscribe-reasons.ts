/**
 * **Unsubscribe reasons** (PRD-crm-retention-loop slice 11): why someone
 * unsubscribed from marketing email, asked after it took effect, optional, and
 * kept on the Customer. Never asked before the unsubscribe, never of a spam
 * complaint or a mail client's one-click, and no answer offers a discount or
 * asks them to stay.
 *
 * Pure and client-safe, with no zod: the question renders on the unsubscribe
 * page and in the account. The request schema and the reads are in
 * ./unsubscribe-reasons-server.
 *
 * The answers are the owner's draft (slice 11, "Answers"); the table's check
 * (20261101081458_unsubscribe_reasons.sql) lists the same keys.
 */

export const UNSUBSCRIBE_REASONS = [
  "too_many",
  "not_relevant",
  "have_what_i_need",
  "not_happy",
  "never_signed_up",
  "other",
] as const;
export type UnsubscribeReason = (typeof UNSUBSCRIBE_REASONS)[number];

/** The one closed question. */
export const UNSUBSCRIBE_QUESTION = "Mind telling us why?";
/** Under it: optional, and it changes nothing. */
export const UNSUBSCRIBE_QUESTION_HINT = "Optional. You're unsubscribed either way.";

export const UNSUBSCRIBE_REASON_LABEL: Record<UnsubscribeReason, string> = {
  too_many: "Too many emails",
  not_relevant: "Not relevant to me",
  have_what_i_need: "I have the pillow I need",
  not_happy: "I wasn't happy with my pillow",
  never_signed_up: "I never signed up for these",
  other: "Other",
};

/** What each answer points to, so the Analytics card says where to look. */
export const UNSUBSCRIBE_REASON_AREA: Record<UnsubscribeReason, string> = {
  too_many: "How often we email (the Rest period)",
  not_relevant: "Who each campaign goes to",
  have_what_i_need: "Campaigns for people who already own one",
  not_happy: "The pillow, and aftercare",
  never_signed_up: "How consent was asked (the boxes, the import)",
  other: "Read the answers",
};

/** The most an *Other* line holds. */
export const UNSUBSCRIBE_TEXT_MAX = 500;

/**
 * The order to ask in: every answer but *Other* shuffled, *Other* last, so no
 * answer is favoured by its place. `random` is injectable for tests.
 */
export function unsubscribeAskOrder(random: () => number = Math.random): UnsubscribeReason[] {
  const rest = UNSUBSCRIBE_REASONS.filter((r) => r !== "other");
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return [...rest, "other"];
}

/** Why an answer was not recorded, as `record_unsubscribe_reason()` answers. */
export const UNSUBSCRIBE_REASON_OUTCOMES = ["recorded", "already", "not_unsubscribed", "complaint", "not_asked", "not_found"] as const;
export type UnsubscribeReasonOutcome = (typeof UNSUBSCRIBE_REASON_OUTCOMES)[number];

export const isUnsubscribeReason = (v: unknown): v is UnsubscribeReason =>
  typeof v === "string" && (UNSUBSCRIBE_REASONS as readonly string[]).includes(v);
