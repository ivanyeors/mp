"use client";

import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { MemberRow, RoleRow } from "@/lib/auth/members";
import {
  ADMIN_PERMISSIONS,
  PERMISSION_CATALOG,
  isPermission,
  type Permission,
  type PermissionEntry,
} from "@/lib/auth/permissions";
import { canDeleteRole, canEditRole, type PolicyActor } from "@/lib/auth/role-policy";
import { samePermissions, togglePermission } from "@/lib/auth/permission-matrix";

/** The catalog grouped as the sidebar is, Telegram last; adding an entry adds a row. */
const GROUPS: { group: string; entries: PermissionEntry[] }[] = (() => {
  const out: { group: string; entries: PermissionEntry[] }[] = [];
  for (const e of PERMISSION_CATALOG as readonly PermissionEntry[]) {
    const last = out.at(-1);
    if (last?.group === e.group) last.entries.push(e);
    else out.push({ group: e.group, entries: [e] });
  }
  return out;
})();

const held = (role: RoleRow): Set<Permission> =>
  new Set(role.grants_all ? ADMIN_PERMISSIONS : role.permissions.filter(isPermission));

type Cell = { checked: boolean; disabled: boolean; why: string | null };

/**
 * Roles tab: the permission matrix. One row per Admin Panel page and Telegram
 * action, one column per role. Owner and Admin are locked to everything;
 * custom roles are edited per column and saved per column.
 */
export function RolesTab({
  actor,
  roles,
  members,
  setRoles,
  onShowMembers,
}: {
  actor: PolicyActor;
  roles: RoleRow[];
  members: MemberRow[];
  setRoles: (update: (roles: RoleRow[]) => RoleRow[]) => void;
  onShowMembers: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Set<Permission>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [mobileRoleId, setMobileRoleId] = useState<string>("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const editable = useMemo(
    () => new Map(roles.map((r) => [r.id, canEditRole(actor, r, r.permissions.filter(isPermission))])),
    [actor, roles],
  );

  const current = (role: RoleRow) => drafts[role.id] ?? held(role);
  const dirty = (role: RoleRow) => !!drafts[role.id] && !samePermissions(drafts[role.id], held(role));

  const cell = (role: RoleRow, key: Permission): Cell => {
    if (role.grants_all) return { checked: true, disabled: true, why: "Built-in: always every page" };
    const edit = editable.get(role.id);
    if (edit && !edit.ok) return { checked: current(role).has(key), disabled: true, why: edit.error };
    if (!actor.grantsAll && !actor.permissions.has(key)) {
      return { checked: current(role).has(key), disabled: true, why: "Your role doesn't have this page." };
    }
    return { checked: current(role).has(key), disabled: saving === role.id, why: null };
  };

  const toggle = (role: RoleRow, key: Permission, on: boolean) => {
    const result = togglePermission(current(role), key, on);
    if (!result.ok) return toast.error(result.reason);
    if (result.note) toast.info(result.note);
    setDrafts((d) => ({ ...d, [role.id]: result.next }));
  };

  const discard = (role: RoleRow) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[role.id];
      return next;
    });

  async function save(role: RoleRow) {
    setSaving(role.id);
    try {
      const res = await fetch(`/api/admin/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: [...current(role)] }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Save failed");
      setRoles((rs) => rs.map((r) => (r.id === role.id ? (payload.role as RoleRow) : r)));
      discard(role);
      toast.success(`${role.name} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  const saveBar = (role: RoleRow) =>
    dirty(role) ? (
      <div className="flex items-center justify-center gap-1">
        <Button size="sm" className="h-7 px-2 text-xs" disabled={saving === role.id} onClick={() => save(role)}>
          {saving === role.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => discard(role)}>
          Discard
        </Button>
      </div>
    ) : null;

  const mobileRole = roles.find((r) => r.id === mobileRoleId) ?? roles.find((r) => !r.grants_all) ?? roles[0];
  const detail = roles.find((r) => r.id === detailId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Members get exactly the pages their role has. New pages are off for custom roles until you turn them on.
        </p>
        <Button size="sm" onClick={() => setCreating(true)} className="shrink-0">
          <Plus className="mr-1 h-4 w-4" /> New role
        </Button>
      </div>

      {/* Phone: pick a role, then its grouped checklist. */}
      {mobileRole ? (
        <div className="space-y-3 sm:hidden">
          <div className="flex items-center gap-2">
            <Select value={mobileRole.id} onValueChange={setMobileRoleId}>
              <SelectTrigger className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id} textValue={r.name}>
                    {r.name} · {r.memberCount}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setDetailId(mobileRole.id)}>
              Details
            </Button>
          </div>
          {mobileRole.grants_all ? (
            <p className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" /> {mobileRole.name} is built in and always has every page.
            </p>
          ) : null}
          {GROUPS.map(({ group, entries }) => (
            <div key={group} className="rounded-lg border">
              <p className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</p>
              {entries.map((e) => {
                const c = cell(mobileRole, e.key);
                return (
                  <label
                    key={e.key}
                    className={cn("flex min-h-11 items-center gap-3 px-3 py-2 text-sm", c.disabled && "opacity-70")}
                    title={c.why ?? undefined}
                  >
                    <Checkbox
                      checked={c.checked}
                      disabled={c.disabled}
                      onCheckedChange={(v) => toggle(mobileRole, e.key, v === true)}
                    />
                    <span className="flex-1">{e.label}</span>
                  </label>
                );
              })}
            </div>
          ))}
          {dirty(mobileRole) ? (
            <div className="sticky bottom-[calc(4rem+var(--safe-bottom))] flex justify-end gap-2 rounded-lg border bg-background p-2 shadow-sm">
              <Button variant="ghost" size="sm" onClick={() => discard(mobileRole)}>
                Discard
              </Button>
              <Button size="sm" disabled={saving === mobileRole.id} onClick={() => save(mobileRole)}>
                Save {mobileRole.name}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Desktop and tablet: the full matrix, page labels pinned while roles scroll. */}
      <div className="hidden min-w-0 overflow-x-auto rounded-lg border sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 align-bottom">
              <th className="sticky left-0 z-10 min-w-48 bg-muted px-3 py-2 text-left font-medium">Page</th>
              {roles.map((r) => (
                <th key={r.id} className="min-w-28 px-2 py-2 text-center font-medium">
                  <button
                    type="button"
                    onClick={() => setDetailId(r.id)}
                    className="inline-flex items-center gap-1 rounded px-1 underline-offset-2 hover:underline"
                  >
                    {r.grants_all ? <Lock className="h-3 w-3 text-muted-foreground" aria-label="Built in" /> : null}
                    {r.name}
                  </button>
                  <div className="mt-1 flex flex-col items-center gap-1">
                    <span className="rounded-full border px-1.5 text-[11px] font-normal text-muted-foreground">
                      {r.memberCount} {r.memberCount === 1 ? "Member" : "Members"}
                    </span>
                    {dirty(r) ? <span className="text-[11px] font-normal text-amber-600">Unsaved</span> : null}
                    {saveBar(r)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map(({ group, entries }) => (
              <Fragment key={group}>
                <tr className="border-b bg-muted/20">
                  <th
                    colSpan={roles.length + 1}
                    className="sticky left-0 px-3 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {group}
                  </th>
                </tr>
                {entries.map((e) => (
                  <tr key={e.key} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="sticky left-0 z-10 bg-background px-3 py-2">{e.label}</td>
                    {roles.map((r) => {
                      const c = cell(r, e.key);
                      return (
                        <td key={r.id} className="px-2 py-2 text-center" title={c.why ?? undefined}>
                          <Checkbox
                            aria-label={`${r.name}: ${e.label}`}
                            checked={c.checked}
                            disabled={c.disabled}
                            onCheckedChange={(v) => toggle(r, e.key, v === true)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <RoleDetailSheet
        actor={actor}
        role={detail}
        members={members}
        onClose={() => setDetailId(null)}
        onShowMembers={() => {
          setDetailId(null);
          onShowMembers();
        }}
        onSaved={(role) => setRoles((rs) => rs.map((r) => (r.id === role.id ? role : r)))}
        onDeleted={(id) => {
          setDetailId(null);
          setRoles((rs) => rs.filter((r) => r.id !== id));
        }}
      />
      <CreateRoleDialog
        open={creating}
        roles={roles}
        onClose={() => setCreating(false)}
        onCreated={(role) => {
          setCreating(false);
          setRoles((rs) => [...rs, role]);
        }}
      />
    </div>
  );
}

function RoleDetailSheet({
  actor,
  role,
  members,
  onClose,
  onShowMembers,
  onSaved,
  onDeleted,
}: {
  actor: PolicyActor;
  role: RoleRow | null;
  members: MemberRow[];
  onClose: () => void;
  onShowMembers: () => void;
  onSaved: (role: RoleRow) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const holders = role ? members.filter((m) => m.roleId === role.id) : [];
  const edit = role ? canEditRole(actor, role, role.permissions.filter(isPermission)) : null;
  const del = role ? canDeleteRole(actor, role, role.memberCount) : null;

  const close = () => {
    setName(null);
    setDescription(null);
    onClose();
  };

  async function send(method: "PATCH" | "DELETE", body?: unknown) {
    if (!role) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/roles/${role.id}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed");
      if (method === "DELETE") {
        toast.success(`${role.name} deleted`);
        onDeleted(role.id);
      } else {
        toast.success(`${role.name} saved`);
        onSaved(payload.role as RoleRow);
      }
      setName(null);
      setDescription(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const nameValue = name ?? role?.name ?? "";
  const descriptionValue = description ?? role?.description ?? "";
  const changed = role && (nameValue.trim() !== role.name || descriptionValue.trim() !== (role.description ?? ""));

  return (
    <Sheet open={!!role} onOpenChange={(open) => (open ? null : close())}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {role ? (
          <>
            <SheetHeader>
              <SheetTitle>{role.name}</SheetTitle>
              <SheetDescription>
                {role.grants_all ? "Built in: every page, including ones added later." : "Custom role."}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              <div className="space-y-1.5">
                <label htmlFor="role-name" className="text-sm font-medium">
                  Name
                </label>
                <Input
                  id="role-name"
                  value={nameValue}
                  disabled={!edit?.ok || busy}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="role-description" className="text-sm font-medium">
                  Description
                </label>
                <Textarea
                  id="role-description"
                  rows={3}
                  value={descriptionValue}
                  disabled={!edit?.ok || busy}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              {edit && !edit.ok ? <p className="text-xs text-muted-foreground">{edit.error}</p> : null}
              {changed && edit?.ok ? (
                <Button
                  disabled={busy || !nameValue.trim()}
                  onClick={() => send("PATCH", { name: nameValue.trim(), description: descriptionValue.trim() || null })}
                >
                  Save
                </Button>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {holders.length} {holders.length === 1 ? "Member" : "Members"}
                  </p>
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={onShowMembers}>
                    Open Members
                  </Button>
                </div>
                {holders.length ? (
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {holders.map((m) => (
                      <li key={m.id} className="break-all">
                        {m.email}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {!role.is_system ? (
                <div className="space-y-1.5 border-t pt-4">
                  <Button
                    variant="destructive"
                    disabled={busy || !del?.ok}
                    onClick={() => {
                      if (window.confirm(`Delete ${role.name}?`)) void send("DELETE");
                    }}
                  >
                    Delete role
                  </Button>
                  {del && !del.ok ? <p className="text-xs text-muted-foreground">{del.error}</p> : null}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function CreateRoleDialog({
  open,
  roles,
  onClose,
  onCreated,
}: {
  open: boolean;
  roles: RoleRow[];
  onClose: () => void;
  onCreated: (role: RoleRow) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [from, setFrom] = useState("none");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const source = roles.find((r) => r.id === from);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          permissions: source ? [...held(source)] : [],
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to create role");
      toast.success(`${name} created`);
      setName("");
      setDescription("");
      setFrom("none");
      onCreated(payload.role as RoleRow);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create role");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <form onSubmit={create} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New role</DialogTitle>
            <DialogDescription>Starts with no pages unless you copy another role. Tick pages on the matrix after.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="new-role-name" className="text-sm font-medium">
              Name
            </label>
            <Input id="new-role-name" value={name} maxLength={60} required onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-role-description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="new-role-description"
              rows={2}
              maxLength={280}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-role-from" className="text-sm font-medium">
              Start from
            </label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger id="new-role-from" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No pages</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}&apos;s pages
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
