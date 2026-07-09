"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import type {
  DateSelectArg,
  EventClickArg,
  EventInput,
  EventSourceFunc,
  EventSourceInput,
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CalendarRangeEvent } from "@/lib/appointments/calendar";
import type { AppointmentSettings } from "@/lib/appointments/settings";
import {
  addSgtDays,
  formatSlotLabelSgt,
  sgtLocalToUtcMs,
  sgtParts,
} from "@/lib/appointments/slots";
import "./appointments-calendar.css";

type PendingSelect = { start: Date; end: Date };

type Props = {
  settings: AppointmentSettings;
  onAvailabilityChange: (patch: Partial<AppointmentSettings>) => Promise<void>;
};

const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];
const HEADER_TOOLBAR = {
  left: "prev,next today",
  center: "title",
  right: "dayGridMonth,timeGridWeek,timeGridDay",
};

const DAY_CHIPS: { value: number; label: string }[] = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function padHour(h: number): string {
  return `${String(Math.min(Math.max(h, 0), 24)).padStart(2, "0")}:00`;
}

function formatHourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

/** GCal all-day end is exclusive YYYY-MM-DD — show inclusive range. */
function formatAllDayLabel(startDate: string, endDateExclusive: string): string {
  const end = new Date(`${endDateExclusive}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const endInclusive = end.toISOString().slice(0, 10);
  if (endInclusive === startDate) return `All day · ${startDate}`;
  return `All day · ${startDate} – ${endInclusive}`;
}

/** Last bookable start → wall-clock end of that slot. */
function hoursEndLabel(closeHour: number, durationMinutes: number): string {
  const end = Math.min(closeHour + Math.max(1, Math.ceil(durationMinutes / 60)), 24);
  return formatHourLabel(end);
}

/** Browser-local getDay() is wrong when admin isn't in SGT — use wall-clock SGT. */
function sgtDow(date: Date): number {
  return sgtParts(date.getTime()).dow;
}

export function AppointmentsCalendar({ settings, onAvailabilityChange }: Props) {
  const calendarRef = useRef<FullCalendar>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const busyRef = useRef(false);
  const toggleRef = useRef<(dow: number) => Promise<void>>(async () => {});

  const [pendingSelect, setPendingSelect] = useState<PendingSelect | null>(null);
  const [appointmentDetail, setAppointmentDetail] = useState<CalendarRangeEvent | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const blockedEvents = useMemo<EventInput[]>(
    () =>
      settings.blockedRanges.map((r) => ({
        id: `blocked:${r.start}:${r.end}`,
        start: r.start,
        end: r.end,
        title: "Blocked",
        // solid (not background) so eventClick works
        display: "block",
        backgroundColor: "rgba(220, 38, 38, 0.35)",
        borderColor: "rgba(185, 28, 28, 0.6)",
        textColor: "#7f1d1d",
        classNames: ["fc-blocked-event"],
        editable: false,
        extendedProps: { kind: "blocked", start: r.start, end: r.end },
      })),
    [settings.blockedRanges],
  );

  const businessHours = useMemo(() => {
    const durationHours = Math.max(1, Math.ceil(settings.durationMinutes / 60));
    return {
      daysOfWeek: settings.bookableDays,
      startTime: padHour(settings.openHour),
      // closeHour is last bookable *start*; band ends when that slot would finish
      endTime: padHour(Math.min(settings.closeHour + durationHours, 24)),
    };
  }, [settings.bookableDays, settings.openHour, settings.closeHour, settings.durationMinutes]);

  const fetchAppointments = useCallback<EventSourceFunc>(
    async (info, success, failure) => {
      try {
        const qs = new URLSearchParams({
          timeMin: info.startStr,
          timeMax: info.endStr,
        });
        const res = await fetch(`/api/settings/appointments/events?${qs}`);
        const json = (await res.json()) as {
          ok?: boolean;
          events?: CalendarRangeEvent[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Failed to load events");
        success(
          (json.events ?? []).map((e) => {
            const isBusy = e.kind === "busy";
            const title =
              isBusy && e.description
                ? e.description.split("\n")[0]!.trim() || e.summary
                : e.summary;
            return {
              id: e.id,
              title,
              start: e.startsAt,
              end: e.endsAt,
              allDay: e.allDay,
              backgroundColor: isBusy
                ? "rgba(148, 163, 184, 0.45)"
                : e.appointmentType === "readjustment"
                  ? "#7c3aed"
                  : "#2563eb",
              borderColor: isBusy
                ? "rgba(100, 116, 139, 0.55)"
                : e.appointmentType === "readjustment"
                  ? "#6d28d9"
                  : "#1d4ed8",
              textColor: isBusy ? "#334155" : undefined,
              classNames: isBusy ? ["fc-gcal-busy-event"] : ["fc-gcal-appointment"],
              editable: false,
              extendedProps: {
                kind: isBusy ? "gcal-busy" : "appointment",
                event: e,
              },
            };
          }),
        );
      } catch (e) {
        failure(e instanceof Error ? e : new Error("Failed to load events"));
      }
    },
    [],
  );

  // Stable eventSources so FullCalendar doesn't thrash-refetch every parent render
  const eventSources = useMemo<EventSourceInput[]>(
    () => [
      { id: "blocked", events: blockedEvents },
      { id: "gcal", events: fetchAppointments },
    ],
    [blockedEvents, fetchAppointments],
  );

  const clearSelection = () => {
    setPendingSelect(null);
    calendarRef.current?.getApi().unselect();
  };

  const applyPatch = async (patch: Partial<AppointmentSettings>) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      await onAvailabilityChange(patch);
      return true;
    } catch {
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleSelect = (info: DateSelectArg) => {
    setPendingSelect({ start: info.start, end: info.end });
  };

  const handleBlockSelection = async () => {
    if (!pendingSelect) return;
    const next = {
      start: pendingSelect.start.toISOString(),
      end: pendingSelect.end.toISOString(),
    };
    const ok = await applyPatch({
      blockedRanges: [...settingsRef.current.blockedRanges, next],
    });
    if (ok) clearSelection();
  };

  const handleSetHoursFromSelection = async () => {
    if (!pendingSelect) return;
    const startP = sgtParts(pendingSelect.start.getTime());
    // Selection end is exclusive; back one minute to get inclusive last hour
    const endP = sgtParts(pendingSelect.end.getTime() - 60_000);
    const openHour = startP.hour;
    const closeHour = Math.max(openHour, endP.hour);
    const ok = await applyPatch({ openHour, closeHour });
    if (ok) clearSelection();
  };

  const handleEventClick = async (info: EventClickArg) => {
    const kind = info.event.extendedProps.kind as string | undefined;
    if (kind === "blocked") {
      if (!window.confirm("Remove this blocked time?")) return;
      const start = info.event.extendedProps.start as string;
      const end = info.event.extendedProps.end as string;
      const blockedRanges = settingsRef.current.blockedRanges.filter(
        (r) => !(r.start === start && r.end === end),
      );
      await applyPatch({ blockedRanges });
      return;
    }
    if (kind === "appointment" || kind === "gcal-busy") {
      setAppointmentDetail(info.event.extendedProps.event as CalendarRangeEvent);
    }
  };

  // Ref-backed so dayHeaderDidMount listeners never go stale
  toggleRef.current = async (dow: number) => {
    const current = settingsRef.current.bookableDays;
    const set = new Set(current);
    if (set.has(dow)) {
      if (set.size <= 1) {
        toast.error("At least one bookable day is required");
        return;
      }
      set.delete(dow);
    } else {
      set.add(dow);
    }
    await applyPatch({ bookableDays: [...set].sort((a, b) => a - b) });
  };

  const dayHeaderDidMount = useCallback((info: { el: HTMLElement; date: Date }) => {
    info.el.style.cursor = "pointer";
    info.el.title = "Click to toggle bookable day";
    const dow = sgtDow(info.date);
    const onClick = () => {
      void toggleRef.current(dow);
    };
    info.el.addEventListener("click", onClick);
  }, []);

  const dayHeaderClassNames = useCallback(
    (arg: { date: Date }) =>
      settings.bookableDays.includes(sgtDow(arg.date))
        ? []
        : ["fc-day-header-bookable-off"],
    [settings.bookableDays],
  );

  const dayCellClassNames = useCallback(
    (arg: { date: Date }) =>
      settings.bookableDays.includes(sgtDow(arg.date)) ? [] : ["fc-non-bookable"],
    [settings.bookableDays],
  );

  const selectAllow = useCallback(
    (span: { start: Date; end: Date }) => {
      // Every SGT calendar day the selection touches must be bookable
      const bookable = new Set(settings.bookableDays);
      let ms = span.start.getTime();
      const endMs = span.end.getTime() - 1;
      while (ms <= endMs) {
        const p = sgtParts(ms);
        if (!bookable.has(p.dow)) return false;
        const next = addSgtDays(p.y, p.m, p.d, 1);
        ms = sgtLocalToUtcMs(next.y, next.m, next.d, 0, 0);
      }
      return true;
    },
    [settings.bookableDays],
  );

  return (
    <div className="appointments-calendar flex h-[calc(100svh-11rem)] min-h-[28rem] flex-col gap-3">
      {/* Live config summary — what the greys mean */}
      <div className="shrink-0 space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Open hours (SGT)</span>
            <span className="font-medium tabular-nums">
              {formatHourLabel(settings.openHour)} –{" "}
              {hoursEndLabel(settings.closeHour, settings.durationMinutes)}
            </span>
            <span className="text-xs text-muted-foreground">
              (last start {formatHourLabel(settings.closeHour)})
            </span>
          </div>
          <div className="hidden h-4 w-px bg-border sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Slot</span>
            <span className="font-medium tabular-nums">{settings.durationMinutes} min</span>
          </div>
          <div className="hidden h-4 w-px bg-border sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Blocks</span>
            <span className="font-medium tabular-nums">
              {settings.blockedRanges.length}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Bookable days</span>
          <div className="flex flex-wrap gap-1">
            {DAY_CHIPS.map((d) => {
              const on = settings.bookableDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  disabled={busy}
                  title={on ? `Close ${d.label}` : `Open ${d.label}`}
                  onClick={() => void toggleRef.current(d.value)}
                  className={
                    on
                      ? "rounded-md bg-emerald-600/90 px-2 py-0.5 text-xs font-medium text-white"
                      : "rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground line-through"
                  }
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-emerald-500/40 ring-1 ring-emerald-500/60" />
            Open hours
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-muted ring-1 ring-border" />
            Closed day / outside hours
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-red-500/40 ring-1 ring-red-500/60" />
            Blocked (local)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-slate-400/50 ring-1 ring-slate-500/50" />
            Google busy / block
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-blue-500" />
            Appointment
          </span>
          <span className="sm:ml-auto">
            Drag to block or set hours · click day chips or headers to toggle
          </span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        <FullCalendar
          ref={calendarRef}
          plugins={PLUGINS}
          initialView="timeGridWeek"
          headerToolbar={HEADER_TOOLBAR}
          timeZone="Asia/Singapore"
          locale="en-gb"
          firstDay={0}
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          scrollTime={`${padHour(settings.openHour)}:00:00`}
          allDaySlot
          nowIndicator
          selectable
          selectMirror
          selectOverlap
          unselectAuto={false}
          selectAllow={selectAllow}
          businessHours={businessHours}
          height="100%"
          eventSources={eventSources}
          select={handleSelect}
          eventClick={handleEventClick}
          dayHeaderClassNames={dayHeaderClassNames}
          dayCellClassNames={dayCellClassNames}
          dayHeaderDidMount={dayHeaderDidMount}
          dayHeaderContent={(arg) => {
            const dow = sgtDow(arg.date);
            const open = settings.bookableDays.includes(dow);
            return (
              <span className="flex flex-col items-center gap-0.5 leading-tight">
                <span>{arg.text}</span>
                <span
                  className={
                    open
                      ? "text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                      : "text-[10px] font-medium text-muted-foreground"
                  }
                >
                  {open ? "Open" : "Closed"}
                </span>
              </span>
            );
          }}
          eventDisplay="block"
        />

        {pendingSelect ? (
          <div className="absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
            <span className="text-sm text-muted-foreground">
              {formatSlotLabelSgt(pendingSelect.start.toISOString())} –{" "}
              {formatSlotLabelSgt(
                new Date(pendingSelect.end.getTime() - 60_000).toISOString(),
              )}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void handleBlockSelection()}
            >
              Block time
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void handleSetHoursFromSelection()}
            >
              Set as open hours
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
              Cancel
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog
        open={appointmentDetail !== null}
        onOpenChange={(open) => {
          if (!open) setAppointmentDetail(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{appointmentDetail?.summary ?? "Appointment"}</DialogTitle>
            <DialogDescription>
              {appointmentDetail?.kind === "busy"
                ? "Google Calendar busy / blocked time (read-only)"
                : "Google Calendar event (read-only)"}
            </DialogDescription>
          </DialogHeader>
          {appointmentDetail ? (
            <dl className="grid gap-2 text-sm">
              {appointmentDetail.guestName ? (
                <div>
                  <dt className="text-muted-foreground">Guest</dt>
                  <dd>{appointmentDetail.guestName}</dd>
                </div>
              ) : null}
              {appointmentDetail.phone ? (
                <div>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{appointmentDetail.phone}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground">When</dt>
                <dd>
                  {appointmentDetail.allDay
                    ? formatAllDayLabel(
                        appointmentDetail.startsAt,
                        appointmentDetail.endsAt,
                      )
                    : `${formatSlotLabelSgt(appointmentDetail.startsAt)} – ${formatSlotLabelSgt(appointmentDetail.endsAt)}`}
                </dd>
              </div>
              {appointmentDetail.description ? (
                <div>
                  <dt className="text-muted-foreground">Description</dt>
                  <dd className="whitespace-pre-wrap">{appointmentDetail.description}</dd>
                </div>
              ) : null}
              {appointmentDetail.typeLabel ? (
                <div>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{appointmentDetail.typeLabel}</dd>
                </div>
              ) : null}
              {appointmentDetail.location ? (
                <div>
                  <dt className="text-muted-foreground">Location</dt>
                  <dd>{appointmentDetail.location}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
