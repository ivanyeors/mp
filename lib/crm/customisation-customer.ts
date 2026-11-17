import type { SupabaseClient } from "@supabase/supabase-js";
import { findCustomerByEmail, findOrCreateCustomer } from "@/lib/ecommerce/customers";
import { recordBoxConsent } from "@/lib/marketing-consent/consent";
import { normaliseResultEmail } from "@/lib/results/owner";

/**
 * Every email given in a customisation is a **Customer** (ADR 0051 a–c;
 * PRD-results-to-customer slice 01). The first question's email, *Save
 * without purchasing* and the hold each call this, ticked box or not, so a
 * shopper who stops part-way is a *Lead* Staff can find on Customers.
 *
 * - **One email, one Customer** (owner, 2026-11-15). The Customer holding the
 *   email, ignoring case, or a new one with no login.
 * - **A found Customer is never changed.** A Customer who bought before may be
 *   measuring someone they are with, so the Result's name is not theirs; and an
 *   unsigned save should change nobody's record. A new one takes the name and
 *   mobile given, the whole name in `first_name` as the fitting import does
 *   (ADR 0042 c).
 * - **The box decides consent, and only consent.** Ticked, `customisation`
 *   subscribes someone nobody has asked, never one who unsubscribed (ADR 0039).
 *   Unticked, nothing is recorded. Being a Customer is not consent.
 * - **It never fails the caller.** A failure is logged and the save, the hold
 *   or the request goes on; null says no Customer was recorded.
 */

export interface CustomisationContact {
  email: string | null | undefined;
  /** The name given with it: the configurator's `data.name`. */
  name?: string | null;
  /** Already normalised by the caller (`normalizePhone`), or null. */
  phone?: string | null;
}

/** What a Customer created from a customisation starts with. */
export type NewCustomerFields = { first_name?: string; phone?: string };

/** Finds the Customer by a normalised email, or creates one with these fields. */
export type FindOrCreateCustomerId = (email: string, fields: NewCustomerFields) => Promise<string>;

/** Longest name kept on a new Customer; the configurator's own field is shorter. */
const NAME_MAX = 120;

/** The fields a new Customer takes from the contact: only what was given. */
export function newCustomerFields(contact: Pick<CustomisationContact, "name" | "phone">): NewCustomerFields {
  const fields: NewCustomerFields = {};
  const name = contact.name?.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  if (name) fields.first_name = name;
  const phone = contact.phone?.trim();
  if (phone) fields.phone = phone;
  return fields;
}

/**
 * `findOrCreateCustomer`, safe against two saves creating the same email at
 * once: the unique index on `lower(email)` refuses the second insert, and the
 * Customer the first one made is then there to find.
 */
export const findOrCreateCustomerId: FindOrCreateCustomerId = async (email, fields) => {
  try {
    return (await findOrCreateCustomer(email, fields)).id;
  } catch (e) {
    const raced = await findCustomerByEmail(email);
    if (raced) return raced.id;
    throw e;
  }
};

/**
 * The Customer this customisation's email belongs to, found or created, with
 * the box recorded when ticked. Null when there is no usable email or the
 * Customer could not be recorded.
 */
export async function customerForCustomisation(
  admin: SupabaseClient,
  contact: CustomisationContact,
  ticked: boolean,
  findOrCreate: FindOrCreateCustomerId = findOrCreateCustomerId,
): Promise<string | null> {
  const email = normaliseResultEmail(contact.email);
  if (!email) return null;
  let customerId: string;
  try {
    customerId = await findOrCreate(email, newCustomerFields(contact));
  } catch (e) {
    console.error("[customisation] customer not recorded:", e instanceof Error ? e.message : e);
    return null;
  }
  await recordBoxConsent(admin, customerId, ticked, "customisation");
  return customerId;
}
