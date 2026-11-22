"use client";

import * as React from "react";
import { CalendarIcon, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type MyBookingView = {
  eventId: string;
  title: string;
  detail: string | null;
  startsAt: string;
  endsAt: string;
  locationId: string | null;
  locationName: string | null;
  changeable: boolean;
};

export type BookingPlace = { id: string; name: string; address: string };

type Slot = { id: string; startIso: string; endIso: string };
type DaySuggestion = { date: string; count: number };

const SGT = "Asia/Singapore";

const whenLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-SG", {
    timeZone: SGT,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-SG", { timeZone: SGT, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const dayLabel = (ymd: string) =>
  new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${ymd}T00:00:00Z`),
  );

const sgtToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: SGT, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );

const ymdToLocal = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const localToYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const CURRENT = "current";

export function withCurrentSlot(slots: Slot[], booking: Pick<MyBookingView, "startsAt" | "endsAt">, ymd: string): Slot[] {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: SGT, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(booking.startsAt),
  );
  const start = Date.parse(booking.startsAt);
  if (day !== ymd || slots.some((s) => Date.parse(s.startIso) === start)) return slots;
  return [...slots, { id: CURRENT, startIso: booking.startsAt, endIso: booking.endsAt }].sort(
    (a, b) => Date.parse(a.startIso) - Date.parse(b.startIso),
  );
}

export function MyBookings({
  bookings,
  places,
  closedNote,
}: {
  bookings: MyBookingView[];
  places: BookingPlace[];
  closedNote: string;
}) {
  const [items, setItems] = React.useState(bookings);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [changed, setChanged] = React.useState<string | null>(null);

  return (
    <ul className="space-y-4">
      {items.map((b) => (
        <li key={b.eventId} className="space-y-3 rounded-lg border p-5 sm:p-6">
          <div className="space-y-1">
            <p className="font-medium">{b.title}</p>
            {b.detail ? <p className="text-sm text-muted-foreground">{b.detail}</p> : null}
            <p className="text-sm">{whenLabel(b.startsAt)}</p>
            {b.locationName ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4 shrink-0" />
                {b.locationName}
              </p>
            ) : null}
          </div>
          {changed === b.eventId ? (
            <p role="status" className="text-sm font-medium text-primary">
              Booking changed. We&apos;ve emailed you an updated calendar invite.
            </p>
          ) : null}
          {editing === b.eventId ? (
            <ChangeBookingForm
              booking={b}
              places={places}
              onCancel={() => setEditing(null)}
              onChanged={(next) => {
                setItems((all) =>
                  all
                    .map((x) => (x.eventId === b.eventId ? { ...x, ...next } : x))
                    .sort((x, y) => Date.parse(x.startsAt) - Date.parse(y.startsAt)),
                );
                setEditing(null);
                setChanged(b.eventId);
              }}
            />
          ) : b.changeable ? (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setChanged(null);
                setEditing(b.eventId);
              }}
            >
              Change date, time or location
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{closedNote}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function ChangeBookingForm({
  booking,
  places,
  onCancel,
  onChanged,
}: {
  booking: MyBookingView;
  places: BookingPlace[];
  onCancel: () => void;
  onChanged: (next: Pick<MyBookingView, "startsAt" | "endsAt" | "locationId" | "locationName">) => void;
}) {
  const [placeId, setPlaceId] = React.useState(
    places.some((p) => p.id === booking.locationId) ? (booking.locationId as string) : "",
  );
  const [date, setDate] = React.useState("");
  const [dateOpen, setDateOpen] = React.useState(false);
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [suggestions, setSuggestions] = React.useState<DaySuggestion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [slot, setSlot] = React.useState<Slot | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const asked = React.useRef("");

  async function pickDate(ymd: string) {
    asked.current = ymd;
    setDate(ymd);
    setSlot(null);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/appointments/slots?date=${ymd}`);
      const body = await res.json().catch(() => null);
      if (asked.current !== ymd) return;
      setSlots(body?.ok ? withCurrentSlot(body.slots, booking, ymd) : []);
      setSuggestions(body?.ok ? (body.suggestions ?? []) : []);
      if (!body?.ok) setError("We couldn't load times for that day. Please try again.");
    } catch {
      if (asked.current === ymd) setError("We couldn't load times for that day. Please try again.");
    } finally {
      if (asked.current === ymd) setLoading(false);
    }
  }

  async function save() {
    if (!slot || !placeId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: booking.eventId,
          start_iso: slot.startIso,
          end_iso: slot.endIso,
          location_id: placeId,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? "We couldn't change your booking. Please try again.");
        if (body?.code === "taken") setSlot(null);
        return;
      }
      onChanged({
        startsAt: body.starts_at,
        endsAt: body.ends_at,
        locationId: placeId,
        locationName: body.location_name,
      });
    } catch {
      setError("We couldn't change your booking. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`place-${booking.eventId}`}>Location</Label>
        <Select value={placeId} onValueChange={setPlaceId}>
          <SelectTrigger id={`place-${booking.eventId}`} className="w-full">
            <SelectValue placeholder="Choose a location" />
          </SelectTrigger>
          <SelectContent>
            {places.map((p) => (
              <SelectItem key={p.id} value={p.id} textValue={p.name}>
                <span className="flex flex-col">
                  <span>{p.name}</span>
                  {p.address ? <span className="text-xs text-muted-foreground">{p.address}</span> : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`date-${booking.eventId}`}>New date</Label>
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button
              id={`date-${booking.eventId}`}
              type="button"
              variant="outline"
              className={cn("w-full justify-start font-normal", !date && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 size-4 shrink-0" />
              {date ? dayLabel(date) : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              captionLayout="dropdown"
              selected={date ? ymdToLocal(date) : undefined}
              defaultMonth={ymdToLocal(date || sgtToday())}
              onSelect={(d) => {
                setDateOpen(false);
                if (d) void pickDate(localToYmd(d));
              }}
              disabled={{ before: ymdToLocal(sgtToday()) }}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-2" aria-live="polite">
        <Label>New time</Label>
        {!date ? (
          <p className="text-sm text-muted-foreground">Pick a date to see available times.</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading times…</p>
        ) : slots.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">No times left that day.</p>
            {suggestions.length ? (
              <div className="flex flex-col gap-2">
                {suggestions.map((s) => (
                  <Button
                    key={s.date}
                    type="button"
                    variant="outline"
                    className="h-auto justify-between py-2 max-md:min-h-11"
                    onClick={() => void pickDate(s.date)}
                  >
                    <span>{dayLabel(s.date)}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.count} {s.count === 1 ? "time" : "times"}
                    </span>
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <Button
                key={s.id}
                type="button"
                variant={slot?.id === s.id ? "default" : "outline"}
                className={cn("h-9 max-md:min-h-11", slot?.id === s.id && "ring-2 ring-ring")}
                onClick={() => setSlot(s)}
              >
                {s.id === CURRENT ? `${timeLabel(s.startIso)} (now)` : timeLabel(s.startIso)}
              </Button>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" disabled={!slot || !placeId || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save new time"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Keep current booking
        </Button>
      </div>
    </div>
  );
}
