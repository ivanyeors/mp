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
  authHoldEnabled: boolean;
};

/**
 * Customer payment reminders — a different question from the SLA above, which
 * is about how long an operator may sit on a submission. These chase the
 * customer once the build is priced and waiting to be paid for.
 */
type PaymentReminderForm = {
  enabled: boolean;
  firstDelayDays: number;
  intervalDays: number;
  maxReminders: number;
};

const REMINDER_DEFAULTS: PaymentReminderForm = {
  enabled: true,
  firstDelayDays: 3,
  intervalDays: 3,
  maxReminders: 3,
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
    authHoldEnabled: true,
  });
  const [reminders, setReminders] = useState<PaymentReminderForm>(REMINDER_DEFAULTS);
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
          authHoldEnabled: s.authHoldEnabled ?? true,
        });
        const r = (payload.paymentReminders ?? {}) as Partial<PaymentReminderForm>;
        setReminders({
          enabled: r.enabled ?? REMINDER_DEFAULTS.enabled,
          firstDelayDays: r.firstDelayDays ?? REMINDER_DEFAULTS.firstDelayDays,
          intervalDays: r.intervalDays ?? REMINDER_DEFAULTS.intervalDays,
          maxReminders: r.maxReminders ?? REMINDER_DEFAULTS.maxReminders,
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
          paymentReminders: reminders,
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
        authHoldEnabled: s.authHoldEnabled ?? sla.authHoldEnabled,
      });
      const r = (payload.paymentReminders ?? {}) as Partial<PaymentReminderForm>;
      setReminders((prev) => ({
        enabled: r.enabled ?? prev.enabled,
        firstDelayDays: r.firstDelayDays ?? prev.firstDelayDays,
        intervalDays: r.intervalDays ?? prev.intervalDays,
        maxReminders: r.maxReminders ?? prev.maxReminders,
      }));
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save SLA settings");
    } finally {
      setSlaSaving(false);
    }
  }, [sla, reminders]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border p-4">
      <CollapsibleTrigger className="flex w-full items-start justify-between gap-4 text-left">
        <div>
          <h2 className="text-sm font-medium">Review SLA</h2>
          <p className="text-xs text-muted-foreground">
            Unassigned held Results expire after the working-day SLA (always before the card
            authorization dies); those reminders go to Telegram and/or ops email. Customer
            payment reminders are set separately, at the bottom.
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
            <div className="sm:col-span-2 lg:col-span-3 border-t pt-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="sla-auth-hold"
                  checked={sla.authHoldEnabled}
                  onCheckedChange={(v) => setSla((p) => ({ ...p, authHoldEnabled: v }))}
                />
                <Label htmlFor="sla-auth-hold">Take a card hold on online submits</Label>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {sla.authHoldEnabled
                  ? "Shoppers authorize the quoted amount at submit; staff capture it once the build is assigned."
                  : "Off — shoppers submit with no card. The build still enters the queue and is quoted, and the full amount is collected later from the Result page."}
              </p>
            </div>
            <div className="sm:col-span-2 lg:col-span-3 border-t pt-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="pay-remind"
                  checked={reminders.enabled}
                  onCheckedChange={(v) => setReminders((p) => ({ ...p, enabled: v }))}
                />
                <Label htmlFor="pay-remind">Chase customers for payment</Label>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {reminders.enabled
                  ? reminders.maxReminders === 0
                    ? "On, but capped at zero — nothing will be sent. Raise the cap below."
                    : `A build waiting to be paid for emails the customer after ${reminders.firstDelayDays} day${
                        reminders.firstDelayDays === 1 ? "" : "s"
                      }, then every ${reminders.intervalDays} day${
                        reminders.intervalDays === 1 ? "" : "s"
                      }, up to ${reminders.maxReminders} time${
                        reminders.maxReminders === 1 ? "" : "s"
                      }. Each email links to the status page to pay or cancel.`
                  : "Off — an assigned build that nobody pays for is never chased. Staff can still send one by hand with Request payment."}
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="pay-first">First reminder after (days)</Label>
                  <Input
                    id="pay-first"
                    type="number"
                    min={0}
                    max={60}
                    disabled={!reminders.enabled}
                    value={reminders.firstDelayDays}
                    onChange={(e) =>
                      setReminders((p) => ({
                        ...p,
                        firstDelayDays: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pay-interval">Then every (days)</Label>
                  <Input
                    id="pay-interval"
                    type="number"
                    min={1}
                    max={60}
                    disabled={!reminders.enabled}
                    value={reminders.intervalDays}
                    onChange={(e) =>
                      setReminders((p) => ({
                        ...p,
                        intervalDays: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pay-max">Stop after (reminders)</Label>
                  <Input
                    id="pay-max"
                    type="number"
                    min={0}
                    max={10}
                    disabled={!reminders.enabled}
                    value={reminders.maxReminders}
                    onChange={(e) =>
                      setReminders((p) => ({
                        ...p,
                        maxReminders: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                  />
                </div>
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="button" size="sm" disabled={slaSaving} onClick={() => void saveSla()}>
                {slaSaving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
