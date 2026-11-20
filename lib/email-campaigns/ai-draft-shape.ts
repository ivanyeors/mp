import { z } from "zod";
import {
  BUTTON_STYLES,
  CONTENT_LIMITS,
  EmailBlockSchema,
  PRODUCT_LAYOUTS,
  type BlockButton,
  type BlockButtonTarget,
  type EmailBlock,
  type Paragraph,
  type Run,
  type TextRun,
} from "./content";
import { DRAFT_GOALS, DRAFT_LIMITS } from "./ai-draft-brief";
import { CAMPAIGN_LIMITS } from "./rules";
import type { VariableKey } from "./variables";

const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CAMPAIGN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DraftRequestSchema = z.strictObject({
  campaignId: z.string().regex(CAMPAIGN_ID).nullable(),
  scope: z.enum(["email", "text"]),
  subject: z.string().max(CAMPAIGN_LIMITS.subject),
  name: z.string().max(CAMPAIGN_LIMITS.name),
  about: z.string().trim().max(DRAFT_LIMITS.about, `At most ${DRAFT_LIMITS.about} characters.`),
  goal: z.enum(DRAFT_GOALS).nullable(),
  products: z
    .array(z.string().regex(PRODUCT_ID, "Choose products from the shop."))
    .max(DRAFT_LIMITS.products, `At most ${DRAFT_LIMITS.products} products.`)
    .refine((ids) => new Set(ids).size === ids.length, "That product is chosen already."),
  existing: z
    .array(z.string())
    .max(CONTENT_LIMITS.blocks * 4)
    .refine((w) => w.join("\n").length <= DRAFT_LIMITS.existing, "The email is too long to send along."),
});
export type DraftRequest = z.output<typeof DraftRequestSchema>;

export const existingWords = (words: readonly string[]) => words.map((w) => w.trim()).filter(Boolean);

export const AI_DRAFT_KEPT_ACTION = "email_campaign.ai_draft_kept";

export type DraftEvent =
  | { type: "stage"; stage: "writing" }
  | { type: "subjects"; subjects: string[] }
  | { type: "preheaders"; preheaders: string[] }
  | { type: "block"; block: EmailBlock }
  | { type: "restart" }
  | { type: "done"; draftId: string; notes: string[] }
  | { type: "error"; error: string };

export const DRAFT_BUTTON_TARGETS = ["sign_in", "shop", "book_fitting", "customise_mpillow", "customise_mbolster"] as const satisfies readonly BlockButtonTarget[];

export const productKey = (i: number) => `p${i + 1}`;

const draftRuns = z
  .array(
    z.union([
      z.strictObject({
        text: z.string().describe("Plain words. A line break is \\n. No markdown, no HTML, no links."),
        bold: z.boolean().optional(),
        italic: z.boolean().optional(),
      }),
      z.strictObject({ var: z.literal("first_name").describe("The reader's first name, filled in at send.") }),
    ]),
  )
  .describe("The words of one paragraph or bullet, in runs.");

const draftParagraphs = z.array(
  z.union([
    z.strictObject({ kind: z.literal("p"), runs: draftRuns }),
    z.strictObject({ kind: z.literal("bullets"), items: z.array(draftRuns).describe("Each bullet's runs.") }),
  ]),
);

const notes = z.array(z.string()).describe("Short notes for the person who will read the draft: what to check or fill in. Never sent.");

function draftBlockSchemas(products: number) {
  const keys = Array.from({ length: products }, (_, i) => productKey(i)) as [string, ...string[]];
  const button = z.strictObject({
    label: z.string().describe("At most 40 characters."),
    target: z.enum(products ? [...DRAFT_BUTTON_TARGETS, "product"] : DRAFT_BUTTON_TARGETS),
    ...(products ? { product: z.enum(keys).optional().describe("The product's key, for a product button only.") } : {}),
    style: z.enum(BUTTON_STYLES),
  });
  return {
    heading: z.strictObject({
      type: z.literal("heading"),
      level: z.union([z.literal(1), z.literal(2)]).describe("1 for the email's title, 2 for a heading within it."),
      text: z.string().describe("At most 120 characters."),
    }),
    text: z.strictObject({ type: z.literal("text"), paragraphs: draftParagraphs }),
    buttons: z.strictObject({ type: z.literal("buttons"), buttons: z.array(button).describe("One button, or two side by side.") }),
    divider: z.strictObject({ type: z.literal("divider") }),
    ...(products
      ? {
          products: z.strictObject({
            type: z.literal("products"),
            products: z.array(z.enum(keys)).describe("Keys of picked products, each once."),
            layout: z.enum(PRODUCT_LAYOUTS),
            buttonLabel: z.string().describe("At most 40 characters, such as Shop now."),
          }),
        }
      : {}),
  };
}

export function draftOutputSchema({ scope, products }: { scope: DraftRequest["scope"]; products: number }) {
  if (scope === "text") {
    return z.strictObject({ paragraphs: draftParagraphs.describe("The text block's paragraphs and bullets."), reviewerNotes: notes });
  }
  const { heading, text, buttons, divider, products: shown } = draftBlockSchemas(products);
  return z.strictObject({
    subjects: z.array(z.string()).describe("Exactly three subject lines, each under 60 characters."),
    preheaders: z.array(z.string()).describe("Exactly two preview lines of 40 to 90 characters that follow the subject without repeating it."),
    blocks: z.array(shown ? z.union([heading, text, buttons, divider, shown]) : z.union([heading, text, buttons, divider])),
    reviewerNotes: notes,
  });
}

type DraftRunsIn = z.output<typeof draftRuns>;
type DraftParagraphsIn = z.output<typeof draftParagraphs>;

export function wordsAsRuns(text: string, marks: Omit<TextRun, "text">, keys: readonly VariableKey[] = ["first_name"]): Run[] {
  const named = new Set<string>(keys);
  return text
    .split(/(\{[a-z_]+\})/)
    .filter(Boolean)
    .map((part): Run => {
      const key = part.slice(1, -1);
      return part.startsWith("{") && named.has(key) ? { var: key as VariableKey } : { text: part, ...marks };
    });
}

function runsOf(runs: DraftRunsIn): Run[] {
  return runs.flatMap((r): Run[] => {
    if ("var" in r) return [{ var: r.var }];
    return wordsAsRuns(r.text, { ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}) });
  });
}

export function paragraphsFrom<R>(paragraphs: readonly ({ kind: "p"; runs: R[] } | { kind: "bullets"; items: R[][] })[], runs: (r: R[]) => Run[]): Paragraph[] {
  return paragraphs.flatMap((p): Paragraph[] => {
    if (p.kind === "p") {
      const mapped = runs(p.runs);
      return mapped.length ? [{ kind: "p", runs: mapped }] : [];
    }
    const items = p.items.map(runs).filter((r) => r.length);
    return items.length ? [{ kind: "bullets", items }] : [];
  });
}

const paragraphsOf = (paragraphs: DraftParagraphsIn) => paragraphsFrom(paragraphs, runsOf);

export const issueText = (e: z.ZodError) => {
  const issue = e.issues[0];
  return issue ? `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}` : "doesn't fit the email";
};

export function blockFromDraft(
  raw: unknown,
  id: string,
  products: readonly string[],
): { ok: true; block: EmailBlock } | { ok: false; problem: string } {
  const type = raw && typeof raw === "object" && "type" in raw ? String((raw as { type: unknown }).type) : "";
  const schemas: Record<string, z.ZodType> = draftBlockSchemas(products.length);
  const schema = Object.hasOwn(schemas, type) ? schemas[type] : null;
  if (!schema) return { ok: false, problem: `"${type || "a block"}" is not a block Claude may write` };
  const drafted = schema.safeParse(raw);
  if (!drafted.success) return { ok: false, problem: `${type}: ${issueText(drafted.error)}` };

  const byKey = (k: string | undefined) => (k ? products[Number(k.slice(1)) - 1] : undefined);
  const d = drafted.data as Record<string, unknown>;
  let candidate: unknown;
  if (type === "text") {
    candidate = { id, type, paragraphs: paragraphsOf(d.paragraphs as DraftParagraphsIn) };
  } else if (type === "buttons") {
    const buttons = d.buttons as (Omit<BlockButton, "product"> & { product?: string })[];
    candidate = {
      id,
      type,
      buttons: buttons.map(({ product, ...b }) => (b.target === "product" ? { ...b, product: byKey(product) } : b)),
    };
  } else if (type === "products") {
    candidate = { ...d, id, products: [...new Set((d.products as string[]).map(byKey))] };
  } else {
    candidate = { ...d, id };
  }
  const saved = EmailBlockSchema.safeParse(candidate);
  return saved.success ? { ok: true, block: saved.data } : { ok: false, problem: `${type}: ${issueText(saved.error)}` };
}

export const textBlockFromDraft = (paragraphs: unknown, id: string) => blockFromDraft({ type: "text", paragraphs }, id, []);
