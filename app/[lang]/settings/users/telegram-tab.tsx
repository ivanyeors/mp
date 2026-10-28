"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Link2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroupLabel, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatAdminDateTime } from "@/lib/format/admin-date";
import type { MemberRow, RoleRow } from "@/lib/auth/members";
import { ADMIN_PERMISSIONS } from "@/lib/auth/permissions";
import type { PolicyActor } from "@/lib/auth/role-policy";
import type { StaffProfile } from "@/lib/staff/admin";
import type { TelegramLinkRow } from "@/lib/telegram/operators";
import {
  TELEGRAM_ACTIONS,
  TELEGRAM_ACTION_DESCRIPTIONS,
  telegramActionLabel,
  type TelegramAction,
} from "@/lib/telegram/roles";
import { InfoTip } from "@/components/ui/info-tip";
import { GoogleReviewsCard } from "./google-reviews-card";
import { SocialInboxCard } from "./social-inbox-card";

type IssuedCode = { name: string; code: string; expiresAt: string | null };

async function call(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
  return payload as { row?: TelegramLinkRow; linkCode?: string };
}

/**
 * Users & permissions → Telegram: who may press buttons on review cards, and
 * answer customer message cards, in the measurements Telegram group. Access is a Telegram link on a Staff
 * profile, with actions limited by the profile's login role (Roles tab).
 */
export function TelegramAccessTab({
  actor,
  links,
  setLinks,
  profiles,
  members,
  roles,
}: {
  actor: PolicyActor;
  links: TelegramLinkRow[];
  setLinks: (update: (rows: TelegramLinkRow[]) => TelegramLinkRow[]) => void;
  profiles: StaffProfile[];
  members: MemberRow[];
  roles: RoleRow[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [linking, setLinking] = useState(false);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  /** The login and role a profile works under, and the Telegram actions that role allows. */
  const contextFor = (profileId: string) => {
    const profile = profileById.get(profileId);
    const member = profile ? memberById.get(profile.memberId) : undefined;
    const role = member ? roleById.get(member.roleId) : undefined;
    const grants = new Set<string>(role ? (role.grants_all ? ADMIN_PERMISSIONS : role.permissions) : []);
    return { profile, member, role, grants };
  };

  const unlinkedProfiles = profiles.filter((p) => !p.archivedAt && !links.some((l) => l.staff_profile_id === p.id));

  const replace = (row: TelegramLinkRow) => setLinks((rows) => rows.map((r) => (r.id === row.id ? row : r)));

  async function run(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  async function linkProfile(profileId: string) {
    const { profile, grants } = contextFor(profileId);
    if (!profile) return;
    setLinking(true);
    try {
      // Start with what the login's role allows and the actor may grant.
      const actions = TELEGRAM_ACTIONS.filter((a) => grants.has(a) && (actor.grantsAll || actor.permissions.has(a)));
      const payload = await call("/api/staff/telegram-operators", "POST", { staff_profile_id: profileId, actions });
      const row = payload.row!;
      setLinks((rows) => [...rows, row]);
      setIssued({ name: profile.name, code: payload.linkCode!, expiresAt: row.link_code_expires_at });
      toast.success(`${profile.name} linked. Share their code.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't link.");
    } finally {
      setLinking(false);
    }
  }

  const setAction = (link: TelegramLinkRow, action: TelegramAction, on: boolean) =>
    run(link.id, async () => {
      const actions = on ? [...link.actions, action] : link.actions.filter((a) => a !== action);
      const { row } = await call(`/api/staff/telegram-operators/${link.id}`, "PATCH", { actions });
      replace(row!);
    });

  const patch = (link: TelegramLinkRow, body: { is_active: boolean } | { action: "new_link_code" | "unlink" }) =>
    run(link.id, async () => {
      const { row, linkCode } = await call(`/api/staff/telegram-operators/${link.id}`, "PATCH", body);
      replace(row!);
      if (linkCode) {
        setIssued({ name: profileById.get(link.staff_profile_id)?.name ?? "them", code: linkCode, expiresAt: row!.link_code_expires_at });
      }
      toast.success("Updated");
    });

  const remove = (link: TelegramLinkRow) => {
    const name = profileById.get(link.staff_profile_id)?.name ?? "this profile";
    if (!window.confirm(`Remove ${name}'s Telegram access?`)) return;
    void run(link.id, async () => {
      await call(`/api/staff/telegram-operators/${link.id}`, "DELETE");
      setLinks((rows) => rows.filter((r) => r.id !== link.id));
      toast.success("Removed");
    });
  };

  async function sendPreview() {
    setPreviewing(true);
    try {
      const res = await fetch("/api/staff/telegram-operators/preview", { method: "POST" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error ? `Telegram: ${payload.error}` : "Couldn't send the preview.");
      }
      toast.success(
        `Sent ${payload.sent} preview messages to the measurements group${payload.usedClaude ? ", with replies drafted by Claude" : ""}.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the preview.");
    } finally {
      setPreviewing(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy. Select the text instead.");
    }
  }

  // Group unlinked profiles by login for the picker.
  const pickerGroups = members
    .map((m) => ({ member: m, profiles: unlinkedProfiles.filter((p) => p.memberId === m.id) }))
    .filter((g) => g.profiles.length > 0);

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          Review cards for new <span className="font-medium text-foreground">Google Maps</span> and{" "}
          <span className="font-medium text-foreground">shop</span> reviews, and message cards for customers writing
          on <span className="font-medium text-foreground">Facebook, Instagram and TikTok</span>, are posted to the
          measurements Telegram group. Everyone in the group can see them; only a linked staff profile can press the
          buttons or answer a customer, and only for actions both its link and its login&apos;s role allow.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {TELEGRAM_ACTIONS.map((a) => (
            <li key={a}>
              <span className="font-medium text-foreground">{telegramActionLabel(a)}:</span>{" "}
              {TELEGRAM_ACTION_DESCRIPTIONS[a]}
            </li>
          ))}
        </ul>
      </div>

      <GoogleReviewsCard />

      <SocialInboxCard />

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 text-sm">
          <p className="font-medium">Preview in Telegram</p>
          <InfoTip label="About Preview in Telegram">
            Sends sample review and message cards to the measurements group so everyone sees how they will look.
            Tapping a button, or replying to the sample message, tells each person whether they are set up. Nothing
            is posted to Google or sent to a customer.
          </InfoTip>
        </div>
        <Button variant="outline" onClick={sendPreview} disabled={previewing} className="shrink-0">
          {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Send preview
        </Button>
      </Card>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label htmlFor="tg-profile" className="text-sm font-medium">
            Link a staff profile
          </label>
          <Select value="" onValueChange={(id) => void linkProfile(id)}>
            <SelectTrigger id="tg-profile" className="w-full" disabled={linking || !pickerGroups.length}>
              <SelectValue placeholder={pickerGroups.length ? "Pick a profile…" : "Every profile is linked"} />
            </SelectTrigger>
            <SelectContent>
              {pickerGroups.map((g) => (
                <div key={g.member.id}>
                  <SelectGroupLabel>{g.member.email}</SelectGroupLabel>
                  {g.profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id} textValue={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
        {linking ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
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
            <code className="rounded-md border bg-muted px-3 py-2 text-base tracking-wider">
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

      {links.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No one yet. Link the staff profiles who should approve review replies.
        </p>
      ) : (
        <div className="space-y-3">
          {links.map((link) => {
            const { profile, member, role, grants } = contextFor(link.staff_profile_id);
            const telegramLinked = link.telegram_user_id != null;
            // The server refuses any change to a link that can do something the
            // actor can't (link-admin.ts), so don't offer one.
            const beyond = actor.grantsAll ? [] : link.actions.filter((a) => !actor.permissions.has(a));
            const busy = busyId === link.id;
            const frozen = busy || beyond.length > 0;
            const off =
              !link.is_active || !!profile?.archivedAt || member?.status === "deactivated" || member?.status === "invited";
            return (
              <Card key={link.id} className={cn("min-w-0 gap-3 p-4", off && "opacity-70")}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <Link2 className="h-4 w-4 shrink-0 text-sky-600" />
                      {profile?.name ?? "Unknown profile"}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      {member?.email ?? "—"}, {role?.name ?? "no role"}
                      {member?.status === "deactivated" ? ", login deactivated" : ""}
                      {member?.status === "invited" ? ", login not accepted yet" : ""}
                      {profile?.archivedAt ? ", profile archived" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {telegramLinked
                        ? `Telegram ${link.telegram_username ? `@${link.telegram_username}` : `ID ${link.telegram_user_id}`}`
                        : link.link_code_expires_at && new Date(link.link_code_expires_at) > new Date()
                          ? `Waiting for /link. The code expires ${formatAdminDateTime(link.link_code_expires_at)}.`
                          : "Not linked. Issue a new code."}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "w-fit shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                      !link.is_active
                        ? "text-muted-foreground"
                        : telegramLinked
                          ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {!link.is_active ? "Off" : telegramLinked ? "Active" : "Not linked"}
                  </span>
                </div>

                {beyond.length ? (
                  <p className="text-xs text-muted-foreground">
                    This link can {beyond.map((a) => telegramActionLabel(a).toLowerCase()).join(" and ")}, which your role
                    doesn&apos;t have. Ask an Owner or Admin to change it.
                  </p>
                ) : null}
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:gap-5">
                  {TELEGRAM_ACTIONS.map((a) => {
                    const roleHas = grants.has(a);
                    const actorMay = actor.grantsAll || actor.permissions.has(a);
                    const checked = link.actions.includes(a);
                    const why = !roleHas
                      ? `${member?.email ?? "This login"}'s role (${role?.name ?? "none"}) doesn't include this. Change it on Roles.`
                      : !actorMay
                        ? "Your role doesn't have this action."
                        : null;
                    return (
                      <label
                        key={a}
                        className={cn(
                          "-mx-2 flex min-h-11 items-center gap-2 rounded-md px-2 text-sm transition-colors active:bg-press sm:mx-0 sm:min-h-9 sm:px-0",
                          why && "opacity-70",
                        )}
                        title={why ?? undefined}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={frozen || (!!why && !checked)}
                          onCheckedChange={(v) => void setAction(link, a, v === true)}
                        />
                        {telegramActionLabel(a)}
                        {checked && !roleHas ? (
                          <span className="text-xs text-muted-foreground">(granted, but the role doesn&apos;t allow it)</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={frozen} onClick={() => patch(link, { action: "new_link_code" })}>
                    New code
                  </Button>
                  {telegramLinked ? (
                    <Button variant="outline" size="sm" disabled={frozen} onClick={() => patch(link, { action: "unlink" })}>
                      Unlink
                    </Button>
                  ) : null}
                  <Button
                    variant={link.is_active ? "outline" : "default"}
                    size="sm"
                    disabled={frozen}
                    onClick={() => patch(link, { is_active: !link.is_active })}
                  >
                    {link.is_active ? "Turn off" : "Turn on"}
                  </Button>
                  {/* Destructive: kept apart from the other actions on a phone. */}
                  <Button variant="ghost" size="sm" disabled={frozen} onClick={() => remove(link)} className="max-md:ml-auto">
                    Remove
                  </Button>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" /> : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
