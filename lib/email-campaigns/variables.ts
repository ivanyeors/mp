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

/**
 * The pillow a customer bought last (PRD-campaign-audiences slice 09), as
 * their purchase lines record it (`customer_purchase_lines`): its Tier and
 * size, either unknown for an old line.
 */
export interface RecipientPillow {
  tier: "premium" | "basic" | null;
  size: string | null;
}

/** What the sender knows of one recipient, for the Variables; null (or left out) for a detail they do not have. */
export interface VariableRecipient {
  firstName: string | null;
  lastName?: string | null;
  /** Points available to spend; read only for an email that uses *Points balance*. */
  pointsBalance?: number | null;
  /** Their latest pillow; read only for an email that uses *Your pillow*. */
  pillow?: RecipientPillow | null;
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
  /** The same in a campaign's 中文 version (slice 17). */
  chineseFallback: string | null;
  /** A hint for the fallback field when there is no default to start from. */
  example?: string;
  /** Offered only while points are live (`pointsLive`); the points rule counts it as a mention. */
  needsPoints?: true;
  /** How the sender fills it for one recipient: their detail, or null for none; in Chinese words with `chinese`. */
  value: (r: VariableRecipient, language: FallbackLanguage) => string | null;
}

/** A balance as an email shows it, `1,250`; none for nothing to spend. */
const pointsWords = (n: number | null | undefined) => (n != null && n > 0 ? Math.floor(n).toLocaleString("en-SG") : null);

const PILLOW_NAME: Record<NonNullable<RecipientPillow["tier"]>, string> = { premium: "Premium Mpillow", basic: "Basic Mpillow" };

/**
 * Pure — a pillow as the shop names it: *Premium Mpillow, size M*, or in a
 * campaign's 中文 version *Premium Mpillow（尺寸 M）*; product names stay in
 * English letters in both (lib/ai/mpillow-facts.ts). *Mpillow* when its Tier
 * is not recorded; none for no pillow.
 */
export function pillowWords(pillow: RecipientPillow | null | undefined, { chinese = false }: FallbackLanguage = {}): string | null {
  if (!pillow) return null;
  const name = pillow.tier ? PILLOW_NAME[pillow.tier] : "Mpillow";
  const size = pillow.size?.trim().toUpperCase();
  if (!size) return name;
  return chinese ? `${name}（尺寸 ${size}）` : `${name}, size ${size}`;
}

export const CAMPAIGN_VARIABLES = {
  first_name: {
    label: "First name",
    description: "The customer's first name.",
    sample: "Mei Ling",
    fallback: "there",
    chineseFallback: "您",
    value: (r) => r.firstName,
  },
  last_name: {
    label: "Last name",
    description: "The customer's last name.",
    sample: "Tan",
    fallback: null,
    chineseFallback: null,
    value: (r) => r.lastName ?? null,
  },
  points_balance: {
    label: "Points balance",
    description: "The points the customer has to spend, as 1,250.",
    sample: "1,250",
    fallback: null,
    chineseFallback: null,
    example: "some",
    needsPoints: true,
    value: (r) => pointsWords(r.pointsBalance),
  },
  // PRD-campaign-audiences slice 09.
  your_pillow: {
    label: "Your pillow",
    description: "The pillow the customer bought last, as the shop names it: Premium Mpillow, size M.",
    sample: "Premium Mpillow, size M",
    fallback: "your pillow",
    chineseFallback: "您的枕头",
    value: (r, language) => pillowWords(r.pillow, language),
  },
} as const satisfies Record<string, CampaignVariable>;

export type VariableKey = keyof typeof CAMPAIGN_VARIABLES;

export const VARIABLE_KEYS = Object.keys(CAMPAIGN_VARIABLES) as [VariableKey, ...VariableKey[]];

export const isVariableKey = (v: string): v is VariableKey => Object.hasOwn(CAMPAIGN_VARIABLES, v);

/** The catalogue entry, typed as one Variable rather than one of its literals. */
export const campaignVariable = (key: VariableKey): CampaignVariable => CAMPAIGN_VARIABLES[key];

/** Why *Points balance* cannot be placed now: points are not live (decision 3). */
export const POINTS_NOT_LIVE = "Points aren't live yet";

/** The most characters a Variable's value or fallback takes in an email. */
export const VARIABLE_MAX = 60;

/** Each Variable's fallback words, set once per campaign; a missing one uses the catalogue's. */
export type VariableFallbacks = Partial<Record<VariableKey, string>>;

/** A sample customer: what *Preview as: A customer* and a test send are filled with. */
export const SAMPLE_RECIPIENT: Required<VariableRecipient> = {
  firstName: "Mei Ling",
  lastName: "Tan",
  pointsBalance: 1250,
  pillow: { tier: "premium", size: "M" },
};

/** A customer with none of the details: *Preview as: No details*, which shows every fallback. */
export const NO_DETAILS: Required<VariableRecipient> = { firstName: null, lastName: null, pointsBalance: null, pillow: null };

/** Who the editor's preview shows the email to: {@link SAMPLE_RECIPIENT}, or {@link NO_DETAILS}. */
export type PreviewAs = "customer" | "no_details";
export const PREVIEW_AS_LABEL: Record<PreviewAs, string> = { customer: "A customer", no_details: "No details" };

/** Pure — a recipient's detail as an email shows it: one line, at most {@link VARIABLE_MAX} characters; null for none. */
export function variableValue(raw: string | null | undefined): string | null {
  const v = raw?.replace(/\s+/g, " ").trim().slice(0, VARIABLE_MAX).trim();
  return v || null;
}

/** Which words a fallback is in: a campaign's English, or its 中文 version's (slice 17). */
export type FallbackLanguage = { chinese?: boolean };

/** The catalogue's default in that language. */
const defaultFallback = (key: VariableKey, { chinese = false }: FallbackLanguage) =>
  chinese ? campaignVariable(key).chineseFallback : campaignVariable(key).fallback;

/**
 * Pure — the fallback words as the campaign has them: its own when it set
 * some (empty too), else the catalogue's default; null when there are none,
 * which Save refuses for a Variable the email uses. `fallbacks` are the 中文
 * version's own, with `chinese` (slice 17).
 */
export function fallbackWords(key: VariableKey, fallbacks: VariableFallbacks, language: FallbackLanguage = {}): string | null {
  const own = fallbacks[key];
  return variableValue(own !== undefined ? own : defaultFallback(key, language));
}

/** Pure — the words a customer without the detail gets: the campaign's fallback, else the catalogue's. */
export function variableFallback(key: VariableKey, fallbacks: VariableFallbacks, language: FallbackLanguage = {}): string {
  return variableValue(fallbacks[key]) ?? defaultFallback(key, language) ?? "";
}

/** Pure — every Variable's words for one recipient: their own detail, else the fallback (the 中文 version's, with `chinese`). */
export function variableValues(recipient: VariableRecipient, fallbacks: VariableFallbacks, language: FallbackLanguage = {}): Record<VariableKey, string> {
  const out = {} as Record<VariableKey, string>;
  for (const key of VARIABLE_KEYS) out[key] = variableValue(campaignVariable(key).value(recipient, language)) ?? variableFallback(key, fallbacks, language);
  return out;
}

const SAMPLE_VALUES: Record<VariableKey, string> = variableValues(SAMPLE_RECIPIENT, {});

/** Pure — words as the sample customer reads them, each `{name}` its sample: what the editor counts. */
export const withSampleValues = (text: string) => fillCopy(text, SAMPLE_VALUES);

/** Pure — the `{name}`s a subject or preview line writes that are not Variables. */
export function unknownVariablesIn(text: string): string[] {
  return placeholdersIn(text).filter((name) => !isVariableKey(name));
}
