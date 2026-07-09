"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEFAULT_APPOINTMENT_SETTINGS,
  type AppointmentSettings,
} from "@/lib/appointments/settings";

const DAY_LABELS: { value: number; label: string }[] = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export default function AppointmentSettingsPage() {
  const [settings, setSettings] = useState<AppointmentSettings>(
    DEFAULT_APPOINTMENT_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/appointments");
        const json = (await res.json()) as {
          ok?: boolean;
          settings?: AppointmentSettings;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Failed to load");
        if (!cancelled && json.settings) setSettings(json.settings);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/appointments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        settings?: AppointmentSettings;
        error?: unknown;
      };
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string"
            ? json.error
            : "Invalid settings",
        );
      }
      if (json.settings) setSettings(json.settings);
      toast.success("Appointment settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const toggleDay = (day: number, on: boolean) => {
    setSettings((prev) => {
      const set = new Set(prev.bookableDays);
      if (on) set.add(day);
      else set.delete(day);
      const bookableDays = [...set].sort((a, b) => a - b);
      return { ...prev, bookableDays: bookableDays.length ? bookableDays : prev.bookableDays };
    });
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading appointment settings…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Appointments</h1>
        <p className="text-sm text-muted-foreground">
          Venue, hours, and booking links for WhatsApp appointment reminders.
          WhatsApp and Google credentials stay in environment variables.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="venue">Default venue</Label>
          <Input
            id="venue"
            value={settings.venue}
            onChange={(e) => setSettings((p) => ({ ...p, venue: e.target.value }))}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="duration">Duration (minutes)</Label>
          <Input
            id="duration"
            type="number"
            min={15}
            max={240}
            value={settings.durationMinutes}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                durationMinutes: Number(e.target.value) || 60,
              }))
            }
          />
        </div>

        <div className="grid gap-1.5">
          <Label>Bookable days</Label>
          <div className="flex flex-wrap gap-3 pt-1">
            {DAY_LABELS.map((d) => (
              <label key={d.value} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={settings.bookableDays.includes(d.value)}
                  onCheckedChange={(v) => toggleDay(d.value, v === true)}
                />
                {d.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="open">Open hour (first start, SGT)</Label>
          <Input
            id="open"
            type="number"
            min={0}
            max={23}
            value={settings.openHour}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                openHour: Number(e.target.value),
              }))
            }
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="close">Close hour (last start, SGT)</Label>
          <Input
            id="close"
            type="number"
            min={0}
            max={23}
            value={settings.closeHour}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                closeHour: Number(e.target.value),
              }))
            }
          />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="cust-url">Customisation booking URL</Label>
          <Input
            id="cust-url"
            value={settings.customisationBookingUrl}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                customisationBookingUrl: e.target.value,
              }))
            }
          />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="readj-url">Re-adjustment booking URL</Label>
          <Input
            id="readj-url"
            value={settings.readjustmentBookingUrl}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                readjustmentBookingUrl: e.target.value,
              }))
            }
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="cust-match">Customisation summary match</Label>
          <Input
            id="cust-match"
            value={settings.customisationSummaryMatch}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                customisationSummaryMatch: e.target.value,
              }))
            }
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="readj-match">Re-adjustment summary match</Label>
          <Input
            id="readj-match"
            value={settings.readjustmentSummaryMatch}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                readjustmentSummaryMatch: e.target.value,
              }))
            }
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="lookahead">Slot lookahead (days)</Label>
          <Input
            id="lookahead"
            type="number"
            min={1}
            max={60}
            value={settings.slotLookaheadDays}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                slotLookaheadDays: Number(e.target.value) || 14,
              }))
            }
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="offer-count">Slots offered</Label>
          <Input
            id="offer-count"
            type="number"
            min={1}
            max={10}
            value={settings.slotOfferCount}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                slotOfferCount: Number(e.target.value) || 3,
              }))
            }
          />
        </div>
      </div>

      <Button type="button" disabled={saving} onClick={() => void save()}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
