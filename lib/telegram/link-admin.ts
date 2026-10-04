/**
 * Telegram link writes for Users & permissions → Telegram (ADR 0023).
 *
 * A link may only grant actions its profile's login role holds (the matrix is
 * the ceiling), and someone who is not Owner or Admin may only grant actions
 * they hold themselves. Every change is audited as `telegram_link.*` with the
 * before/after action lists.
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import type { AdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { permissionsForRoleRow } from "@/lib/auth/permissions";
import { loginRefusal } from "@/lib/auth/login-guard";
import {
  createTelegramLink,
  deleteTelegramLink,
  getTelegramLink,
  issueTelegramLinkCode,
  unlinkTelegramLink,
  updateTelegramLink,
  type TelegramLinkRow,
} from "@/lib/telegram/operators";
import { telegramActionLabel, type TelegramAction } from "@/lib/telegram/roles";

type Refusal = { ok: false; status: 400 | 403 | 404 | 409; error: string };
export type LinkWriteResult = { ok: true; row: TelegramLinkRow; linkCode?: string } | Refusal;

type ProfileContext = {
  id: string;
  name: string;
  memberId: string;
  archived: boolean;
  memberEmail: string;
  roleName: string;
  roleGrants: ReadonlySet<string>;
};

async function profileContext(profileId: string): Promise<ProfileContext | null> {
  const admin = supabaseAdmin();
  const { data: profile, error } = await admin
    .from("mp_staff")
    .select("id,name,archived_at,admin_user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) return null;
  const { data: member } = await admin
    .from("admin_users")
    .select("id,email,role_id")
    .eq("id", profile.admin_user_id)
    .maybeSingle();
  const { data: role } = member
    ? await admin.from("admin_roles").select("name,grants_all,permissions").eq("id", member.role_id).maybeSingle()
    : { data: null };
  return {
    id: profile.id as string,
    name: profile.name as string,
    memberId: profile.admin_user_id as string,
    archived: profile.archived_at != null,
    memberEmail: (member?.email as string | undefined) ?? "",
    roleName: (role?.name as string | undefined) ?? "no role",
    roleGrants: role ? permissionsForRoleRow(role as { grants_all: boolean; permissions: string[] | null }) : new Set(),
  };
}

/**
 * May the actor touch this link at all? Its login must be one they may manage
 * (login-guard), and — unless they are Owner or Admin — they must hold every
 * action the link lists, so a new code, a switch-on or a relink never hands
 * them access they lack. That includes actions the login's role does not
 * grant today: they come back the moment someone ticks them on the role.
 */
async function manageRefusal(
  actor: AdminContext,
  profile: ProfileContext,
  link: TelegramLinkRow | null,
): Promise<Refusal | null> {
  const login = await loginRefusal(actor, profile.memberId);
  if (login) return login;
  if (!link || actor.grantsAll) return null;
  const beyond = link.actions.filter((a) => !actor.permissions.has(a));
  if (beyond.length) {
    return {
      ok: false,
      status: 403,
      error: `This link can ${beyond.map(telegramActionLabel).join(", ")}, which your role doesn't have.`,
    };
  }
  return null;
}

/** Refusal for actions the profile's role or the actor does not hold; null when all are fine. */
function actionsRefusal(
  actor: AdminContext,
  profile: ProfileContext,
  wanted: readonly TelegramAction[],
  already: readonly TelegramAction[] = [],
): Refusal | null {
  const added = wanted.filter((a) => !already.includes(a));
  const beyondRole = added.filter((a) => !profile.roleGrants.has(a));
  if (beyondRole.length) {
    return {
      ok: false,
      status: 400,
      error: `${profile.memberEmail}'s role (${profile.roleName}) doesn't include ${beyondRole.map(telegramActionLabel).join(", ")}. Change it on Roles first.`,
    };
  }
  const beyondActor = actor.grantsAll ? [] : added.filter((a) => !actor.permissions.has(a));
  if (beyondActor.length) {
    return {
      ok: false,
      status: 403,
      error: `You can't grant ${beyondActor.map(telegramActionLabel).join(", ")}: your role doesn't have it.`,
    };
  }
  return null;
}

const snapshot = (row: TelegramLinkRow, profile: string) => ({
  profile,
  actions: [...row.actions].sort(),
  active: row.is_active,
  linked: row.telegram_user_id != null,
});

export async function linkProfile(
  actor: AdminContext,
  staffProfileId: string,
  actions: TelegramAction[],
): Promise<LinkWriteResult> {
  const profile = await profileContext(staffProfileId);
  if (!profile) return { ok: false, status: 404, error: "Staff profile not found." };
  if (profile.archived) return { ok: false, status: 400, error: `${profile.name} is archived. Restore the profile first.` };

  const { data: existing } = await supabaseAdmin()
    .from("telegram_operators")
    .select("id")
    .eq("staff_profile_id", staffProfileId)
    .maybeSingle();
  if (existing) return { ok: false, status: 409, error: `${profile.name} already has Telegram access.` };
  const manage = await manageRefusal(actor, profile, null);
  if (manage) return manage;

  const refusal = actionsRefusal(actor, profile, actions);
  if (refusal) return refusal;

  const { row, linkCode } = await createTelegramLink({
    staffProfileId,
    profileName: profile.name,
    actions,
    createdBy: actor.email,
  });
  await recordAdminAction({
    actor,
    action: "telegram_link.create",
    entityType: "telegram_link",
    entityId: row.id,
    after: snapshot(row, profile.name),
  });
  return { ok: true, row, linkCode };
}

export type LinkChange =
  | { kind: "actions"; actions: TelegramAction[] }
  | { kind: "active"; isActive: boolean }
  | { kind: "new_link_code" }
  | { kind: "unlink" };

export async function changeLink(actor: AdminContext, id: string, change: LinkChange): Promise<LinkWriteResult> {
  const before = await getTelegramLink(id);
  if (!before) return { ok: false, status: 404, error: "Not found" };
  const profile = await profileContext(before.staff_profile_id);
  if (!profile) return { ok: false, status: 404, error: "Staff profile not found." };
  const name = profile.name;
  const manage = await manageRefusal(actor, profile, before);
  if (manage) return manage;

  let row: TelegramLinkRow | null = before;
  let linkCode: string | undefined;
  let action: string;
  switch (change.kind) {
    case "actions": {
      const refusal = actionsRefusal(actor, profile, change.actions, before.actions);
      if (refusal) return refusal;
      row = await updateTelegramLink(id, { actions: change.actions });
      action = "telegram_link.update";
      break;
    }
    case "active":
      row = await updateTelegramLink(id, { is_active: change.isActive });
      action = change.isActive ? "telegram_link.turn_on" : "telegram_link.turn_off";
      break;
    case "new_link_code": {
      const issued = await issueTelegramLinkCode(id);
      row = issued?.row ?? null;
      linkCode = issued?.linkCode;
      action = "telegram_link.new_link_code";
      break;
    }
    case "unlink":
      row = await unlinkTelegramLink(id);
      action = "telegram_link.unlink";
      break;
  }
  if (!row) return { ok: false, status: 404, error: "Not found" };

  await recordAdminAction({
    actor,
    action,
    entityType: "telegram_link",
    entityId: id,
    before: snapshot(before, name),
    after: snapshot(row, name),
  });
  return { ok: true, row, ...(linkCode ? { linkCode } : {}) };
}

export async function removeLink(actor: AdminContext, id: string): Promise<{ ok: true } | Refusal> {
  const before = await getTelegramLink(id);
  if (!before) return { ok: false, status: 404, error: "Not found" };
  const profile = await profileContext(before.staff_profile_id);
  if (profile) {
    const manage = await manageRefusal(actor, profile, before);
    if (manage) return manage;
  } else if (!actor.grantsAll) {
    return { ok: false, status: 403, error: "Only an Owner or Admin can remove a link whose profile is gone." };
  }
  if (!(await deleteTelegramLink(id))) return { ok: false, status: 404, error: "Not found" };
  await recordAdminAction({
    actor,
    action: "telegram_link.delete",
    entityType: "telegram_link",
    entityId: id,
    before: snapshot(before, profile?.name ?? "—"),
  });
  return { ok: true };
}

