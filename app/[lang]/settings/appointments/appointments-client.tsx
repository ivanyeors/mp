"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { AppointmentsSettingsSheet } from "@/components/settings/appointments-settings-sheet";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_APPOINTMENT_SETTINGS,
  withDerivedHours,
  type AppointmentSettings,
} from "@/lib/appointments/settings";
import type { ResolvedLocation } from "@/lib/locations";
import { InfoTip } from "@/components/ui/info-tip";

const AppointmentsCalendar = dynamic(
  () =>
    import("@/components/settings/appointments-calendar").then(
      (m) => m.AppointmentsCalendar,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[60vh] w-full animate-pulse rounded-lg bg-muted" />
    ),
  },
);

export type AppointmentsInitialData = AppointmentSettings;

export default function AppointmentSettingsPage({
  initialData,
  initialLocations,
}: {
  initialData?: AppointmentsInitialData;
  initialLocations?: ResolvedLocation[];
}) {
  const [settings, setSettings] = useState<AppointmentSettings>(
    initialData ?? DEFAULT_APPOINTMENT_SETTINGS,
  );
  const [locations, setLocations] = useState<ResolvedLocation[]>(initialLocations ?? []);
  const locationsRef = useRef(locations);
  locationsRef.current = locations;
  const [loading, setLoading] = useState(!initialData);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const saveChain = useRef(Promise.resolve());

  useEffect(() => {
    if (initialLocations) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/appointments/locations");
        const json = (await res.json()) as { locations?: ResolvedLocation[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Couldn't load locations.");
        if (!cancelled && json.locations) setLocations(json.locations);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't load locations.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialLocations]);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/appointments");
        const json = (await res.json()) as {
          ok?: boolean;
          settings?: AppointmentSettings;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Couldn't load.");
        if (!cancelled && json.settings) setSettings(json.settings);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't load settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  const saveAvailability = useCallback((patch: Partial<AppointmentSettings>) => {
    const run = async () => {
      const previous = settingsRef.current;
      const optimistic = withDerivedHours({ ...previous, ...patch });
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
        if (json.settings) {
          let after = { ...settingsRef.current };
          for (const key of Object.keys(patch) as (keyof AppointmentSettings)[]) {
            if (patch[key] !== undefined) {
              (after as Record<string, unknown>)[key] = json.settings[key];
            }
          }
          after = withDerivedHours(after);
          setSettings(after);
          settingsRef.current = after;
        }
        toast.success("Availability updated");
      } catch (e) {
        let rolled = { ...settingsRef.current };
        for (const key of Object.keys(patch) as (keyof AppointmentSettings)[]) {
          (rolled as Record<string, unknown>)[key] = previous[key];
        }
        rolled = withDerivedHours(rolled);
        setSettings(rolled);
        settingsRef.current = rolled;
        toast.error(e instanceof Error ? e.message : "Couldn't save.");
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

  const saveLocationBookable = useCallback((id: string, bookable: boolean) => {
    const run = async () => {
      const previous = locationsRef.current;
      const optimistic = previous.map((l) => (l.id === id ? { ...l, bookable } : l));
      setLocations(optimistic);
      locationsRef.current = optimistic;
      try {
        const res = await fetch("/api/settings/appointments/locations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, bookable }),
        });
        const json = (await res.json()) as { error?: unknown };
        if (!res.ok) {
          throw new Error(typeof json.error === "string" ? json.error : "Couldn't save.");
        }
        toast.success(bookable ? "Location now taking bookings" : "Location paused");
      } catch (e) {
        const rolled = locationsRef.current.map((l) =>
          l.id === id ? { ...l, bookable: previous.find((p) => p.id === id)?.bookable ?? l.bookable } : l,
        );
        setLocations(rolled);
        locationsRef.current = rolled;
        toast.error(e instanceof Error ? e.message : "Couldn't save.");
        throw e;
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
    <div className="flex flex-col sm:p-3 md:p-6">
      <style data-fullcalendar />
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3 md:mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-semibold">Appointments</h1>
            <InfoTip label="About Appointments">
              <p>
                Set bookable hours and blocks. Events from your connected Google
                Calendar, all-day ones too, show alongside them.
              </p>
            </InfoTip>
          </div>
          <p
            className="text-xs text-muted-foreground"
            aria-live="polite"
            style={{ minHeight: "1rem" }}
          >
            {savingAvailability ? "Saving…" : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label="Appointment settings"
          onClick={() => setSheetOpen(true)}
        >
          <Settings className="size-4" />
        </Button>
      </div>

      <AppointmentsCalendar
        settings={settings}
        locations={locations}
        onAvailabilityChange={saveAvailability}
        onOpenSettings={() => setSheetOpen(true)}
      />

      <AppointmentsSettingsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        settings={settings}
        locations={locations}
        onToggleLocation={saveLocationBookable}
        onSaved={(s) => {
          setSettings(s);
          settingsRef.current = s;
        }}
      />
    </div>
  );
}
