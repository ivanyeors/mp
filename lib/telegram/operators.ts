import { supabaseAdmin } from "@/lib/supabase/server";
import { permissionsForRoleRow } from "@/lib/auth/permissions";
import {
  LINK_CODE_LENGTH,
  generateLinkCode,
  hashLinkCode,
  linkCodeExpiry,
  normalizeLinkCode,
} from "@/lib/telegram/link-codes";
import { isTelegramAction, type TelegramAction } from "@/lib/telegram/roles";

export type TelegramLinkRow = {
  id: string;
  staff_profile_id: string;
  actions: TelegramAction[];
  is_active: boolean;
  telegram_user_id: number | null;
  telegram_username: string | null;
  linked_at: string | null;
  link_code_expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id,staff_profile_id,actions,is_active,telegram_user_id,telegram_username,linked_at,link_code_expires_at,created_by,created_at,updated_at";

function toRow(data: unknown): TelegramLinkRow {
  const row = data as TelegramLinkRow;
  return { ...row, actions: (row.actions ?? []).filter(isTelegramAction) };
}

export async function listTelegramLinks(): Promise<TelegramLinkRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("telegram_operators")
    .select(COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toRow);
}

export async function getTelegramLink(id: string): Promise<TelegramLinkRow | null> {
  const { data, error } = await supabaseAdmin().from("telegram_operators").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRow(data) : null;
}

export async function createTelegramLink(input: {
  staffProfileId: string;
  profileName: string;
  actions: TelegramAction[];
  createdBy: string | null;
}): Promise<{ row: TelegramLinkRow; linkCode: string }> {
  const linkCode = generateLinkCode();
  const { data, error } = await supabaseAdmin()
    .from("telegram_operators")
    .insert({
      staff_profile_id: input.staffProfileId,
      display_name: input.profileName.slice(0, 80),
      role: "none",
      actions: input.actions,
      created_by: input.createdBy,
      link_code_hash: hashLinkCode(linkCode),
      link_code_expires_at: linkCodeExpiry().toISOString(),
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return { row: toRow(data), linkCode };
}

export async function updateTelegramLink(
  id: string,
  patch: { actions?: TelegramAction[]; is_active?: boolean },
): Promise<TelegramLinkRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("telegram_operators")
    .update(patch)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRow(data) : null;
}

export async function issueTelegramLinkCode(
  id: string,
): Promise<{ row: TelegramLinkRow; linkCode: string } | null> {
  const linkCode = generateLinkCode();
  const { data, error } = await supabaseAdmin()
    .from("telegram_operators")
    .update({
      link_code_hash: hashLinkCode(linkCode),
      link_code_expires_at: linkCodeExpiry().toISOString(),
    })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { row: toRow(data), linkCode };
}

export async function unlinkTelegramLink(id: string): Promise<TelegramLinkRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("telegram_operators")
    .update({ telegram_user_id: null, telegram_username: null, linked_at: null })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRow(data) : null;
}

export async function deleteTelegramLink(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().from("telegram_operators").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export type TelegramDenial =
  | "not_linked"
  | "inactive"
  | "profile_archived"
  | "member_inactive"
  | "member_invited"
  | "role_forbidden"
  | "forbidden";

type LinkAccess =
  | {
      ok: true;
      name: string;
      actions: TelegramAction[];
      roleName: string;
      granted: ReadonlySet<string>;
    }
  | { ok: false; reason: TelegramDenial; roleName?: string };

async function linkAccess(link: TelegramLinkRow): Promise<LinkAccess> {
  if (!link.is_active) return { ok: false, reason: "inactive" };
  const admin = supabaseAdmin();

  const { data: profile, error: profileError } = await admin
    .from("mp_staff")
    .select("id,name,archived_at,admin_user_id")
    .eq("id", link.staff_profile_id)
    .maybeSingle();
  if (profileError || !profile) return { ok: false, reason: "not_linked" };
  if (profile.archived_at) return { ok: false, reason: "profile_archived" };

  const { data: member, error: memberError } = await admin
    .from("admin_users")
    .select("id,is_active,auth_user_id,role_id")
    .eq("id", profile.admin_user_id)
    .maybeSingle();
  if (memberError || !member || !member.is_active) return { ok: false, reason: "member_inactive" };
  if (!member.auth_user_id) return { ok: false, reason: "member_invited" };

  const { data: role, error: roleError } = await admin
    .from("admin_roles")
    .select("id,name,grants_all,permissions")
    .eq("id", member.role_id)
    .maybeSingle();
  if (roleError || !role) return { ok: false, reason: "role_forbidden" };
  const granted = permissionsForRoleRow(role as { grants_all: boolean; permissions: string[] | null });
  return {
    ok: true,
    name: profile.name as string,
    actions: link.actions.filter((a) => granted.has(a)),
    roleName: role.name as string,
    granted,
  };
}

export type TelegramAuthResult =
  | {
      ok: true;
      link: TelegramLinkRow;
      name: string;
      actions: TelegramAction[];
    }
  | { ok: false; reason: TelegramDenial; roleName?: string };

export async function authorizeTelegramAction(
  telegramUserId: number,
  action: TelegramAction,
): Promise<TelegramAuthResult> {
  const { data: linkData, error: linkError } = await supabaseAdmin()
    .from("telegram_operators")
    .select(COLUMNS)
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (linkError || !linkData) return { ok: false, reason: "not_linked" };
  const link = toRow(linkData);

  const access = await linkAccess(link);
  if (!access.ok) return access;
  if (!access.granted.has(action)) return { ok: false, reason: "role_forbidden", roleName: access.roleName };
  if (!link.actions.includes(action)) return { ok: false, reason: "forbidden" };
  return { ok: true, link, name: access.name, actions: access.actions };
}

export type RedeemResult =
  | {
      ok: true;
      link: TelegramLinkRow;
      name: string;
      actions: TelegramAction[];
      denial?: TelegramDenial;
    }
  | { ok: false; reason: "invalid" | "expired" | "inactive" | "taken"; takenBy?: string };

async function profileName(staffProfileId: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from("mp_staff").select("name").eq("id", staffProfileId).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

export async function redeemTelegramLinkCode(
  rawCode: string,
  from: { id: number; username?: string | null },
  now = new Date(),
): Promise<RedeemResult> {
  const code = normalizeLinkCode(rawCode);
  if (code.length !== LINK_CODE_LENGTH) return { ok: false, reason: "invalid" };
  const hash = hashLinkCode(code);
  const admin = supabaseAdmin();

  const { data: row } = await admin.from("telegram_operators").select(COLUMNS).eq("link_code_hash", hash).maybeSingle();
  if (!row) return { ok: false, reason: "invalid" };
  const link = toRow(row);
  if (!link.link_code_expires_at || new Date(link.link_code_expires_at) <= now) {
    return { ok: false, reason: "expired" };
  }
  if (!link.is_active) return { ok: false, reason: "inactive" };

  const { data: other } = await admin
    .from("telegram_operators")
    .select("id,staff_profile_id")
    .eq("telegram_user_id", from.id)
    .maybeSingle();
  if (other && other.id !== link.id) {
    return {
      ok: false,
      reason: "taken",
      takenBy: (await profileName(other.staff_profile_id as string)) ?? undefined,
    };
  }

  const { data: bound, error } = await admin
    .from("telegram_operators")
    .update({
      telegram_user_id: from.id,
      telegram_username: from.username ?? null,
      linked_at: now.toISOString(),
      link_code_hash: null,
      link_code_expires_at: null,
    })
    .eq("id", link.id)
    .eq("link_code_hash", hash)
    .select(COLUMNS)
    .maybeSingle();
  if (error || !bound) return { ok: false, reason: "invalid" };
  const boundRow = toRow(bound);
  const name = (await profileName(boundRow.staff_profile_id)) ?? "you";
  const access = await linkAccess(boundRow);
  return access.ok
    ? { ok: true, link: boundRow, name, actions: access.actions }
    : { ok: true, link: boundRow, name, actions: [], denial: access.reason };
}
