"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { AppointmentsCalendar } from "@/components/settings/appointments-calendar";
import { AppointmentsSettingsSheet } from "@/components/settings/appointments-settings-sheet";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_APPOINTMENT_SETTINGS,
  type AppointmentSettings,
} from "@/lib/appointments/settings";

export default function AppointmentSettingsPage() {
  const [settings, setSettings] = useState<AppointmentSettings>(
    DEFAULT_APPOINTMENT_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Serialize availability writes so rapid toggles don't clobber each other
  const saveChain = useRef(Promise.resolve());

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

  const saveAvailability = useCallback((patch: Partial<AppointmentSettings>) => {
    const run = async () => {
      const previous = settingsRef.current;
      const optimistic = { ...previous, ...patch };
      setSettings(optimistic);
      settingsRef.current = optimistic;
      setSavingAvailability(true);
      try {
        const res = await fetch("/api/settings/appointments", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          settings?: AppointmentSettings;
          error?: unknown;
        };
        if (!res.ok) {
          throw new Error(
            typeof json.error === "string" ? json.error : "Invalid settings",
          );
        }
        // Apply only this patch's keys from the server onto whatever is current
        // (later queued writes may have updated other fields already).
        if (json.settings) {
          const after = { ...settingsRef.current };
          for (const key of Object.keys(patch) as (keyof AppointmentSettings)[]) {
            if (patch[key] !== undefined) {
              (after as Record<string, unknown>)[key] = json.settings[key];
            }
          }
          setSettings(after);
          settingsRef.current = after;
        }
        toast.success("Availability updated");
      } catch (e) {
        const rolled = { ...settingsRef.current };
        for (const key of Object.keys(patch) as (keyof AppointmentSettings)[]) {
          (rolled as Record<string, unknown>)[key] = previous[key];
        }
        setSettings(rolled);
        settingsRef.current = rolled;
        toast.error(e instanceof Error ? e.message : "Save failed");
        throw e;
      } finally {
        setSavingAvailability(false);
      }
    };

    const next = saveChain.current.then(run, run);
    saveChain.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading appointment calendar…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4 md:p-6">
      <style data-fullcalendar />
      <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Appointments</h1>
          <p className="text-sm text-muted-foreground">
            Manage bookable hours and blocks on the calendar. Events from your
            connected Google Calendar (including all-day) appear alongside your
            availability.
            {savingAvailability ? " Saving…" : null}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Appointment settings"
          onClick={() => setSheetOpen(true)}
        >
          <Settings className="size-4" />
        </Button>
      </div>

      <AppointmentsCalendar
        settings={settings}
        onAvailabilityChange={saveAvailability}
      />

      <AppointmentsSettingsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        settings={settings}
        onSaved={(s) => {
          setSettings(s);
          settingsRef.current = s;
        }}
      />
    </div>
  );
}
