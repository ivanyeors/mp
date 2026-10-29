"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Archive, Check, Loader2, Pencil, Plus, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { MemberRow, RoleRow } from "@/lib/auth/members";
import type { StaffProfile } from "@/lib/staff/admin";

async function send(url: string, method: "POST" | "PATCH", body: unknown): Promise<StaffProfile> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error ?? "Something went wrong.");
  return payload.row as StaffProfile;
}

/**
 * Staff profiles tab: the people who work under each login, grouped by it.
 * A Result is "measured by" a profile and a Telegram link belongs to one.
 * Profiles are archived, never deleted, so old Results keep their names.
 */
export function ProfilesTab({
  members,
  roles,
  profiles,
  setProfiles,
  linkedProfileIds,
  focusMemberId,
  onMoved,
}: {
  members: MemberRow[];
  roles: RoleRow[];
  profiles: StaffProfile[];
  setProfiles: (update: (rows: StaffProfile[]) => StaffProfile[]) => void;
  /** Profiles with a Telegram link, marked with an icon. */
  linkedProfileIds: ReadonlySet<string>;
  /** Scroll to and highlight one login's group (from the Members tab). */
  focusMemberId?: string | null;
  /** A move unbinds the profile's Telegram account: the Telegram tab reloads. */
  onMoved?: () => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState<{ memberId: string; name: string } | null>(null);

  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const upsert = (row: StaffProfile) =>
    setProfiles((rows) => (rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row]));

  async function run(id: string, url: string, method: "POST" | "PATCH", body: unknown, done: string) {
    setBusyId(id);
    try {
      upsert(await send(url, method, body));
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const archivedCount = profiles.filter((p) => p.archivedAt).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          These are the people who work under each login. Results are tagged with who measured them; Telegram access is linked
          to a profile.
        </p>
        <label className="flex shrink-0 items-center gap-2 text-sm max-md:min-h-11">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          Show archived ({archivedCount})
        </label>
      </div>

      {members.map((m) => {
        const own = profiles
          .filter((p) => p.memberId === m.id && (showArchived || !p.archivedAt))
          .sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || a.name.localeCompare(b.name));
        return (
          <Card
            key={m.id}
            id={`profiles-${m.id}`}
            className={cn("min-w-0 gap-0 p-0", focusMemberId === m.id && "ring-2 ring-primary")}
          >
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <span className="min-w-0 break-all font-medium">{m.email}</span>
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                {roleName.get(m.roleId) ?? "—"}
              </span>
              {m.status !== "active" ? (
                <span className="text-xs text-muted-foreground">{m.status === "invited" ? "Invited" : "Deactivated"}</span>
              ) : null}
            </div>
            <ul className="divide-y">
              {own.map((p) => (
                <li
                  key={p.id}
                  className={cn("flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center", p.archivedAt && "opacity-60")}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {editing?.id === p.id ? (
                      <form
                        className="flex w-full items-center gap-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (await run(p.id, `/api/staff/${p.id}`, "PATCH", { name: editing.name }, "Renamed")) setEditing(null);
                        }}
                      >
                        <Input
                          autoFocus
                          value={editing.name}
                          maxLength={120}
                          onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                          className="h-8"
                        />
                        <Button type="submit" size="icon" variant="ghost" aria-label="Save name" disabled={busyId === p.id}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </form>
                    ) : (
                      <>
                        <span className="truncate">{p.name}</span>
                        {linkedProfileIds.has(p.id) ? (
                          <Send className="h-3.5 w-3.5 shrink-0 text-sky-600" aria-label="Linked to Telegram" />
                        ) : null}
                        {p.archivedAt ? <span className="text-xs text-muted-foreground">Archived</span> : null}
                      </>
                    )}
                  </div>
                  {editing?.id !== p.id ? (
                    <div className="flex items-center gap-2 sm:flex-wrap">
                      {!p.archivedAt ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing({ id: p.id, name: p.name })}
                            disabled={busyId === p.id}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" /> Rename
                          </Button>
                          <Select
                            value=""
                            onValueChange={async (memberId) => {
                              const linked = linkedProfileIds.has(p.id);
                              const done = linked
                                ? `${p.name} moved. Their Telegram account was unlinked: issue a new code for whoever works it now.`
                                : `${p.name} moved`;
                              if ((await run(p.id, `/api/staff/${p.id}`, "PATCH", { memberId }, done)) && linked) onMoved?.();
                            }}
                          >
                            {/* On a phone the select takes what Rename and Archive leave, so all three fit one row. */}
                            <SelectTrigger
                              className="h-8 min-w-0 flex-1 sm:w-36 sm:min-w-[12rem] sm:flex-none"
                              disabled={busyId === p.id}
                            >
                              <SelectValue placeholder="Move to…" />
                            </SelectTrigger>
                            <SelectContent>
                              {members
                                .filter((other) => other.id !== m.id)
                                .map((other) => (
                                  <SelectItem key={other.id} value={other.id}>
                                    {other.email}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === p.id}
                            onClick={() => void run(p.id, `/api/staff/${p.id}`, "PATCH", { archived: true }, `${p.name} archived`)}
                          >
                            <Archive className="mr-1 h-3.5 w-3.5" /> Archive
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === p.id}
                          onClick={() => void run(p.id, `/api/staff/${p.id}`, "PATCH", { archived: false }, `${p.name} restored`)}
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restore
                        </Button>
                      )}
                      {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                    </div>
                  ) : null}
                </li>
              ))}
              {own.length === 0 ? <li className="px-4 py-3 text-sm text-muted-foreground">No profiles.</li> : null}
            </ul>
            <div className="border-t px-4 py-2.5">
              {adding?.memberId === m.id ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await run(`new-${m.id}`, "/api/staff", "POST", { memberId: m.id, name: adding.name }, `${adding.name} added`)) {
                      setAdding(null);
                    }
                  }}
                >
                  <Input
                    autoFocus
                    placeholder="Name"
                    value={adding.name}
                    maxLength={120}
                    onChange={(e) => setAdding({ memberId: m.id, name: e.target.value })}
                    className="h-8"
                  />
                  <Button type="submit" size="sm" disabled={!adding.name.trim() || busyId === `new-${m.id}`}>
                    Add
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setAdding({ memberId: m.id, name: "" })}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add profile
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
