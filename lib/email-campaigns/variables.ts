import { fillCopy, placeholdersIn } from "@/lib/email/copy";

export interface RecipientPillow {
  tier: "premium" | "basic" | null;
  size: string | null;
}

export interface VariableRecipient {
  firstName: string | null;
  lastName?: string | null;
  pointsBalance?: number | null;
  pillow?: RecipientPillow | null;
}

export interface CampaignVariable {
  label: string;
  description: string;
  sample: string;
  fallback: string | null;
  chineseFallback: string | null;
  example?: string;
  needsPoints?: true;
  value: (r: VariableRecipient, language: FallbackLanguage) => string | null;
}

const pointsWords = (n: number | null | undefined) => (n != null && n > 0 ? Math.floor(n).toLocaleString("en-SG") : null);

const PILLOW_NAME: Record<NonNullable<RecipientPillow["tier"]>, string> = { premium: "Premium Mpillow", basic: "Basic Mpillow" };

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

export const campaignVariable = (key: VariableKey): CampaignVariable => CAMPAIGN_VARIABLES[key];

export const POINTS_NOT_LIVE = "Points aren't live yet";

export const VARIABLE_MAX = 60;

export type VariableFallbacks = Partial<Record<VariableKey, string>>;

export const SAMPLE_RECIPIENT: Required<VariableRecipient> = {
  firstName: "Mei Ling",
  lastName: "Tan",
  pointsBalance: 1250,
  pillow: { tier: "premium", size: "M" },
};

export const NO_DETAILS: Required<VariableRecipient> = { firstName: null, lastName: null, pointsBalance: null, pillow: null };

export type PreviewAs = "customer" | "no_details";
export const PREVIEW_AS_LABEL: Record<PreviewAs, string> = { customer: "A customer", no_details: "No details" };

export function variableValue(raw: string | null | undefined): string | null {
  const v = raw?.replace(/\s+/g, " ").trim().slice(0, VARIABLE_MAX).trim();
  return v || null;
}

export type FallbackLanguage = { chinese?: boolean };

const defaultFallback = (key: VariableKey, { chinese = false }: FallbackLanguage) =>
  chinese ? campaignVariable(key).chineseFallback : campaignVariable(key).fallback;

export function fallbackWords(key: VariableKey, fallbacks: VariableFallbacks, language: FallbackLanguage = {}): string | null {
  const own = fallbacks[key];
  return variableValue(own !== undefined ? own : defaultFallback(key, language));
}

export function variableFallback(key: VariableKey, fallbacks: VariableFallbacks, language: FallbackLanguage = {}): string {
  return variableValue(fallbacks[key]) ?? defaultFallback(key, language) ?? "";
}

export function variableValues(recipient: VariableRecipient, fallbacks: VariableFallbacks, language: FallbackLanguage = {}): Record<VariableKey, string> {
  const out = {} as Record<VariableKey, string>;
  for (const key of VARIABLE_KEYS) out[key] = variableValue(campaignVariable(key).value(recipient, language)) ?? variableFallback(key, fallbacks, language);
  return out;
}

const SAMPLE_VALUES: Record<VariableKey, string> = variableValues(SAMPLE_RECIPIENT, {});

export const withSampleValues = (text: string) => fillCopy(text, SAMPLE_VALUES);

export function unknownVariablesIn(text: string): string[] {
  return placeholdersIn(text).filter((name) => !isVariableKey(name));
}
