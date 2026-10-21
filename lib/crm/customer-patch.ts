import { z } from "zod";

/**
 * Saving a Customer's details from the Admin Panel (PATCH /api/shop/customers/[id]).
 *
 * The client sends only the fields that changed, and the route writes and
 * audits only those. An empty name or phone clears it (null): a Customer may
 * have no name, and saving one must not fail for it. Notes are not here: they
 * are Customer notes (lib/crm/notes.ts), and `customers.notes` is retired.
 */

/** Trimmed text; empty means "clear it". */
const clearable = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

export const UpdateCustomerSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address."),
    first_name: clearable(120),
    last_name: clearable(120),
    phone: clearable(40),
    locale: z.string(),
    tags: z.array(z.string().trim().min(1).max(60)).max(50),
  })
  .partial()
  .strict();

export type CustomerPatch = z.infer<typeof UpdateCustomerSchema>;

export const EDITABLE_CUSTOMER_FIELDS = ["email", "first_name", "last_name", "phone", "locale", "tags"] as const;
export type EditableCustomerField = (typeof EDITABLE_CUSTOMER_FIELDS)[number];

type Values = Partial<Record<EditableCustomerField, unknown>>;

/** What a field means for comparison: trimmed text, with empty and null the same. */
function canonical(value: unknown): unknown {
  if (typeof value === "string") return value.trim() || null;
  return value ?? null;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/**
 * The fields of `next` whose value differs from `before`, each with its old and
 * new value. Fields `next` does not name are left alone. Empty when nothing
 * changed.
 */
export function changedCustomerFields(
  before: Values,
  next: Values,
): { before: Values; after: Values } {
  const out = { before: {} as Values, after: {} as Values };
  for (const key of EDITABLE_CUSTOMER_FIELDS) {
    if (!(key in next) || same(before[key], next[key])) continue;
    out.before[key] = canonical(before[key]);
    out.after[key] = canonical(next[key]);
  }
  return out;
}
