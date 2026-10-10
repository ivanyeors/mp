"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UserRound } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type WorkingAsState = {
  profiles: { id: string; name: string }[];
  current: string | null;
};

/**
 * "Working as <name>" on a login with more than one Staff profile: who is at
 * this device. New Results default their "measured by" to it and the Audit Log
 * names it. It never changes what the login can see.
 */
export function WorkingAsPicker({ initial }: { initial: WorkingAsState }) {
  const [current, setCurrent] = useState(initial.current ?? "");
  if (initial.profiles.length < 2) return null;

  async function choose(id: string) {
    const previous = current;
    setCurrent(id);
    try {
      const res = await fetch("/api/admin/working-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not switch");
    } catch (e) {
      setCurrent(previous);
      toast.error(e instanceof Error ? e.message : "Could not switch");
    }
  }

  return (
    <Select value={current} onValueChange={(v) => void choose(v)}>
      <SelectTrigger
        aria-label="Working as"
        className="h-8 w-auto min-w-0 max-w-[45vw] shrink-0 border-dashed text-xs sm:max-w-60"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden shrink-0 text-muted-foreground sm:inline">Working as</span>
          <SelectValue placeholder="Who are you?" className="min-w-0" />
        </span>
      </SelectTrigger>
      <SelectContent align="end" sheetTitle="Working as">
        {initial.profiles.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
