"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AdminUser = {
  id: string;
  email: string;
  role_id: string;
  is_active: boolean;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type Role = { id: string; key: string; name: string };

export function AdminsClient() {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load staff");
      setRows((payload?.rows ?? []) as AdminUser[]);
      const loaded = (payload?.roles ?? []) as Role[];
      setRoles(loaded);
      setInviteRole((current) => current || (loaded.find((r) => r.key === "admin")?.id ?? ""));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role_id: inviteRole }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to invite");
      toast.success("Staff member invited");
      setInviteEmail("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  }

  async function patch(id: string, body: { role_id?: string; is_active?: boolean }) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Update failed");
      toast.success("Updated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-8 space-y-8">
      <Card className="p-5">
        <form onSubmit={invite} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="invite-email"
              type="email"
              placeholder="staff@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="invite-role" className="text-sm font-medium">
              Role
            </label>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger id="invite-role" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={inviting}>
            {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Invite
          </Button>
        </form>
      </Card>

      <Card className="min-w-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No staff yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((u) => (
                <TableRow key={u.id} className={u.is_active ? "" : "opacity-60"}>
                  <TableCell>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="font-medium">{u.email}</span>
                      {!u.auth_user_id ? (
                        <span className="w-fit rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                          pending first sign-in
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.role_id}
                      onValueChange={(v) => patch(u.id, { role_id: v })}
                    >
                      <SelectTrigger className="w-full min-w-0 sm:w-36" disabled={busyId === u.id}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {u.is_active ? (
                      <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Deactivated
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant={u.is_active ? "outline" : "default"}
                      size="sm"
                      disabled={busyId === u.id}
                      onClick={() => patch(u.id, { is_active: !u.is_active })}
                    >
                      {u.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
