export interface PartnerMatchRow {
  auth_user_id: string | null;
  email: string;
  application_status: string;
  backup_email: string | null;
  backup_email_verified: boolean;
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

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
