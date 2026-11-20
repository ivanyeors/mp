"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventInput,
  EventSourceFunc,
  EventSourceInput,
} from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Mail,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { ReadjustmentPanel } from "@/components/settings/readjustment-panel";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { CalendarRangeEvent } from "@/lib/appointments/calendar";
import {
  DEFAULT_AVAILABILITY_WINDOW,
  WEEKDAY_LABELS,
  hhmm,
  type AppointmentSettings,
  type AppointmentType,
  type WeeklyAvailability,
} from "@/lib/appointments/settings";
import { locationColorMap, type LocationColorMap } from "@/lib/appointments/location-colors";
import type { ResolvedLocation } from "@/lib/locations";
import {
  addSgtDays,
  formatSlotLabelSgt,
  sgtLocalToUtcMs,
  sgtParts,
} from "@/lib/appointments/slots";
import "./appointments-calendar.css";

type PendingSelect = { start: Date; end: Date };

/** What the detail sheet is showing: a Google event, or a local block to remove. */
type DetailTarget =
  | { kind: "event"; event: CalendarRangeEvent }
  | { kind: "blocked"; start: string; end: string };

type Props = {
  settings: AppointmentSettings;
  /** Every Location; the summary tile counts the bookable ones with an address. */
  locations: ResolvedLocation[];
  onAvailabilityChange: (patch: Partial<AppointmentSettings>) => Promise<void>;
  /** Opens the gear sheet (the Locations tile is a shortcut to it). */
  onOpenSettings: () => void;
};

const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];

type ViewId = "timeGridDay" | "timeGridThreeDay" | "timeGridWeek" | "dayGridMonth";

const DESKTOP_DEFAULT_VIEW: ViewId = "timeGridWeek";
/** Three wide, readable columns beats seven unreadable ones on a phone. */
const MOBILE_DEFAULT_VIEW: ViewId = "timeGridThreeDay";

const VIEW_OPTIONS: { id: ViewId; label: string; mobileOnly?: boolean }[] = [
  { id: "timeGridDay", label: "Day" },
  { id: "timeGridThreeDay", label: "3 days", mobileOnly: true },
  { id: "timeGridWeek", label: "Week" },
  { id: "dayGridMonth", label: "Month" },
];

/**
 * Per-view formats. On a phone the header cells are ~45–110px wide, so the
 * day header drops the year/month and the title drops the year.
 */
const DESKTOP_VIEWS = {
  timeGridThreeDay: { type: "timeGrid", duration: { days: 3 } },
} as const;

const MOBILE_VIEWS = {
  timeGridDay: {
    titleFormat: { weekday: "short", day: "numeric", month: "short" },
    dayHeaderFormat: { weekday: "short", day: "numeric", month: "short" },
  },
  timeGridThreeDay: {
    type: "timeGrid",
    duration: { days: 3 },
    titleFormat: { day: "numeric", month: "short" },
    dayHeaderFormat: { weekday: "short", day: "numeric" },
  },
  timeGridWeek: {
    titleFormat: { day: "numeric", month: "short" },
    dayHeaderFormat: { weekday: "short", day: "numeric" },
  },
  dayGridMonth: {
    titleFormat: { month: "long", year: "numeric" },
    dayHeaderFormat: { weekday: "short" },
  },
} as const;

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

/** GCal all-day end is exclusive YYYY-MM-DD — show inclusive range. */
function formatAllDayLabel(startDate: string, endDateExclusive: string): string {
  const end = new Date(`${endDateExclusive}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const endInclusive = end.toISOString().slice(0, 10);
  if (endInclusive === startDate) return `All day, ${startDate}`;
  return `All day, ${startDate} to ${endInclusive}`;
}

/**
 * Summary-tile copy for the week's windows. When every open day shares the
 * same windows, show them; otherwise say so and point at the gear sheet.
 */
function summarizeAvailability(av: WeeklyAvailability): {
  label: string;
  caption: string;
} {
  const open = av.filter((d) => d.length);
  if (!open.length) return { label: "Closed", caption: "no open days" };
  const key = (d: { start: string; end: string }[]) =>
    d.map((w) => `${w.start} to ${w.end}`).join(", ");
  const first = key(open[0]!);
  const uniform = open.every((d) => key(d) === first);
  if (uniform) return { label: first, caption: `${open.length} open days` };
  return { label: "Varies by day", caption: "edit in settings" };
}

/** Copy of the week with one day replaced. */
function withDay(
  av: WeeklyAvailability,
  dow: number,
  windows: { start: string; end: string }[],
): WeeklyAvailability {
  return av.map((d, i) => (i === dow ? windows : d));
}

/** Browser-local getDay() is wrong when admin isn't in SGT — use wall-clock SGT. */
function sgtDow(date: Date): number {
  return sgtParts(date.getTime()).dow;
}

/** Inclusive range label for a selection (end is exclusive). */
function formatRangeLabel(start: Date, end: Date): string {
  return `${formatSlotLabelSgt(start.toISOString())} to ${formatSlotLabelSgt(
    new Date(end.getTime() - 60_000).toISOString(),
  )}`;
}

type Rsvp = NonNullable<CalendarRangeEvent["rsvp"]>;
/** Chip status: the guest's RSVP, or Cancelled when Google dropped the event. */
type ChipStatus = Rsvp | "cancelled";

/**
 * Status as an icon, not a pill: the chip has one line, so shape carries the
 * status (tick / cross / ? / envelope / ban) and the left-border accent keeps
 * the colour. Labels live in the legend and the detail sheet.
 */
const STATUS_META: Record<ChipStatus, { label: string; Icon: LucideIcon; className: string }> = {
  accepted: { label: "Confirmed", Icon: Check, className: "text-green-600 dark:text-green-400" },
  declined: { label: "Declined", Icon: X, className: "text-red-600 dark:text-red-400" },
  tentative: {
    label: "Tentative",
    Icon: CircleHelp,
    className: "text-amber-700 dark:text-amber-400",
  },
  needsAction: { label: "Invited", Icon: Mail, className: "text-slate-500 dark:text-slate-400" },
  cancelled: { label: "Cancelled", Icon: Ban, className: "text-muted-foreground" },
};

/** Type as fill colour + a small icon (blue vs violet alone is thin for colour-blind staff). */
const TYPE_META: Record<AppointmentType, { label: string; Icon: LucideIcon; fill: string; border: string }> = {
  customisation: { label: "Customise", Icon: Sparkles, fill: "#2563eb", border: "#1d4ed8" },
  readjustment: { label: "Readjust", Icon: RefreshCw, fill: "#7c3aed", border: "#6d28d9" },
};

function chipStatus(ev: CalendarRangeEvent | undefined): ChipStatus | null {
  if (!ev) return null;
  if (ev.cancelled) return "cancelled";
  return ev.rsvp;
}

/**
 * Location dot. A colour when the event resolved to a Location; hollow for
 * "Other / no location". Inside a chip it rides on the dark type fill (white
 * ring); in the legend and sheets it sits on the page background (dark ring).
 */
function LocationDot({
  color,
  onFill = false,
  className,
}: {
  color: string | null | undefined;
  onFill?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("mp-loc-dot", !color && "mp-loc-dot-hollow", onFill && "mp-loc-dot-on-fill", className)}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

/** Icon + label, used by the legend and the detail sheet (the chip shows the icon alone). */
function StatusLabel({ status }: { status: ChipStatus }) {
  const { label, Icon, className } = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", className)}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

/**
 * Custom event body. One line: type icon, guest name, status icon — the grid
 * row already says when, and the fill colour already says which type, so the
 * chip drops the time and the "Mpillow Customisation" text that used to bleed
 * out of short slots. A second line with the venue shows only where the slot
 * is tall enough; otherwise it clips inside the chip.
 */
function renderEventContent(arg: EventContentArg) {
  const props = arg.event.extendedProps as {
    kind?: string;
    event?: CalendarRangeEvent;
    /** Resolved at fetch time from the Location colour map (null = unresolved). */
    locationColor?: string | null;
  };
  const ev = props.event;
  const isAppointment = props.kind === "appointment";
  const type = isAppointment && ev?.appointmentType ? TYPE_META[ev.appointmentType] : null;
  const status = isAppointment ? chipStatus(ev) : null;
  const StatusIcon = status ? STATUS_META[status].Icon : null;
  const locColor = props.locationColor ?? null;
  const venue = ev?.locationName ?? ev?.location ?? null;
  return (
    <div className="mp-event">
      <div className="mp-event-head">
        {isAppointment ? <LocationDot color={locColor} onFill /> : null}
        {type ? <type.Icon className="mp-icon" aria-label={type.label} /> : null}
        <span className="mp-title">{arg.event.title}</span>
        {status && StatusIcon ? (
          <StatusIcon className="mp-icon mp-status-icon" aria-label={STATUS_META[status].label} />
        ) : null}
      </div>
      {isAppointment && venue ? (
        <div className="mp-event-sub" aria-hidden>
          {venue}
        </div>
      ) : null}
    </div>
  );
}

function LegendSwatch({ className }: { className: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-sm", className)} />;
}

export function AppointmentsCalendar({
  settings,
  locations,
  onAvailabilityChange,
  onOpenSettings,
}: Props) {
  // This component is loaded with `ssr: false`, so it is never hydrated and
  // useIsMobile has the screen's value on the first render: the initial view
  // and legend are right without mounting the desktop week grid first.
  const isMobile = useIsMobile();
  const calendarRef = useRef<FullCalendar>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const busyRef = useRef(false);
  const toggleRef = useRef<(dow: number) => Promise<void>>(async () => {});
  // Colour by position across *all* Locations so the sheet and the chips agree.
  // Ref-backed (like settingsRef) so the stable event source can read it.
  const locationColors = useMemo(() => locationColorMap(locations.map((l) => l.id)), [locations]);
  const locationColorsRef = useRef<LocationColorMap>(locationColors);
  locationColorsRef.current = locationColors;

  const [pendingSelect, setPendingSelect] = useState<PendingSelect | null>(null);
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [legendOpen, setLegendOpen] = useState(() => !isMobile);
  const [viewState, setViewState] = useState<{ type: string; title: string }>({
    type: isMobile ? MOBILE_DEFAULT_VIEW : DESKTOP_DEFAULT_VIEW,
    title: "",
  });

  // Breakpoint crossed after mount (rotation, resize): move to that side's default view.
  const prevMobileRef = useRef(isMobile);
  useEffect(() => {
    if (prevMobileRef.current === isMobile) return;
    prevMobileRef.current = isMobile;
    const api = calendarRef.current?.getApi();
    if (!api) return;
    const current = api.view.type as ViewId;
    const allowed = VIEW_OPTIONS.filter((v) => isMobile || !v.mobileOnly).map((v) => v.id);
    if (!allowed.includes(current)) {
      api.changeView(isMobile ? MOBILE_DEFAULT_VIEW : DESKTOP_DEFAULT_VIEW);
    }
  }, [isMobile]);

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

  // One band per window, so a split day (10–12, 14–18) shows the gap.
  const businessHours = useMemo(
    () =>
      settings.availability.flatMap((day, dow) =>
        day.map((w) => ({
          daysOfWeek: [dow],
          startTime: w.start === "24:00" ? "23:59" : w.start,
          endTime: w.end,
        })),
      ),
    [settings.availability],
  );

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
        if (!res.ok) throw new Error(json.error ?? "Couldn't load events.");
        success(
          (json.events ?? []).map((e) => {
            const isBusy = e.kind === "busy";
            // Busy: first description line beats a bare "Busy". Appointment: the
            // guest's name alone — type is the fill, and the summary's
            // "Mpillow Customisation" boilerplate is what overflowed the chip.
            const title = isBusy
              ? e.description
                ? e.description.split("\n")[0]!.trim() || e.summary
                : e.summary
              : (e.guestName ?? e.summary);
            const type = TYPE_META[e.appointmentType ?? "customisation"];
            return {
              id: e.id,
              title,
              start: e.startsAt,
              end: e.endsAt,
              allDay: e.allDay,
              backgroundColor: isBusy ? "rgba(148, 163, 184, 0.45)" : type.fill,
              borderColor: isBusy ? "rgba(100, 116, 139, 0.55)" : type.border,
              textColor: isBusy ? "#334155" : undefined,
              classNames: isBusy
                ? ["fc-gcal-busy-event"]
                : [
                    "fc-gcal-appointment",
                    e.cancelled
                      ? "fc-cancelled-event"
                      : `fc-rsvp-accent-${e.rsvp ?? "needsAction"}`,
                  ],
              editable: false,
              extendedProps: {
                kind: isBusy ? "gcal-busy" : "appointment",
                rsvp: e.rsvp,
                event: e,
                locationColor: e.locationId
                  ? (locationColorsRef.current.get(e.locationId) ?? null)
                  : null,
              },
            };
          }),
        );
      } catch (e) {
        const err = e instanceof Error ? e : new Error("Couldn't load events.");
        toast.error(err.message.slice(0, 280));
        failure(err);
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

  // Re-pull events when the server-side `showCancelled` flips, or when the
  // Location colour map changes (chips carry their colour from fetch time).
  const showCancelled = settings.showCancelled;
  const firstRefetchDeps = useRef(true);
  useEffect(() => {
    if (firstRefetchDeps.current) {
      firstRefetchDeps.current = false;
      return;
    }
    calendarRef.current?.getApi().refetchEvents();
  }, [showCancelled, locationColors]);

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

  /**
   * Touch has no drag-to-select without a long press, so on a phone a tap on a
   * slot selects one appointment-length slot, and a second tap extends the
   * range to it. Desktop clicks already select through FullCalendar itself.
   */
  const handleDateClick = (arg: DateClickArg) => {
    if (!isMobile || arg.allDay || arg.view.type === "dayGridMonth") return;
    const api = calendarRef.current?.getApi();
    if (!api) return;
    const slotMs = Math.max(30, settingsRef.current.durationMinutes) * 60_000;
    const tapStart = arg.date;
    const tapEnd = new Date(tapStart.getTime() + slotMs);
    // FullCalendar re-binds callbacks every render, so this closure is current.
    const current = pendingSelect;
    let next: PendingSelect;
    if (current && tapStart.getTime() >= current.end.getTime()) {
      next = { start: current.start, end: tapEnd };
    } else if (current && tapStart.getTime() < current.start.getTime()) {
      next = { start: tapStart, end: current.end };
    } else {
      next = { start: tapStart, end: tapEnd };
    }
    if (!selectAllow(next)) {
      toast.error("That day is closed. Open it first to block time or set hours.");
      return;
    }
    // Drives the `select` callback, so the mirror and the action bar stay in sync.
    api.select(next.start, next.end);
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

  /** SGT weekdays a selection touches (end exclusive). */
  const selectionDows = (sel: PendingSelect): number[] => {
    const dows = new Set<number>();
    let ms = sel.start.getTime();
    const endMs = sel.end.getTime() - 1;
    while (ms <= endMs) {
      const p = sgtParts(ms);
      dows.add(p.dow);
      const next = addSgtDays(p.y, p.m, p.d, 1);
      ms = sgtLocalToUtcMs(next.y, next.m, next.d, 0, 0);
    }
    return [...dows];
  };

  /**
   * The selection's wall-clock band becomes the single window for every
   * weekday it touches (Google's "set hours for Tuesday"). Other days keep
   * their own windows.
   */
  const handleSetHoursFromSelection = async () => {
    if (!pendingSelect) return;
    const startP = sgtParts(pendingSelect.start.getTime());
    const endP = sgtParts(pendingSelect.end.getTime());
    const startMin = startP.hour * 60 + startP.minute;
    // An exclusive end at midnight is the end of the day, not 00:00.
    const endMin = endP.hour === 0 && endP.minute === 0 ? 1440 : endP.hour * 60 + endP.minute;
    if (endMin <= startMin) {
      toast.error("Pick a range that starts and ends on the same day.");
      return;
    }
    const window = { start: hhmm(startMin), end: hhmm(endMin) };
    let availability = settingsRef.current.availability;
    for (const dow of selectionDows(pendingSelect)) {
      availability = withDay(availability, dow, [window]);
    }
    const ok = await applyPatch({ availability });
    if (ok) clearSelection();
  };

  const handleEventClick = (info: EventClickArg) => {
    const kind = info.event.extendedProps.kind as string | undefined;
    if (kind === "blocked") {
      setDetail({
        kind: "blocked",
        start: info.event.extendedProps.start as string,
        end: info.event.extendedProps.end as string,
      });
      return;
    }
    if (kind === "appointment" || kind === "gcal-busy") {
      setDetail({ kind: "event", event: info.event.extendedProps.event as CalendarRangeEvent });
    }
  };

  const handleRemoveBlock = async () => {
    if (detail?.kind !== "blocked") return;
    const { start, end } = detail;
    const blockedRanges = settingsRef.current.blockedRanges.filter(
      (r) => !(r.start === start && r.end === end),
    );
    const ok = await applyPatch({ blockedRanges });
    if (ok) setDetail(null);
  };

  // Ref-backed so dayHeaderDidMount listeners never go stale.
  // Closing a day clears its windows; reopening copies the first open day's
  // (or the default window) so the admin has something to adjust.
  toggleRef.current = async (dow: number) => {
    const av = settingsRef.current.availability;
    if (av[dow]?.length) {
      if (av.filter((d) => d.length).length <= 1) {
        toast.error("Keep at least one bookable day.");
        return;
      }
      await applyPatch({ availability: withDay(av, dow, []) });
      return;
    }
    const template = av.find((d) => d.length) ?? [DEFAULT_AVAILABILITY_WINDOW];
    await applyPatch({ availability: withDay(av, dow, template.map((w) => ({ ...w }))) });
  };

  const dayHeaderDidMount = useCallback((info: { el: HTMLElement; date: Date }) => {
    info.el.style.cursor = "pointer";
    info.el.title = "Click to open or close this day";
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

  const changeView = (id: ViewId) => {
    calendarRef.current?.getApi().changeView(id);
  };

  const handleDatesSet = (arg: DatesSetArg) => {
    setViewState({ type: arg.view.type, title: arg.view.title });
  };

  const visibleViews = VIEW_OPTIONS.filter((v) => isMobile || !v.mobileOnly);

  const detailEvent = detail?.kind === "event" ? detail.event : null;
  const hoursSummary = summarizeAvailability(settings.availability);
  const selectionDayLabel = pendingSelect
    ? (() => {
        const dows = selectionDows(pendingSelect);
        return dows.length === 1 ? `Set ${WEEKDAY_LABELS[dows[0]!]} hours` : "Set hours for these days";
      })()
    : "";

  const addressedLocations = locations.filter((l) => !!l.address?.trim());
  const bookableLocationCount = addressedLocations.filter((l) => l.bookable).length;
  const locationLegend = (
    <>
      {addressedLocations.map((l) => (
        <span
          key={l.id}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap",
            !l.bookable && "text-muted-foreground/70",
          )}
        >
          <LocationDot color={locationColors.get(l.id)} />
          {l.name}
          {!l.bookable ? <span className="text-[10px]">(off)</span> : null}
        </span>
      ))}
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
        <LocationDot color={null} />
        Other or no location
      </span>
    </>
  );

  return (
    <div className="appointments-calendar flex flex-col gap-3">
      {/* Config summary — always-visible facts; legend folds away on a phone */}
      <div className="shrink-0 rounded-lg border border-border bg-muted/30">
        {/* Four facts: 2×2 on a phone (four columns would truncate the hours). */}
        <div className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x divide-border">
          <div className="min-w-0 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Open hours (SGT)
            </div>
            <div className="truncate text-sm font-semibold tabular-nums" title={hoursSummary.label}>
              {hoursSummary.label}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">{hoursSummary.caption}</div>
          </div>
          <div className="min-w-0 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Slot</div>
            <div className="text-sm font-semibold tabular-nums">{settings.durationMinutes} min</div>
          </div>
          <div className="min-w-0 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Blocks</div>
            <div className="text-sm font-semibold tabular-nums">{settings.blockedRanges.length}</div>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            title="Choose which locations take bookings"
            className="min-w-0 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 active:bg-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Locations
            </div>
            <div className="text-sm font-semibold tabular-nums">
              {bookableLocationCount} of {addressedLocations.length}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">taking bookings</div>
          </button>
        </div>

        <div className="border-t border-border px-3 py-2.5">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="text-xs text-muted-foreground sm:text-sm">Bookable days</span>
            <div className="flex w-full gap-1 sm:w-auto" role="group" aria-label="Bookable days">
              {DAY_CHIPS.map((d) => {
                const on = settings.bookableDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    disabled={busy}
                    aria-pressed={on}
                    title={on ? `Close ${d.label}` : `Open ${d.label}`}
                    onClick={() => void toggleRef.current(d.value)}
                    className={cn(
                      "min-h-11 flex-1 rounded-md px-1 text-xs font-medium transition-colors sm:min-h-7 sm:flex-none sm:px-2",
                      on
                        ? "bg-emerald-600/90 text-white active:bg-emerald-700"
                        : "border border-border bg-background text-muted-foreground line-through active:bg-press",
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Phone: the legend folds away, but the location dots are the one key
            staff need there (the chip has no room for a name), so they stay
            visible as a scrolling strip. */}
        <div
          className="flex items-center gap-3 overflow-x-auto border-t border-border px-3 py-2 text-xs text-muted-foreground md:hidden"
          aria-label="Location colours"
        >
          <span className="shrink-0 font-medium text-foreground">Location</span>
          {locationLegend}
        </div>

        <Collapsible open={legendOpen} onOpenChange={setLegendOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between border-t border-border px-3 text-xs text-muted-foreground transition-colors active:bg-press md:min-h-10"
            >
              <span>Legend &amp; tips</span>
              <ChevronDown
                className={cn("size-4 transition-transform", legendOpen && "rotate-180")}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3 py-2.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <LegendSwatch className="bg-emerald-500/40 ring-1 ring-emerald-500/60" />
                Open hours
              </span>
              <span className="inline-flex items-center gap-1.5">
                <LegendSwatch className="bg-muted ring-1 ring-border" />
                Closed day or outside hours
              </span>
              <span className="inline-flex items-center gap-1.5">
                <LegendSwatch className="bg-red-500/40 ring-1 ring-red-500/60" />
                Blocked (local)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <LegendSwatch className="bg-slate-400/50 ring-1 ring-slate-500/50" />
                Google busy or blocked
              </span>

              <span className="hidden h-4 w-px bg-border sm:block" />

              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">Type</span>
                {(Object.keys(TYPE_META) as AppointmentType[]).map((t) => {
                  const { label, Icon, fill } = TYPE_META[t];
                  return (
                    <span key={t} className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-white"
                        style={{ backgroundColor: fill }}
                      >
                        <Icon className="size-2.5" aria-hidden />
                      </span>
                      {label}
                    </span>
                  );
                })}
              </span>

              <span className="hidden h-4 w-px bg-border sm:block" />

              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">Status</span>
                {(
                  ["accepted", "declined", "tentative", "needsAction"] as ChipStatus[]
                ).map((st) => (
                  <StatusLabel key={st} status={st} />
                ))}
                {settings.showCancelled ? <StatusLabel status="cancelled" /> : null}
              </span>

              <span className="hidden h-4 w-px bg-border md:block" />

              <span className="hidden flex-wrap items-center gap-2 md:inline-flex">
                <span className="font-medium text-foreground">Location</span>
                {locationLegend}
              </span>

              <span className="basis-full sm:ml-auto sm:basis-auto">
                {isMobile
                  ? "Tap a slot to block or set hours, then tap again to extend. Tap a day chip to open or close it."
                  : "Drag to block or set hours. Click a day chip or header to open or close it."}
              </span>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Toolbar — ours, not FullCalendar's, so it wraps and sizes for touch */}
      <div className="flex shrink-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-none"
              aria-label="Previous"
              onClick={() => calendarRef.current?.getApi().prev()}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-none border-l border-border"
              aria-label="Next"
              onClick={() => calendarRef.current?.getApi().next()}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => calendarRef.current?.getApi().today()}
          >
            Today
          </Button>
          <h2
            className="min-w-0 flex-1 truncate text-base font-semibold text-foreground md:text-lg"
            aria-live="polite"
          >
            {viewState.title}
          </h2>
        </div>

        <div
          role="tablist"
          aria-label="Calendar view"
          className="grid w-full auto-cols-fr grid-flow-col overflow-hidden rounded-md border border-border md:w-auto"
        >
          {visibleViews.map((v, i) => {
            const active = viewState.type === v.id;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => changeView(v.id)}
                className={cn(
                  "min-h-11 px-3 text-sm font-medium transition-colors md:min-h-8 md:px-3",
                  i > 0 && "border-l border-border",
                  active
                    ? "bg-foreground text-background"
                    : "bg-background text-foreground hover:bg-muted active:bg-press",
                )}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "relative min-h-0 overflow-hidden rounded-lg border border-border",
          "h-[calc(100svh-8rem)] min-h-[28rem] md:h-[calc(100svh-19rem)]",
        )}
      >
        <FullCalendar
          ref={calendarRef}
          plugins={PLUGINS}
          initialView={isMobile ? MOBILE_DEFAULT_VIEW : DESKTOP_DEFAULT_VIEW}
          views={isMobile ? MOBILE_VIEWS : DESKTOP_VIEWS}
          headerToolbar={false}
          timeZone="Asia/Singapore"
          locale="en-gb"
          firstDay={0}
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          scrollTime={`${padHour(settings.openHour)}:00:00`}
          slotLabelFormat={{
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }}
          // The grid row already says when; the chip spends its one line on who.
          displayEventTime={false}
          allDaySlot
          nowIndicator
          selectable
          selectMirror
          selectOverlap
          unselectAuto={false}
          selectAllow={selectAllow}
          // Touch: a long press of ~⅓s starts a drag-select instead of the 1s default.
          longPressDelay={350}
          selectLongPressDelay={350}
          eventLongPressDelay={350}
          dayMaxEvents
          businessHours={businessHours}
          height="100%"
          eventSources={eventSources}
          eventContent={renderEventContent}
          select={handleSelect}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          datesSet={handleDatesSet}
          dayHeaderClassNames={dayHeaderClassNames}
          dayCellClassNames={dayCellClassNames}
          dayHeaderDidMount={dayHeaderDidMount}
          dayHeaderContent={(arg) => {
            const dow = sgtDow(arg.date);
            const open = settings.bookableDays.includes(dow);
            // Seven columns on a phone: a dot says open/closed where a word can't fit.
            const compact =
              isMobile && (arg.view.type === "timeGridWeek" || arg.view.type === "dayGridMonth");
            return (
              <span className="flex flex-col items-center gap-0.5 leading-tight">
                <span>{arg.text}</span>
                {compact ? (
                  <span
                    aria-label={open ? "Open" : "Closed"}
                    className={cn(
                      "inline-block size-1.5 rounded-full",
                      open ? "bg-emerald-500" : "bg-muted-foreground/50",
                    )}
                  />
                ) : (
                  <span
                    className={
                      open
                        ? "text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                        : "text-[10px] font-medium text-muted-foreground"
                    }
                  >
                    {open ? "Open" : "Closed"}
                  </span>
                )}
              </span>
            );
          }}
          eventDisplay="block"
        />
      </div>

      {/* Selection actions: floats inside the grid on desktop; on a phone it
          pins above the dock so the calendar's own scroll can't hide it. */}
      {pendingSelect ? (
        <div
          className={cn(
            "z-40 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur",
            "max-md:fixed max-md:inset-x-3 max-md:bottom-[calc(var(--app-dock-clearance)+0.25rem)]",
            "md:fixed md:bottom-6 md:left-1/2 md:w-max md:max-w-[calc(100vw-3rem)] md:-translate-x-1/2",
          )}
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex items-center justify-between gap-2 md:contents">
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatRangeLabel(pendingSelect.start, pendingSelect.end)}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Cancel selection"
                className="md:order-last"
                onClick={clearSelection}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 md:contents">
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
                {selectionDayLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Detail layer: side panel on desktop, bottom sheet on a phone */}
      <Sheet
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {detail?.kind === "blocked"
                ? "Blocked time"
                : (detailEvent?.summary ?? "Appointment")}
            </SheetTitle>
            <SheetDescription>
              {detail?.kind === "blocked"
                ? "Local block. Customers can't book this time."
                : detailEvent?.kind === "busy"
                  ? "Busy or blocked in Google Calendar (read-only)"
                  : detailEvent?.cancelled
                    ? "Cancelled Google Calendar event (read-only)"
                    : "Google Calendar event (read-only)"}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {detail?.kind === "blocked" ? (
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">When</dt>
                  <dd className="tabular-nums">
                    {formatSlotLabelSgt(detail.start)} to{" "}
                    {formatSlotLabelSgt(
                      new Date(new Date(detail.end).getTime() - 60_000).toISOString(),
                    )}
                  </dd>
                </div>
              </dl>
            ) : detailEvent ? (
              <dl className="grid gap-3 text-sm">
                {detailEvent.guestName ? (
                  <div>
                    <dt className="text-muted-foreground">Guest</dt>
                    <dd>{detailEvent.guestName}</dd>
                  </div>
                ) : null}
                {detailEvent.phone ? (
                  <div>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>
                      <a className="underline underline-offset-2" href={`tel:${detailEvent.phone}`}>
                        {detailEvent.phone}
                      </a>
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-muted-foreground">When</dt>
                  <dd className="tabular-nums">
                    {detailEvent.allDay
                      ? formatAllDayLabel(detailEvent.startsAt, detailEvent.endsAt)
                      : `${formatSlotLabelSgt(detailEvent.startsAt)} to ${formatSlotLabelSgt(detailEvent.endsAt)}`}
                  </dd>
                </div>
                {detailEvent.description ? (
                  <div>
                    <dt className="text-muted-foreground">Description</dt>
                    <dd className="whitespace-pre-wrap">{detailEvent.description}</dd>
                  </div>
                ) : null}
                {detailEvent.typeLabel ? (
                  <div>
                    <dt className="text-muted-foreground">Type</dt>
                    <dd>{detailEvent.typeLabel}</dd>
                  </div>
                ) : null}
                {chipStatus(detailEvent) ? (
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <StatusLabel status={chipStatus(detailEvent)!} />
                    </dd>
                  </div>
                ) : null}
                {detailEvent.location || detailEvent.locationName ? (
                  <div>
                    <dt className="text-muted-foreground">Location</dt>
                    <dd className="flex items-start gap-2">
                      {detailEvent.kind === "appointment" ? (
                        <LocationDot
                          className="mt-1.5"
                          color={
                            detailEvent.locationId
                              ? locationColors.get(detailEvent.locationId)
                              : null
                          }
                        />
                      ) : null}
                      <span>
                        {detailEvent.locationName ? (
                          <span className="block font-medium">{detailEvent.locationName}</span>
                        ) : null}
                        {detailEvent.location ? (
                          <span className="block text-muted-foreground">{detailEvent.location}</span>
                        ) : null}
                      </span>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {detail?.kind !== "blocked" && detailEvent?.readjustmentBookingId ? (
              <ReadjustmentPanel key={detailEvent.readjustmentBookingId} bookingId={detailEvent.readjustmentBookingId} />
            ) : null}
          </div>

          {detail?.kind === "blocked" ? (
            <SheetFooter className="sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setDetail(null)}>
                Keep block
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void handleRemoveBlock()}
              >
                {busy ? "Removing…" : "Remove block"}
              </Button>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
