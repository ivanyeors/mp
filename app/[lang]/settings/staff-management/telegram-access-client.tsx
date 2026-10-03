"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Send, UserPlus } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAdminDateTime } from "@/lib/format/admin-date";
import type { TelegramOperatorRow } from "@/lib/telegram/operators";
import {
  TELEGRAM_ROLE_DESCRIPTIONS,
  TELEGRAM_ROLE_LABELS,
  TELEGRAM_ROLES,
  type TelegramRole,
} from "@/lib/telegram/roles";
import { SocialInboxCard } from "./social-inbox-client";

type IssuedCode = { name: string; code: string; expiresAt: string | null };

/**
 * Staff Management → Telegram access: who may press buttons on review cards,
 * and answer customer message cards, in the measurements Telegram group.
 * Everyone in the group sees the cards; only people listed here, linked and
 * active, can act on them.
 */
export function TelegramAccessTab({ initialRows }: { initialRows?: TelegramOperatorRow[] }) {
  const [rows, setRows] = useState<TelegramOperatorRow[]>(initialRows ?? []);
  const [loading, setLoading] = useState(!initialRows);
  const skipFirstFetch = useRef(initialRows != null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<TelegramRole>("review_manager");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/staff/telegram-operators");
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load Telegram access");
      setRows((payload?.rows ?? []) as TelegramOperatorRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load Telegram access");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      const res = await fetch("/api/staff/telegram-operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: trimmed, role }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to add person");
      const row = payload.row as TelegramOperatorRow;
      setIssued({ name: row.display_name, code: payload.linkCode, expiresAt: row.link_code_expires_at });
      setName("");
      toast.success(`${row.display_name} added — share their link code`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add person");
    } finally {
      setAdding(false);
    }
  }

  async function patch(
    row: TelegramOperatorRow,
    body: { role?: TelegramRole; is_active?: boolean; action?: "new_link_code" | "unlink" },
  ) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/staff/telegram-operators/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Update failed");
      if (payload?.linkCode) {
        const updated = payload.row as TelegramOperatorRow;
        setIssued({ name: updated.display_name, code: payload.linkCode, expiresAt: updated.link_code_expires_at });
      }
      toast.success("Updated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: TelegramOperatorRow) {
    if (!window.confirm(`Remove ${row.display_name}'s Telegram access?`)) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/staff/telegram-operators/${row.id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Remove failed");
      toast.success("Removed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusyId(null);
    }
  }

  async function sendPreview() {
    setPreviewing(true);
    try {
      const res = await fetch("/api/staff/telegram-operators/preview", { method: "POST" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error ? `Telegram: ${payload.error}` : "Preview failed");
      }
      toast.success(
        `Sent ${payload.sent} preview messages to the measurements group${payload.usedClaude ? ", with replies drafted by Claude" : ""}.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed — select the text instead");
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          Review cards for new <span className="font-medium text-foreground">Google Maps</span> and{" "}
          <span className="font-medium text-foreground">shop</span> reviews, and message cards for customers writing
          on <span className="font-medium text-foreground">Facebook, Instagram and TikTok</span>, are posted to the
          measurements Telegram group. Everyone in the group can see them; only the people listed here — linked and
          active — can press the buttons or answer a customer.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {TELEGRAM_ROLES.map((r) => (
            <li key={r}>
              <span className="font-medium text-foreground">{TELEGRAM_ROLE_LABELS[r]}:</span>{" "}
              {TELEGRAM_ROLE_DESCRIPTIONS[r]}
            </li>
          ))}
        </ul>
      </div>

      <SocialInboxCard />

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Preview in Telegram</p>
          <p className="text-muted-foreground">
            Sends sample review and message cards to the measurements group so everyone sees how they will look.
            Tapping a button, or replying to the sample message, tells each person whether they are set up. Nothing
            is posted to Google or sent to a customer.
          </p>
        </div>
        <Button variant="outline" onClick={sendPreview} disabled={previewing} className="shrink-0">
          {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Send preview
        </Button>
      </Card>

      <Card className="p-4">
        <form onSubmit={add} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <label htmlFor="tg-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="tg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Who is this?"
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="tg-role" className="text-sm font-medium">
              Role
            </label>
            <Select value={role} onValueChange={(v) => setRole(v as TelegramRole)}>
              <SelectTrigger id="tg-role" className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TELEGRAM_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {TELEGRAM_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={adding || !name.trim()}>
            {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Add
          </Button>
        </form>
      </Card>

      {issued ? (
        <Card className="space-y-3 border-primary/40 p-4">
          <div className="flex items-start gap-2">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-medium">Link code for {issued.name}</p>
              <p className="text-muted-foreground">
                Ask {issued.name} to send this to the bot, in the measurements group or a private chat with it. It
                works once{issued.expiresAt ? ` and expires ${formatAdminDateTime(issued.expiresAt)}` : ""}. It will
                not be shown again.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border bg-muted px-3 py-2 font-mono text-base tracking-wider">
              /link {issued.code}
            </code>
            <Button variant="outline" size="sm" onClick={() => copy(`/link ${issued.code}`)}>
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="min-w-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
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
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  Nobody yet. Add the people who should approve review replies.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const linked = r.telegram_user_id != null;
                const busy = busyId === r.id;
                return (
                  <TableRow key={r.id} className={r.is_active ? "" : "opacity-60"}>
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium">{r.display_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {linked
                            ? `Telegram ${r.telegram_username ? `@${r.telegram_username}` : `ID ${r.telegram_user_id}`}`
                            : r.link_code_expires_at && new Date(r.link_code_expires_at) > new Date()
                              ? `Waiting for /link — code expires ${formatAdminDateTime(r.link_code_expires_at)}`
                              : "Not linked — issue a new code"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select value={r.role} onValueChange={(v) => patch(r, { role: v as TelegramRole })}>
                        <SelectTrigger className="w-full min-w-0 sm:w-40" disabled={busy}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TELEGRAM_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {TELEGRAM_ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {!r.is_active ? (
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Off
                        </span>
                      ) : linked ? (
                        <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                          Not linked
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => patch(r, { action: "new_link_code" })}
                        >
                          New code
                        </Button>
                        {linked ? (
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => patch(r, { action: "unlink" })}>
                            Unlink
                          </Button>
                        ) : null}
                        <Button
                          variant={r.is_active ? "outline" : "default"}
                          size="sm"
                          disabled={busy}
                          onClick={() => patch(r, { is_active: !r.is_active })}
                        >
                          {r.is_active ? "Turn off" : "Turn on"}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => remove(r)}>
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
