/**
 * Variables (PRD-campaign-email-editor decision 3): a recipient's detail the
 * sender fills in when an email is sent. In a block's words a Variable is its
 * own run, `{ var: "first_name" }`; in a heading, the subject and the preview
 * line it is written `{first_name}`, as Email templates write theirs
 * (`placeholdersIn`, lib/email/copy.ts). Each has fallback words for a
 * customer who has none, set once per campaign in `content.fallbacks`. Pure,
 * and safe in the browser.
 *
 * Staff drag them in from the palette's Variables tab (slice 13). A new
 * Variable is one entry here, with how the sender fills it: a code change,
 * reviewed like a block type.
 */
import { fillCopy, placeholdersIn } from "@/lib/email/copy";

/** What the sender knows of one recipient, for the Variables; null (or left out) for a detail they do not have. */
export interface VariableRecipient {
  firstName: string | null;
  lastName?: string | null;
  /** Points available to spend; read only for an email that uses *Points balance*. */
  pointsBalance?: number | null;
}

export interface CampaignVariable {
  /** What Staff see on the chip. */
  label: string;
  /** One line: what it becomes. */
  description: string;
  /** What the editor's preview, and a test send, show for a sample customer. */
  sample: string;
  /** The words for a customer who has none, when the campaign sets none of its own; null when Staff must write them. */
  fallback: string | null;
  /** A hint for the fallback field when there is no default to start from. */
  example?: string;
  /** Offered only while points are live (`pointsLive`); the points rule counts it as a mention. */
  needsPoints?: true;
  /** How the sender fills it for one recipient: their detail, or null for none. */
  value: (r: VariableRecipient) => string | null;
}

/** A balance as an email shows it, `1,250`; none for nothing to spend. */
const pointsWords = (n: number | null | undefined) => (n != null && n > 0 ? Math.floor(n).toLocaleString("en-SG") : null);

export const CAMPAIGN_VARIABLES = {
  first_name: {
    label: "First name",
    description: "The customer's first name.",
    sample: "Mei Ling",
    fallback: "there",
    value: (r) => r.firstName,
  },
  last_name: {
    label: "Last name",
    description: "The customer's last name.",
    sample: "Tan",
    fallback: null,
    value: (r) => r.lastName ?? null,
  },
  points_balance: {
    label: "Points balance",
    description: "The points the customer has to spend, as 1,250.",
    sample: "1,250",
    fallback: null,
    example: "some",
    needsPoints: true,
    value: (r) => pointsWords(r.pointsBalance),
  },
} as const satisfies Record<string, CampaignVariable>;

export type VariableKey = keyof typeof CAMPAIGN_VARIABLES;

export const VARIABLE_KEYS = Object.keys(CAMPAIGN_VARIABLES) as [VariableKey, ...VariableKey[]];

export const isVariableKey = (v: string): v is VariableKey => Object.hasOwn(CAMPAIGN_VARIABLES, v);

/** The catalogue entry, typed as one Variable rather than one of three literals. */
export const campaignVariable = (key: VariableKey): CampaignVariable => CAMPAIGN_VARIABLES[key];

/** Why *Points balance* cannot be placed now: points are not live (decision 3). */
export const POINTS_NOT_LIVE = "Points aren't live yet";

/** The most characters a Variable's value or fallback takes in an email. */
export const VARIABLE_MAX = 60;

/** Each Variable's fallback words, set once per campaign; a missing one uses the catalogue's. */
export type VariableFallbacks = Partial<Record<VariableKey, string>>;

/** A sample customer: what *Preview as: A customer* and a test send are filled with. */
export const SAMPLE_RECIPIENT: Required<VariableRecipient> = { firstName: "Mei Ling", lastName: "Tan", pointsBalance: 1250 };

/** A customer with none of the details: *Preview as: No details*, which shows every fallback. */
export const NO_DETAILS: Required<VariableRecipient> = { firstName: null, lastName: null, pointsBalance: null };

/** Who the editor's preview shows the email to: {@link SAMPLE_RECIPIENT}, or {@link NO_DETAILS}. */
export type PreviewAs = "customer" | "no_details";
export const PREVIEW_AS_LABEL: Record<PreviewAs, string> = { customer: "A customer", no_details: "No details" };

/** Pure — a recipient's detail as an email shows it: one line, at most {@link VARIABLE_MAX} characters; null for none. */
export function variableValue(raw: string | null | undefined): string | null {
  const v = raw?.replace(/\s+/g, " ").trim().slice(0, VARIABLE_MAX).trim();
  return v || null;
}

/**
 * Pure — the fallback words as the campaign has them: its own when it set
 * some (empty too), else the catalogue's default; null when there are none,
 * which Save refuses for a Variable the email uses.
 */
export function fallbackWords(key: VariableKey, fallbacks: VariableFallbacks): string | null {
  const own = fallbacks[key];
  return variableValue(own !== undefined ? own : campaignVariable(key).fallback);
}

/** Pure — the words a customer without the detail gets: the campaign's fallback, else the catalogue's. */
export function variableFallback(key: VariableKey, fallbacks: VariableFallbacks): string {
  return variableValue(fallbacks[key]) ?? campaignVariable(key).fallback ?? "";
}

/** Pure — every Variable's words for one recipient: their own detail, else the fallback. */
export function variableValues(recipient: VariableRecipient, fallbacks: VariableFallbacks): Record<VariableKey, string> {
  const out = {} as Record<VariableKey, string>;
  for (const key of VARIABLE_KEYS) out[key] = variableValue(campaignVariable(key).value(recipient)) ?? variableFallback(key, fallbacks);
  return out;
}

const SAMPLE_VALUES: Record<VariableKey, string> = variableValues(SAMPLE_RECIPIENT, {});

/** Pure — words as the sample customer reads them, each `{name}` its sample: what the editor counts. */
export const withSampleValues = (text: string) => fillCopy(text, SAMPLE_VALUES);

/** Pure — the `{name}`s a subject or preview line writes that are not Variables. */
export function unknownVariablesIn(text: string): string[] {
  return placeholdersIn(text).filter((name) => !isVariableKey(name));
}
