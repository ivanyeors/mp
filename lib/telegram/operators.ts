import { supabaseAdmin } from "@/lib/supabase/server";
import {
  LINK_CODE_LENGTH,
  generateLinkCode,
  hashLinkCode,
  linkCodeExpiry,
  normalizeLinkCode,
} from "@/lib/telegram/link-codes";
import { telegramRoleCan, type TelegramAction, type TelegramRole } from "@/lib/telegram/roles";

/**
 * `telegram_operators` reads and writes. The settings tab (Users & permissions →
 * Telegram access) manages rows; the Telegram webhook authorizes taps and
 * redeems link codes. `link_code_hash` never leaves this module.
 */

export type TelegramOperatorRow = {
  id: string;
  display_name: string;
  role: TelegramRole;
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
  "id,display_name,role,is_active,telegram_user_id,telegram_username,linked_at,link_code_expires_at,created_by,created_at,updated_at";

export async function listTelegramOperators(): Promise<TelegramOperatorRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("telegram_operators")
    .select(COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TelegramOperatorRow[];
}

export async function getTelegramOperator(id: string): Promise<TelegramOperatorRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("telegram_operators")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TelegramOperatorRow | null) ?? null;
}

/** Creates the person and their first link code. The code is returned once. */
export async function createTelegramOperator(input: {
  displayName: string;
  role: TelegramRole;
  createdBy: string | null;
}): Promise<{ row: TelegramOperatorRow; linkCode: string }> {
  const linkCode = generateLinkCode();
  const { data, error } = await supabaseAdmin()
    .from("telegram_operators")
    .insert({
      display_name: input.displayName,
      role: input.role,
      created_by: input.createdBy,
      link_code_hash: hashLinkCode(linkCode),
      link_code_expires_at: linkCodeExpiry().toISOString(),
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return { row: data as TelegramOperatorRow, linkCode };
}

export async function updateTelegramOperator(
  id: string,
  patch: { display_name?: string; role?: TelegramRole; is_active?: boolean },
): Promise<TelegramOperatorRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("telegram_operators")
    .update(patch)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TelegramOperatorRow | null) ?? null;
}

/**
 * A fresh code replaces any earlier one. A linked person stays linked until the
 * new code is redeemed — that is how someone moves to a new Telegram account.
 */
export async function issueTelegramLinkCode(
  id: string,
): Promise<{ row: TelegramOperatorRow; linkCode: string } | null> {
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
  return { row: data as TelegramOperatorRow, linkCode };
}

export async function unlinkTelegramOperator(id: string): Promise<TelegramOperatorRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("telegram_operators")
    .update({ telegram_user_id: null, telegram_username: null, linked_at: null })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TelegramOperatorRow | null) ?? null;
}

export async function deleteTelegramOperator(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("telegram_operators")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export type TelegramAuthResult =
  | { ok: true; operator: TelegramOperatorRow }
  | { ok: false; reason: "not_linked" | "inactive" | "forbidden"; operator?: TelegramOperatorRow };

/** Is this Telegram user a linked, active operator whose role grants `action`? */
export async function authorizeTelegramAction(
  telegramUserId: number,
  action: TelegramAction,
): Promise<TelegramAuthResult> {
  const { data, error } = await supabaseAdmin()
    .from("telegram_operators")
    .select(COLUMNS)
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  // A failed read must refuse, never fall through to allowed.
  if (error || !data) return { ok: false, reason: "not_linked" };
  const operator = data as TelegramOperatorRow;
  if (!operator.is_active) return { ok: false, reason: "inactive", operator };
  if (!telegramRoleCan(operator.role, action)) return { ok: false, reason: "forbidden", operator };
  return { ok: true, operator };
}

export type RedeemResult =
  | { ok: true; operator: TelegramOperatorRow }
  | { ok: false; reason: "invalid" | "expired" | "inactive" | "taken"; takenBy?: string };

/**
 * `/link CODE` from Telegram. Single use: the code hash is cleared in the same
 * update that binds the sender, guarded on the hash still matching, so two
 * people racing the same code cannot both win.
 */
export async function redeemTelegramLinkCode(
  rawCode: string,
  from: { id: number; username?: string | null },
  now = new Date(),
): Promise<RedeemResult> {
  const code = normalizeLinkCode(rawCode);
  if (code.length !== LINK_CODE_LENGTH) return { ok: false, reason: "invalid" };
  const hash = hashLinkCode(code);
  const admin = supabaseAdmin();

  const { data: row } = await admin
    .from("telegram_operators")
    .select(COLUMNS)
    .eq("link_code_hash", hash)
    .maybeSingle();
  const operator = row as TelegramOperatorRow | null;
  if (!operator) return { ok: false, reason: "invalid" };
  if (!operator.link_code_expires_at || new Date(operator.link_code_expires_at) <= now) {
    return { ok: false, reason: "expired" };
  }
  if (!operator.is_active) return { ok: false, reason: "inactive" };

  // telegram_user_id is unique: one Telegram account speaks as one person.
  const { data: other } = await admin
    .from("telegram_operators")
    .select("id,display_name")
    .eq("telegram_user_id", from.id)
    .maybeSingle();
  if (other && other.id !== operator.id) {
    return { ok: false, reason: "taken", takenBy: other.display_name as string };
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
    .eq("id", operator.id)
    .eq("link_code_hash", hash)
    .select(COLUMNS)
    .maybeSingle();
  if (error || !bound) return { ok: false, reason: "invalid" };
  return { ok: true, operator: bound as TelegramOperatorRow };
}
