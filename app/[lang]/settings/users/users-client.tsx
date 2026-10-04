"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MemberRow, RoleRow } from "@/lib/auth/members";
import type { Permission } from "@/lib/auth/permissions";
import type { PolicyActor } from "@/lib/auth/role-policy";
import type { TelegramOperatorRow } from "@/lib/telegram/operators";
import { MembersTab } from "./members-tab";
import { RolesTab } from "./roles-tab";
import { ProfilesTab, type StaffInitialData } from "./profiles-tab";
import { TelegramAccessTab } from "./telegram-tab";

export const USERS_TABS = ["members", "profiles", "roles", "telegram"] as const;
export type UsersTab = (typeof USERS_TABS)[number];

export function parseUsersTab(value: string | string[] | undefined): UsersTab {
  const v = Array.isArray(value) ? value[0] : value;
  return (USERS_TABS as readonly string[]).includes(v ?? "") ? (v as UsersTab) : "members";
}

export type SerializedActor = {
  memberId: string;
  isOwner: boolean;
  grantsAll: boolean;
  permissions: Permission[];
};

/** Members and roles are shared by every tab: one load, one refresh. */
function useDirectory(initialMembers?: MemberRow[], initialRoles?: RoleRow[]) {
  const [members, setMembers] = useState<MemberRow[]>(initialMembers ?? []);
  const [roles, setRoles] = useState<RoleRow[]>(initialRoles ?? []);
  const [loading, setLoading] = useState(!initialMembers || !initialRoles);
  const skipFirstFetch = useRef(initialMembers != null && initialRoles != null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load Members");
      setMembers((payload?.members ?? []) as MemberRow[]);
      setRoles((payload?.roles ?? []) as RoleRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load Members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    void reload();
  }, [reload]);

  // Member counts follow the Members list as it changes, not the last load.
  const counted = useMemo(
    () => roles.map((r) => ({ ...r, memberCount: members.filter((m) => m.roleId === r.id).length })),
    [roles, members],
  );

  return { members, setMembers, roles: counted, setRoles, loading, reload };
}

export function UsersClient({
  initialTab,
  actor: serializedActor,
  initialMembers,
  initialRoles,
  initialStaff,
  initialTelegram,
}: {
  initialTab: UsersTab;
  actor: SerializedActor;
  initialMembers?: MemberRow[];
  initialRoles?: RoleRow[];
  initialStaff?: StaffInitialData;
  initialTelegram?: TelegramOperatorRow[];
}) {
  const [tab, setTab] = useState<UsersTab>(initialTab);
  const actor = useMemo<PolicyActor>(
    () => ({ ...serializedActor, permissions: new Set(serializedActor.permissions) }),
    [serializedActor],
  );
  const directory = useDirectory(initialMembers, initialRoles);

  // Keep ?tab= in the address bar so a tab can be linked and survives reload.
  const selectTab = (next: string) => {
    const value = parseUsersTab(next);
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1>Users &amp; permissions</h1>
        <p className="text-sm text-muted-foreground">
          Who can sign in to the Admin Panel, the people who work under each login, and which pages and
          Telegram actions each role can use.
        </p>
      </div>

      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="profiles">Staff profiles</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="telegram">Telegram</TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="pt-4">
          <MembersTab
            actor={actor}
            members={directory.members}
            setMembers={directory.setMembers}
            roles={directory.roles}
            loading={directory.loading}
            reload={directory.reload}
          />
        </TabsContent>
        <TabsContent value="profiles" className="space-y-6 pt-4">
          <ProfilesTab initialData={initialStaff} />
        </TabsContent>
        <TabsContent value="roles" className="pt-4">
          <RolesTab
            actor={actor}
            roles={directory.roles}
            members={directory.members}
            setRoles={directory.setRoles}
            onShowMembers={() => selectTab("members")}
          />
        </TabsContent>
        {/* Kept mounted so a just-issued link code survives a tab switch. */}
        <TabsContent value="telegram" forceMount className="pt-4 data-[state=inactive]:hidden">
          <TelegramAccessTab initialRows={initialTelegram} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
