/**
 * Rule (r) (ADR 0030): is this Customer a partner? `is_partner_customer()` in
 * SQL is the answer the earn job, the Claim and Staff adjustments use; this
 * is the same rule for code that already holds the rows, and
 * __tests__/partner.test.ts holds the two equal. A partner holds no points.
 */

export interface PartnerMatchRow {
  auth_user_id: string | null;
  email: string;
  application_status: string;
  backup_email: string | null;
  backup_email_verified: boolean;
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/**
 * Pure — whether any approved partner row holds the Customer's login, their
 * email, or (verified) their backup email; emails compared without case.
 */
export function isPartnerMatch(
  customer: { auth_user_id: string | null; email: string },
  partners: readonly PartnerMatchRow[],
): boolean {
  const email = norm(customer.email);
  return partners.some(
    (p) =>
      p.application_status === "approved" &&
      ((customer.auth_user_id != null && p.auth_user_id === customer.auth_user_id) ||
        (email !== "" && norm(p.email) === email) ||
        (p.backup_email_verified && email !== "" && norm(p.backup_email) === email)),
  );
}
