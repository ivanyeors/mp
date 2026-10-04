"use client";

import type { RoleRow } from "@/lib/auth/members";
import { permissionEntry, isPermission } from "@/lib/auth/permissions";
import type { PolicyActor } from "@/lib/auth/role-policy";
import { Card } from "@/components/ui/card";

/** Roles tab: what each role can see. Read-only until the matrix editor lands (slice 06). */
export function RolesTab({ roles }: { actor: PolicyActor; roles: RoleRow[] }) {
  return (
    <div className="space-y-3">
      {roles.map((r) => (
        <Card key={r.id} className="space-y-1 p-4">
          <div className="font-medium">
            {r.name} <span className="text-xs text-muted-foreground">· {r.memberCount} Members</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {r.grants_all
              ? "Every page, including ones added later."
              : (r.permissions ?? []).filter(isPermission).map((k) => permissionEntry(k).label).join(", ") || "No pages"}
          </p>
        </Card>
      ))}
    </div>
  );
}
