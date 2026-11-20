import type { SupabaseClient } from "@supabase/supabase-js";
import { findCustomerByEmail, findOrCreateCustomer } from "@/lib/ecommerce/customers";
import { recordBoxConsent } from "@/lib/marketing-consent/consent";
import { normaliseResultEmail } from "@/lib/results/owner";

export interface CustomisationContact {
  email: string | null | undefined;
  name?: string | null;
  phone?: string | null;
}

export type NewCustomerFields = { first_name?: string; phone?: string };

export type FindOrCreateCustomerId = (email: string, fields: NewCustomerFields) => Promise<string>;

const NAME_MAX = 120;

export function newCustomerFields(contact: Pick<CustomisationContact, "name" | "phone">): NewCustomerFields {
  const fields: NewCustomerFields = {};
  const name = contact.name?.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  if (name) fields.first_name = name;
  const phone = contact.phone?.trim();
  if (phone) fields.phone = phone;
  return fields;
}

export const findOrCreateCustomerId: FindOrCreateCustomerId = async (email, fields) => {
  try {
    return (await findOrCreateCustomer(email, fields)).id;
  } catch (e) {
    const raced = await findCustomerByEmail(email);
    if (raced) return raced.id;
    throw e;
  }
};

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
