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

/** The `/api/settings/appointments` settings the page mounts with. */
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
  // Serialize availability writes so rapid toggles don't clobber each other
  const saveChain = useRef(Promise.resolve());
  // The server already loaded the settings; the sheet still saves and reloads.
  const skipFirstFetch = useRef(initialData != null);

  // Locations missed on the server (or not passed): pull them once on mount.
  const skipLocationsFetch = useRef(initialLocations != null);
  useEffect(() => {
    if (skipLocationsFetch.current) {
      skipLocationsFetch.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/appointments/locations");
        const json = (await res.json()) as { locations?: ResolvedLocation[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load locations");
        if (!cancelled && json.locations) setLocations(json.locations);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load locations");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
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
      // Hour fields are derived from the windows; keep them in step optimistically too.
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
        // Apply only this patch's keys from the server onto whatever is current
        // (later queued writes may have updated other fields already).
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

  /**
   * Flip one Location's bookable switch. Optimistic, rolled back on failure,
   * and queued on the same chain as availability writes so rapid taps land
   * in order.
   */
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
          throw new Error(typeof json.error === "string" ? json.error : "Save failed");
        }
        toast.success(bookable ? "Location now taking bookings" : "Location paused");
      } catch (e) {
        const rolled = locationsRef.current.map((l) =>
          l.id === id ? { ...l, bookable: previous.find((p) => p.id === id)?.bookable ?? l.bookable } : l,
        );
        setLocations(rolled);
        locationsRef.current = rolled;
        toast.error(e instanceof Error ? e.message : "Save failed");
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
    <div className="flex flex-col p-2 sm:p-3 md:p-6">
      <style data-fullcalendar />
      {/* Title row keeps the gear in thumb reach; the long blurb is desktop-only. */}
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3 md:mb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Appointments</h1>
          <p className="text-sm text-muted-foreground md:hidden">
            Bookable hours, blocks and Google Calendar events.
          </p>
          <p className="hidden text-sm text-muted-foreground md:block">
            Manage bookable hours and blocks on the calendar. Events from your
            connected Google Calendar (including all-day) appear alongside your
            availability.
          </p>
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
