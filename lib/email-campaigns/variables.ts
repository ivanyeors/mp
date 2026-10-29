/**
 * Variables (PRD-campaign-email-editor decision 3): a recipient's detail the
 * sender fills in when an email is sent. In a block's words a Variable is its
 * own run, `{ var: "first_name" }`; in the subject and preview line it is
 * written `{first_name}`, as Email templates write theirs (`placeholdersIn`,
 * lib/email/copy.ts). Each has fallback words for a customer who has none,
 * set once per campaign in `content.fallbacks`. Pure, and safe in the
 * browser.
 *
 * Slice 03 has the one the greeting already uses. Slice 13 adds the rest and
 * the palette that drags them in: a new Variable is one entry here and its
 * value in `variableValues`, a code change reviewed like a block type.
 */
import { placeholdersIn } from "@/lib/email/copy";

export interface CampaignVariable {
  /** What Staff see on the chip. */
  label: string;
  /** One line: what it becomes. */
  description: string;
  /** What the editor's preview shows for a sample customer. */
  sample: string;
  /** The words for a customer who has none, when the campaign sets no fallback of its own. */
  fallback: string;
}

export const CAMPAIGN_VARIABLES = {
  first_name: {
    label: "First name",
    description: "The customer's first name.",
    sample: "Mei Ling",
    fallback: "there",
  },
} as const satisfies Record<string, CampaignVariable>;

export type VariableKey = keyof typeof CAMPAIGN_VARIABLES;

export const VARIABLE_KEYS = Object.keys(CAMPAIGN_VARIABLES) as [VariableKey, ...VariableKey[]];

export const isVariableKey = (v: string): v is VariableKey => Object.hasOwn(CAMPAIGN_VARIABLES, v);

/** The most characters a Variable's value or fallback takes in an email. */
export const VARIABLE_MAX = 60;

/** Each Variable's fallback words, set once per campaign; a missing one uses the catalogue's. */
export type VariableFallbacks = Partial<Record<VariableKey, string>>;

/** Pure — a recipient's detail as an email shows it: one line, at most {@link VARIABLE_MAX} characters; null for none. */
export function variableValue(raw: string | null | undefined): string | null {
  const v = raw?.replace(/\s+/g, " ").trim().slice(0, VARIABLE_MAX).trim();
  return v || null;
}

/** Pure — the words a customer without the detail gets: the campaign's fallback, else the catalogue's. */
export function variableFallback(key: VariableKey, fallbacks: VariableFallbacks): string {
  return variableValue(fallbacks[key]) ?? CAMPAIGN_VARIABLES[key].fallback;
}

/** Pure — every Variable's words for one recipient: their own detail, else the fallback. */
export function variableValues(
  recipient: { firstName: string | null },
  fallbacks: VariableFallbacks,
): Record<VariableKey, string> {
  return { first_name: variableValue(recipient.firstName) ?? variableFallback("first_name", fallbacks) };
}

/** Pure — the `{name}`s a subject or preview line writes that are not Variables. */
export function unknownVariablesIn(text: string): string[] {
  return placeholdersIn(text).filter((name) => !isVariableKey(name));
}
