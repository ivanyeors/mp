/**
 * Write rules for Members and Roles on Users & permissions (ADR 0023).
 *
 * Pure: every function takes what it needs and returns allow, or refuse with
 * a status and a sentence the UI can show as is. Routes enforce these on every
 * write; the UI calls the same functions to disable what would be refused.
 *
 *  - Nobody changes their own role or deactivates themselves.
 *  - Only an Owner grants or removes Owner, and the last active Owner stays.
 *  - Anyone who is not Owner or Admin (`grants_all`) can only assign, create,
 *    edit or delete roles whose pages are a subset of their own, and can only
 *    change a Member whose current role they could assign.
 *  - Built-in roles are never edited or deleted; a role with Members is not
 *    deleted until they are moved.
 */
import {
  applyRequires,
  isPermission,
  permissionEntry,
  permissionsForRoleRow,
  type Permission,
  type RoleGrant,
} from "@/lib/auth/permissions";

export type PolicyActor = {
  readonly memberId: string;
  readonly isOwner: boolean;
  readonly grantsAll: boolean;
  readonly permissions: ReadonlySet<Permission>;
};

export type PolicyRole = RoleGrant & {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly is_system: boolean;
};

export type PolicyMember = {
  readonly id: string;
  readonly roleId: string;
  readonly isActive: boolean;
};

export type Decision = { ok: true } | { ok: false; status: 400 | 403 | 404 | 409; error: string };

const allow: Decision = { ok: true };
const refuse = (status: 400 | 403 | 404 | 409, error: string): Decision => ({ ok: false, status, error });

const OWNER = "owner";

function labels(keys: Iterable<Permission>): string {
  return [...keys].map((k) => permissionEntry(k).label).join(", ");
}

/** Keys in `role` the actor does not hold (always empty for Owner / Admin). */
function beyondActor(actor: PolicyActor, keys: ReadonlySet<Permission>, grantsAll: boolean): Permission[] | "all" {
  if (actor.grantsAll) return [];
  if (grantsAll) return "all";
  return [...keys].filter((k) => !actor.permissions.has(k));
}

function subsetRefusal(actor: PolicyActor, role: RoleGrant, verb: string): Decision | null {
  const beyond = beyondActor(actor, permissionsForRoleRow(role), role.grants_all);
  if (beyond === "all") return refuse(403, `Only an Owner or Admin can ${verb} a role with every page.`);
  if (beyond.length) return refuse(403, `You can't ${verb} a role with pages you don't have: ${labels(beyond)}.`);
  return null;
}

/** May the actor give this role to a Member (invite or role change)? */
export function canAssignRole(actor: PolicyActor, role: PolicyRole): Decision {
  if (role.key === OWNER && !actor.isOwner) return refuse(403, "Only an Owner can grant Owner.");
  return subsetRefusal(actor, role, "assign") ?? allow;
}

export type MemberChange = { roleId?: string; isActive?: boolean };

/**
 * May the actor apply `change` to `target`? `roles` resolves role ids;
 * `activeOwners` counts every active Owner, the target included.
 */
export function canUpdateMember(
  actor: PolicyActor,
  target: PolicyMember,
  change: MemberChange,
  roles: ReadonlyMap<string, PolicyRole>,
  activeOwners: number,
): Decision {
  if (target.id === actor.memberId) {
    return refuse(400, "You can't change your own role or deactivate yourself.");
  }
  const current = roles.get(target.roleId);
  if (!current) return refuse(404, "That Member's role no longer exists.");

  const targetIsOwner = current.key === OWNER;
  if (targetIsOwner && !actor.isOwner) return refuse(403, "Only an Owner can change an Owner.");
  // You cannot demote or deactivate someone whose access you could not have given.
  const overCurrent = subsetRefusal(actor, current, "change a Member holding");
  if (overCurrent) return overCurrent;

  let next = current;
  if (change.roleId !== undefined && change.roleId !== target.roleId) {
    const role = roles.get(change.roleId);
    if (!role) return refuse(400, "That role no longer exists.");
    const assign = canAssignRole(actor, role);
    if (!assign.ok) return assign;
    next = role;
  }

  const losesOwner = targetIsOwner && target.isActive && (next.key !== OWNER || change.isActive === false);
  if (losesOwner && activeOwners <= 1) return refuse(400, "There must be at least one active Owner.");
  return allow;
}

/**
 * The permission list a role is saved with: catalog keys only, closed under
 * `requires` (so the server applies dependencies even if the client did not).
 * Unknown keys are reported, not silently dropped.
 */
export function normalizeRolePermissions(
  keys: readonly string[],
): { ok: true; permissions: Permission[] } | { ok: false; status: 400; error: string } {
  const unknown = keys.filter((k) => !isPermission(k));
  if (unknown.length) return { ok: false, status: 400, error: `Unknown permission: ${unknown.join(", ")}.` };
  const closed = applyRequires(keys as Permission[]);
  return { ok: true, permissions: [...closed].sort() };
}

/** May the actor create a custom role with these (normalized) permissions? */
export function canCreateRole(actor: PolicyActor, permissions: readonly Permission[]): Decision {
  return subsetRefusal(actor, { grants_all: false, permissions }, "create") ?? allow;
}

/** May the actor change `role` to hold `next` (normalized) permissions? */
export function canEditRole(actor: PolicyActor, role: PolicyRole, next: readonly Permission[]): Decision {
  if (role.is_system) return refuse(403, `${role.name} is built in and always has every page.`);
  return (
    subsetRefusal(actor, role, "edit") ??
    subsetRefusal(actor, { grants_all: false, permissions: next }, "give") ??
    allow
  );
}

/** May the actor delete `role`, which `memberCount` Members (any state) hold? */
const SEEDED_ROLE_KEYS: ReadonlySet<string> = new Set(["manager", "fulfilment", "viewer"]);

export function canDeleteRole(actor: PolicyActor, role: PolicyRole, memberCount: number): Decision {
  if (role.is_system) return refuse(403, `${role.name} is built in and can't be deleted.`);
  // Until slice 11 drops admin_users.role, code from before ADR 0023 (an app
  // rollback) names these by their old keys; deleting one would break it.
  if (SEEDED_ROLE_KEYS.has(role.key)) {
    return refuse(409, `${role.name} came with the system and can't be deleted yet. Rename it or change its pages instead.`);
  }
  const over = subsetRefusal(actor, role, "delete");
  if (over) return over;
  if (memberCount > 0) {
    return refuse(
      409,
      `${memberCount} ${memberCount === 1 ? "Member holds" : "Members hold"} ${role.name}. Move them to another role first.`,
    );
  }
  return allow;
}
