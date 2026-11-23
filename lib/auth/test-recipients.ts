import { supabaseAdmin } from "@/lib/supabase/server";

export interface MemberLogin {
  email: string | null;
  is_active: boolean;
  auth_user_id: string | null;
}

export const TEST_RECIPIENT_REFUSAL = "A test goes only to someone with an Admin Panel login: pick them from the list.";

const bare = (email: string) => email.trim().toLowerCase();

export function testRecipientsOf(members: readonly MemberLogin[], self: string): string[] {
  const me = bare(self);
  const others = members.filter((m) => m.is_active && m.auth_user_id && m.email).map((m) => bare(m.email!));
  return [me, ...[...new Set(others)].filter((e) => e !== me).sort()];
}

export function outsideTestRecipients(to: readonly string[], allowed: readonly string[]): string[] {
  return to.filter((t) => !allowed.includes(bare(t)));
}

export async function readTestRecipients(self: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin().from("admin_users").select("email, is_active, auth_user_id");
  return testRecipientsOf(error ? [] : ((data ?? []) as MemberLogin[]), self);
}
