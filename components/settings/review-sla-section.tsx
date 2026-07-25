"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ponytail: moved verbatim off the Results page (slice 06) so the table leads.
// The SLA settings API (/api/results/sla-settings) and the reminder cron are unchanged.

type SlaSettingsForm = {
  workingDays: number;
  reminderIntervalDays: number;
  remindTelegram: boolean;
  remindEmail: boolean;
  opsEmail: string;
  authExpiryBufferHours: number;
};

export function ReviewSlaSection() {
  const [open, setOpen] = useState(false);
  const [sla, setSla] = useState<SlaSettingsForm>({
    workingDays: 5,
    reminderIntervalDays: 1,
    remindTelegram: true,
    remindEmail: true,
    opsEmail: "",
    authExpiryBufferHours: 48,
  });
  const [slaLoading, setSlaLoading] = useState(true);
  const [slaSaving, setSlaSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSlaLoading(true);
      try {
        const res = await fetch("/api/results/sla-settings", { cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error ?? "Failed to load SLA settings");
        if (cancelled) return;
        const s = payload.settings as Partial<SlaSettingsForm>;
        setSla({
          workingDays: s.workingDays ?? 5,
          reminderIntervalDays: s.reminderIntervalDays ?? 1,
          remindTelegram: s.remindTelegram ?? true,
          remindEmail: s.remindEmail ?? true,
          opsEmail: s.opsEmail ?? "",
          authExpiryBufferHours: s.authExpiryBufferHours ?? 48,
        });
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load SLA settings");
      } finally {
        if (!cancelled) setSlaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveSla = useCallback(async () => {
    setSlaSaving(true);
    try {
      const res = await fetch("/api/results/sla-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sla,
          opsEmail: sla.opsEmail.trim() || null,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to save SLA settings");
      const s = payload.settings as Partial<SlaSettingsForm>;
      setSla({
        workingDays: s.workingDays ?? sla.workingDays,
        reminderIntervalDays: s.reminderIntervalDays ?? sla.reminderIntervalDays,
        remindTelegram: s.remindTelegram ?? sla.remindTelegram,
        remindEmail: s.remindEmail ?? sla.remindEmail,
        opsEmail: s.opsEmail ?? "",
        authExpiryBufferHours: s.authExpiryBufferHours ?? sla.authExpiryBufferHours,
      });
      toast.success("SLA settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save SLA settings");
    } finally {
      setSlaSaving(false);
    }
  }, [sla]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border p-4">
      <CollapsibleTrigger className="flex w-full items-start justify-between gap-4 text-left">
        <div>
          <h2 className="text-sm font-medium">Review SLA</h2>
          <p className="text-xs text-muted-foreground">
            Unassigned held Results expire after the working-day SLA (always before the card
            authorization dies). Reminders go to Telegram and/or ops email.
          </p>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">
        {slaLoading ? (
          <p className="text-xs text-muted-foreground">Loading SLA settings…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sla-days">Working days (default 5)</Label>
              <Input
                id="sla-days"
                type="number"
                min={1}
                max={30}
                value={sla.workingDays}
                onChange={(e) =>
                  setSla((p) => ({ ...p, workingDays: Number(e.target.value) || 1 }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sla-interval">Reminder interval (days)</Label>
              <Input
                id="sla-interval"
                type="number"
                min={1}
                max={14}
                value={sla.reminderIntervalDays}
                onChange={(e) =>
                  setSla((p) => ({
                    ...p,
                    reminderIntervalDays: Number(e.target.value) || 1,
                  }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sla-buffer">Auth expiry buffer (hours, default 48)</Label>
              <Input
                id="sla-buffer"
                type="number"
                min={1}
                max={72}
                value={sla.authExpiryBufferHours}
                onChange={(e) =>
                  setSla((p) => ({
                    ...p,
                    authExpiryBufferHours: Number(e.target.value) || 1,
                  }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Keep ≥48 while the SLA cron runs once daily (Vercel Hobby limit).
              </p>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="sla-ops-email">Ops email for reminders</Label>
              <Input
                id="sla-ops-email"
                type="email"
                placeholder="ops@example.com"
                value={sla.opsEmail}
                onChange={(e) => setSla((p) => ({ ...p, opsEmail: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-3 justify-end">
              <div className="flex items-center gap-2">
                <Switch
                  id="sla-tg"
                  checked={sla.remindTelegram}
                  onCheckedChange={(v) => setSla((p) => ({ ...p, remindTelegram: v }))}
                />
                <Label htmlFor="sla-tg">Telegram reminders</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="sla-email"
                  checked={sla.remindEmail}
                  onCheckedChange={(v) => setSla((p) => ({ ...p, remindEmail: v }))}
                />
                <Label htmlFor="sla-email">Email reminders</Label>
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="button" size="sm" disabled={slaSaving} onClick={() => void saveSla()}>
                {slaSaving ? "Saving…" : "Save SLA settings"}
              </Button>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
