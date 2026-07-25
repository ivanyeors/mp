"use client";

import * as React from "react";
import { CalendarIcon, Check, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";

type ApptType = "customisation" | "readjustment";
type Location = { id: string; name: string; type: string; address: string };
type Slot = { id: string; startIso: string; endIso: string };

/** Today's date in Asia/Singapore as YYYY-MM-DD (earliest bookable day). */
function sgtToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "YYYY-MM-DD" → local midnight Date (no UTC shift), for the Calendar. */
function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Local Date → "YYYY-MM-DD" from local parts (the SGT day the user tapped). */
function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Chosen date as a long label, e.g. "Fri, 25 Jul 2026". */
function dateLabel(ymd: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseYmdLocal(ymd));
}

/** Slot start time labelled in SGT, e.g. "2:30 PM". */
function slotLabel(startIso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(startIso));
}

export function BookingFlow() {
  const { m } = useI18n();
  const t = m.slides.bookAppointment.flow;

  const [type, setType] = React.useState<ApptType>("customisation");
  const [locations, setLocations] = React.useState<Location[]>([]);
  const [locationId, setLocationId] = React.useState<string>("");
  const [date, setDate] = React.useState<string>("");
  const [dateOpen, setDateOpen] = React.useState(false);
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = React.useState(false);
  const [slot, setSlot] = React.useState<Slot | null>(null);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmed, setConfirmed] = React.useState<Location | null>(null);

  // Load visible locations once.
  React.useEffect(() => {
    let alive = true;
    fetch("/api/locations")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.ok) setLocations(d.locations);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Fetch free slots whenever the chosen date changes.
  React.useEffect(() => {
    if (!date) return; // cleared date → reset handler already empties slots
    let alive = true;
    setSlotsLoading(true);
    setSlot(null);
    fetch(`/api/appointments/slots?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setSlots(d?.ok ? d.slots : []);
      })
      .catch(() => {
        if (alive) setSlots([]);
      })
      .finally(() => {
        if (alive) setSlotsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [date]);

  const location = locations.find((l) => l.id === locationId) ?? null;
  const canSubmit =
    !!locationId && !!slot && name.trim().length > 0 && phone.trim().length > 0 && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !slot || !location) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: locationId,
          start_iso: slot.startIso,
          end_iso: slot.endIso,
          guest_name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          appointment_type: type,
        }),
      });
      if (res.ok) {
        setConfirmed(location);
        return;
      }
      if (res.status === 409) {
        setError(t.errorSlotTaken);
        setSlot(null);
        // Refresh the day's slots so the taken one drops off.
        const d = await fetch(`/api/appointments/slots?date=${date}`).then((r) => r.json());
        setSlots(d?.ok ? d.slots : []);
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? t.errorGeneric);
      }
    } catch {
      setError(t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Check className="size-6" />
        </div>
        <p className="text-lg font-medium">{t.confirmedTitle}</p>
        <p className="text-sm text-muted-foreground">
          {slot ? slotLabel(slot.startIso) : ""} {t.confirmedAt} {confirmed.name}
        </p>
        {confirmed.address ? (
          <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            {confirmed.address}
          </p>
        ) : null}
        <Button
          variant="outline"
          className="mt-2"
          onClick={() => {
            setConfirmed(null);
            setSlot(null);
            setSlots([]);
            setDate("");
            setName("");
            setPhone("");
            setEmail("");
            setError(null);
          }}
        >
          {t.bookAnother}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-6 py-4">
      {/* Appointment type */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t.typeLabel}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["customisation", "readjustment"] as const).map((opt) => (
            <Button
              key={opt}
              type="button"
              variant={type === opt ? "default" : "outline"}
              onClick={() => setType(opt)}
            >
              {opt === "customisation" ? t.customisation : t.readjustment}
            </Button>
          ))}
        </div>
      </fieldset>

      {/* Location picker */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-location">{t.locationLabel}</Label>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger id="booking-location" className="w-full">
            <SelectValue placeholder={t.locationPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                <span className="flex flex-col">
                  <span>{l.name}</span>
                  {l.address ? (
                    <span className="text-xs text-muted-foreground">{l.address}</span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-date">{t.dateLabel}</Label>
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button
              id="booking-date"
              type="button"
              variant="outline"
              className={cn("w-full justify-start font-normal", !date && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 size-4 shrink-0" />
              {date ? dateLabel(date) : t.datePlaceholder}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              captionLayout="dropdown"
              selected={date ? parseYmdLocal(date) : undefined}
              defaultMonth={date ? parseYmdLocal(date) : parseYmdLocal(sgtToday())}
              onSelect={(d) => {
                if (d) setDate(formatYmdLocal(d));
                setDateOpen(false);
              }}
              disabled={{ before: parseYmdLocal(sgtToday()) }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Slot grid */}
      <div className="flex flex-col gap-2">
        <Label>{t.slotLabel}</Label>
        {!date ? (
          <p className="text-sm text-muted-foreground">{t.pickDateFirst}</p>
        ) : slotsLoading ? (
          <p className="text-sm text-muted-foreground">{t.loadingSlots}</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noSlots}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <Button
                key={s.id}
                type="button"
                variant={slot?.id === s.id ? "default" : "outline"}
                className={cn("h-9", slot?.id === s.id && "ring-2 ring-ring")}
                onClick={() => setSlot(s)}
              >
                {slotLabel(s.startIso)}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Guest form */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-name">{t.nameLabel}</Label>
        <Input
          id="booking-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-phone">{t.phoneLabel}</Label>
        <Input
          id="booking-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-email">
          {t.emailLabel} <span className="text-muted-foreground">({t.emailOptional})</span>
        </Label>
        <Input
          id="booking-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={!canSubmit} className="mt-auto">
        {submitting ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
