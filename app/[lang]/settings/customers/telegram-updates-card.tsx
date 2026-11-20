"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import {
  TELEGRAM_UPDATE_DESCRIPTIONS,
  TELEGRAM_UPDATE_TYPES,
  WEEKDAYS,
  WEEKDAY_LABELS,
  type TelegramUpdatesPatch,
  type TelegramUpdatesSettings,
  type TelegramUpdateType,
  type Weekday,
} from "@/lib/crm/telegram-updates";

export type TelegramUpdatesCardData = {
  settings: TelegramUpdatesSettings;
  heldReminderTelegram: boolean;
};

export function TelegramUpdatesCard({
  canEdit,
  canEditOnlineResult,
  initialData,
}: {
  canEdit: boolean;
  canEditOnlineResult: boolean;
  initialData?: TelegramUpdatesCardData;
}) {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const [data, setData] = useState<TelegramUpdatesCardData | null>(initialData ?? null);
  const [saving, setSaving] = useState<TelegramUpdateType | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/customers/telegram-updates", { cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error ?? "Couldn't load Telegram updates.");
        if (!cancelled) {
          setData({ settings: payload.settings, heldReminderTelegram: payload.heldReminderTelegram });
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Couldn't load Telegram updates.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  async function save(type: TelegramUpdateType, patch: TelegramUpdatesPatch) {
    if (!data) return;
    const before = data;
    setSaving(type);
    try {
      const res = await fetch("/api/settings/customers/telegram-updates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Couldn't save.");
      }
      setData({ ...before, settings: payload.settings });
      toast.success("Saved");
    } catch (e) {
      setData(before);
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(null);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/settings/customers/telegram-updates/test", { method: "POST" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Some test messages did not send");
      }
      const n = (payload.sent as string[]).length;
      toast.success(n ? `Sent ${n} test message${n === 1 ? "" : "s"} to the staff group.` : "Every update is off, so nothing was sent.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the test.");
    } finally {
      setTesting(false);
    }
  }

  const mayChange = (type: TelegramUpdateType) =>
    type === "online_result_held" ? canEditOnlineResult : canEdit;

  return (
    <Card className="min-w-0 gap-4 p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-medium">Telegram updates</h2>
        <InfoTip label="About Telegram updates">
          Posted to the staff Telegram group. The Google review, sign-up and weekly updates carry
          counts and a link only, never a customer&apos;s name or contact details. The online result
          notice is the build team&apos;s, and keeps its content.
        </InfoTip>
      </div>

      {!data ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <ul className="space-y-4">
            {TELEGRAM_UPDATE_TYPES.map((type) => {
              const d = TELEGRAM_UPDATE_DESCRIPTIONS[type];
              const id = `tg-update-${type}`;
              const on = data.settings[type].enabled;
              const busy = saving === type;
              return (
                <li key={type} className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <Label htmlFor={id}>{d.label}</Label>
                      <p className="text-xs text-muted-foreground">{d.when}</p>
                      <p className="break-words text-xs text-muted-foreground italic">{d.example}</p>
                      {type === "online_result_held" && canEdit && !canEditOnlineResult ? (
                        <p className="text-xs text-muted-foreground">
                          Changing this also needs the Results permission.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                      <Switch
                        id={id}
                        checked={on}
                        disabled={!mayChange(type) || busy}
                        onCheckedChange={(v) => void save(type, { [type]: { enabled: v } } as TelegramUpdatesPatch)}
                      />
                    </div>
                  </div>
                  {type === "weekly_summary" ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-xs text-muted-foreground">Sent on</span>
                      <Select
                        value={data.settings.weekly_summary.day}
                        onValueChange={(day) => void save(type, { weekly_summary: { day: day as Weekday } })}
                      >
                        <SelectTrigger
                          aria-label="Weekly summary day"
                          className="h-8 min-w-[9rem]"
                          disabled={!canEdit || busy}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKDAYS.map((day) => (
                            <SelectItem key={day} value={day} textValue={WEEKDAY_LABELS[day]}>
                              {WEEKDAY_LABELS[day]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">at about 10:00 SGT</span>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <p className="border-t pt-3 text-xs text-muted-foreground">
            Reminder when a held result waits too long: {data.heldReminderTelegram ? "on" : "off"}.
            Change it under Review SLA on{" "}
            <Link href={withLocale("/settings/general", locale)} className="underline underline-offset-2">
              API configs
            </Link>
            .
          </p>

          {canEdit ? (
            <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Posts each update that is on once, with sample numbers, marked TEST.
              </p>
              <Button variant="outline" size="sm" onClick={sendTest} disabled={testing} className="shrink-0">
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send test
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
