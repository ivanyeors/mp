"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { defaultProfileName } from "@/lib/staff/profile-name";
import { cn } from "@/lib/utils";
import { formatAdminRelative } from "@/lib/format/admin-date";
import type { MemberRow, MemberStatus, RoleRow } from "@/lib/auth/members";
import { canAssignRole, canUpdateMember, type PolicyActor, type PolicyRole } from "@/lib/auth/role-policy";

const STATUS_LABEL: Record<MemberStatus, string> = {
  invited: "Invited",
  active: "Active",
  deactivated: "Deactivated",
};

function StatusPill({ status, detail }: { status: MemberStatus; detail?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        status === "active" && "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
        status === "invited" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        status === "deactivated" && "text-muted-foreground",
      )}
    >
      {STATUS_LABEL[status]}
      {detail ? (
        <span className="font-normal" suppressHydrationWarning>
          &nbsp;· {detail}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Members tab: every Admin Panel login, its role and state. The same role
 * policy the server enforces decides what is disabled here, so a refused
 * change is explained before it is attempted.
 */
export function MembersTab({
  actor,
  members,
  setMembers,
  roles,
  loading,
  reload,
  profileCounts,
  onShowProfiles,
}: {
  profileCounts: ReadonlyMap<string, number>;
  onShowProfiles: (memberId: string) => void;
  actor: PolicyActor;
  members: MemberRow[];
  setMembers: (rows: MemberRow[] | ((rows: MemberRow[]) => MemberRow[])) => void;
  roles: RoleRow[];
  loading: boolean;
  reload: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  // Sampled once per mount; relative labels are suppressHydrationWarning.
  const [nowMs] = useState(() => Date.now());

  const rolesById = useMemo(() => new Map<string, PolicyRole>(roles.map((r) => [r.id, r])), [roles]);
  const ownerRoleId = roles.find((r) => r.key === "owner")?.id;
  const activeOwners = members.filter((m) => m.roleId === ownerRoleId && m.isActive).length;
  const assignable = useMemo(
    () => new Map(roles.map((r) => [r.id, canAssignRole(actor, r)])),
    [actor, roles],
  );

  async function patch(member: MemberRow, body: { role_id?: string; is_active?: boolean }) {
    setBusyId(member.id);
    try {
      const res = await fetch(`/api/admin/users/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Update failed");
      setMembers((rows) => rows.map((r) => (r.id === member.id ? (payload.member as MemberRow) : r)));
      toast.success(`${member.email} updated`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  const rows = members.map((m) => {
    // Can the actor change this Member at all (role or state)?
    const lock = canUpdateMember(actor, { id: m.id, roleId: m.roleId, isActive: m.isActive }, {}, rolesById, activeOwners);
    const toggle = canUpdateMember(
      actor,
      { id: m.id, roleId: m.roleId, isActive: m.isActive },
      { isActive: !m.isActive },
      rolesById,
      activeOwners,
    );
    return { m, lock: lock.ok ? null : lock.error, toggle: toggle.ok ? null : toggle.error };
  });

  const roleSelect = (m: MemberRow, lock: string | null, className?: string) => (
    <Select value={m.roleId} onValueChange={(v) => patch(m, { role_id: v })}>
      <SelectTrigger className={cn("w-full min-w-0 sm:w-40", className)} disabled={!!lock || busyId === m.id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => {
          const decision = assignable.get(r.id);
          const why = r.id !== m.roleId && decision && !decision.ok ? decision.error : null;
          return (
            <SelectItem key={r.id} value={r.id} textValue={r.name} disabled={!!why}>
              <span className="flex flex-col">
                <span>{r.name}</span>
                {why ? <span className="text-xs text-muted-foreground">{why}</span> : null}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );

  async function invitedAction(m: MemberRow, action: "resend" | "revoke") {
    if (action === "revoke" && !window.confirm(`Revoke the invite to ${m.email}?`)) return;
    setBusyId(m.id);
    try {
      const res = await fetch(
        action === "resend" ? `/api/admin/users/${m.id}/resend-invite` : `/api/admin/users/${m.id}`,
        { method: action === "resend" ? "POST" : "DELETE" },
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed");
      if (action === "revoke") {
        setMembers((rows) => rows.filter((r) => r.id !== m.id));
        toast.success(`Invite to ${m.email} revoked`);
        await reload();
      } else {
        setMembers((rows) => rows.map((r) => (r.id === m.id ? (payload.member as MemberRow) : r)));
        if (payload.emailSent) toast.success(`Invite re-sent to ${m.email}`);
        else toast.error("The email failed to send. Try Resend again in a minute.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  const sentLabel = (m: MemberRow) =>
    m.inviteSentAt ? `sent ${formatAdminRelative(m.inviteSentAt, nowMs) ?? "just now"}` : "email not sent";

  const toggleButton = (m: MemberRow, why: string | null) =>
    m.status === "invited" ? (
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!!why || busyId === m.id}
          title={why ?? undefined}
          onClick={() => invitedAction(m, "resend")}
        >
          Resend
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!!why || busyId === m.id}
          title={why ?? undefined}
          onClick={() => invitedAction(m, "revoke")}
        >
          {busyId === m.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Revoke
        </Button>
      </div>
    ) : (
    <Button
      variant={m.isActive ? "outline" : "default"}
      size="sm"
      disabled={!!why || busyId === m.id}
      title={why ?? undefined}
      onClick={() => patch(m, { is_active: !m.isActive })}
    >
      {busyId === m.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
      {m.isActive ? "Deactivate" : "Reactivate"}
    </Button>
    );

  const lastSignIn = (m: MemberRow) =>
    m.lastSignInAt ? (formatAdminRelative(m.lastSignInAt, nowMs) ?? "—") : "—";

  const profilesLink = (m: MemberRow) => {
    const n = profileCounts.get(m.id) ?? 0;
    return (
      <button
        type="button"
        onClick={() => onShowProfiles(m.id)}
        className="text-sm text-primary underline-offset-2 hover:underline"
      >
        {`${n} ${n === 1 ? "profile" : "profiles"}`}
      </button>
    );
  };

  const you = (m: MemberRow) =>
    m.id === actor.memberId ? <span className="text-xs font-normal text-muted-foreground">(you)</span> : null;

  return (
    <div className="space-y-6">
      <InviteDialog roles={roles} onInvited={reload} assignable={assignable} />

      {loading && members.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      ) : members.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No Members yet.</p>
      ) : (
        <>
          {/* Phone: one card per Member. */}
          <div className="space-y-3 sm:hidden">
            {rows.map(({ m, lock, toggle }) => (
              <Card key={m.id} className={cn("min-w-0 space-y-3 p-4", !m.isActive && "opacity-60")}>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="break-all font-medium">
                    {m.email} {you(m)}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <StatusPill status={m.status} detail={m.status === "invited" ? sentLabel(m) : undefined} />
                    <span suppressHydrationWarning>Last sign-in {lastSignIn(m)}</span>
                  </div>
                  {profilesLink(m)}
                </div>
                {roleSelect(m, lock)}
                {lock ? <p className="text-xs text-muted-foreground">{lock}</p> : null}
                <div className="flex justify-end">{toggleButton(m, toggle)}</div>
              </Card>
            ))}
          </div>

          <Card className="hidden min-w-0 sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Profiles</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ m, lock, toggle }) => (
                  <TableRow key={m.id} className={m.isActive ? "" : "opacity-60"}>
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium">
                          {m.email} {you(m)}
                        </span>
                        <StatusPill status={m.status} detail={m.status === "invited" ? sentLabel(m) : undefined} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {roleSelect(m, lock)}
                        {lock ? <span className="max-w-56 text-xs text-muted-foreground">{lock}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>{profilesLink(m)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
                      {lastSignIn(m)}
                    </TableCell>
                    <TableCell className="text-right">{toggleButton(m, toggle)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

function InviteDialog({
  roles,
  assignable,
  onInvited,
}: {
  roles: RoleRow[];
  assignable: Map<string, { ok: boolean }>;
  onInvited: () => Promise<void>;
}) {
  const choices = roles.filter((r) => assignable.get(r.id)?.ok);
  const fallback = choices.find((r) => r.key === "admin")?.id ?? choices[0]?.id ?? "";
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [inviting, setInviting] = useState(false);
  const selected = choices.some((r) => r.id === roleId) ? roleId : fallback;
  const suggestedName = email.includes("@") ? defaultProfileName(email) : "";

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role_id: selected, profile_name: profileName.trim() || null }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to invite");
      if (payload.emailSent) toast.success(`Invite sent to ${email}`);
      else toast.error("Invite saved, but the email failed to send. Use Resend on their row.");
      setEmail("");
      setProfileName("");
      setOpen(false);
      await onInvited();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="flex justify-end">
      <Button onClick={() => setOpen(true)} disabled={!choices.length}>
        <UserPlus className="mr-2 h-4 w-4" /> Invite member
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={invite} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Invite a member</DialogTitle>
              <DialogDescription>
                They get an email with a Sign in button, and become Active the first time they sign in with this
                address.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <label htmlFor="invite-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="invite-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="invite-role" className="text-sm font-medium">
                Role
              </label>
              <Select value={selected} onValueChange={setRoleId}>
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="invite-profile" className="text-sm font-medium">
                First staff profile
              </label>
              <Input
                id="invite-profile"
                placeholder={suggestedName || "Name"}
                value={profileName}
                maxLength={120}
                onChange={(e) => setProfileName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The person Results are tagged with. Leave empty to use {suggestedName ? `"${suggestedName}"` : "the email"}.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviting || !selected}>
                {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
