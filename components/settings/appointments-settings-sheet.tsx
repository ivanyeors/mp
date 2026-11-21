"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DEFAULT_AVAILABILITY_WINDOW,
  WEEKDAY_LABELS,
  validateAvailability,
  type AppointmentSettings,
  type AvailabilityWindow,
  type WeeklyAvailability,
} from "@/lib/appointments/settings";
import { locationColorMap } from "@/lib/appointments/location-colors";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import type { Locale } from "@/lib/i18n/locales";
import type { ResolvedLocation } from "@/lib/locations";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/ui/info-tip";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppointmentSettings;
  onSaved: (settings: AppointmentSettings) => void;
  locations: ResolvedLocation[];
  onToggleLocation: (id: string, bookable: boolean) => Promise<void>;
};

function SectionHeading({ title, hint, info }: { title: string; hint?: string; info?: string }) {
  return (
    <div className="pt-2">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {info ? <InfoTip label={`About ${title}`}>{info}</InfoTip> : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6] as const;

type SheetTab = "locations" | "availability" | "booking" | "whatsapp" | "calendar";

function AvailabilityEditor({
  value,
  onChange,
}: {
  value: WeeklyAvailability;
  onChange: (next: WeeklyAvailability) => void;
}) {
  const setDay = (dow: number, windows: AvailabilityWindow[]) =>
    onChange(value.map((d, i) => (i === dow ? windows : d)));
  const template = (): AvailabilityWindow[] =>
    (value.find((d) => d.length) ?? [DEFAULT_AVAILABILITY_WINDOW]).map((w) => ({ ...w }));
  const openDays = value.filter((d) => d.length).length;

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {DAY_ORDER.map((dow) => {
        const windows = value[dow] ?? [];
        const open = windows.length > 0;
        return (
          <li key={dow} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-start">
            <label
              htmlFor={`day-${dow}`}
              className="flex min-h-11 w-full shrink-0 cursor-pointer items-center justify-between gap-3 rounded-md transition-colors active:bg-press sm:w-24 sm:justify-start"
            >
              <span className={open ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
                {WEEKDAY_LABELS[dow]}
              </span>
              <Switch
                id={`day-${dow}`}
                checked={open}
                aria-label={`${WEEKDAY_LABELS[dow]} open`}
                onCheckedChange={(checked) => setDay(dow, checked ? template() : [])}
              />
            </label>

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {open ? (
                windows.map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="time"
                      step={900}
                      value={w.start}
                      aria-label={`${WEEKDAY_LABELS[dow]} window ${i + 1} start`}
                      className="min-w-0 flex-1 tabular-nums"
                      onChange={(e) =>
                        setDay(
                          dow,
                          windows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                        )
                      }
                    />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input
                      type="time"
                      step={900}
                      value={w.end === "24:00" ? "23:59" : w.end}
                      aria-label={`${WEEKDAY_LABELS[dow]} window ${i + 1} end`}
                      className="min-w-0 flex-1 tabular-nums"
                      onChange={(e) =>
                        setDay(
                          dow,
                          windows.map((x, j) =>
                            j === i ? { ...x, end: e.target.value === "23:59" ? "24:00" : e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="min-h-11 min-w-11 shrink-0 md:min-h-8 md:min-w-8"
                      aria-label={`Remove ${WEEKDAY_LABELS[dow]} window ${i + 1}`}
                      onClick={() => setDay(dow, windows.filter((_, j) => j !== i))}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="py-2 text-xs text-muted-foreground">Closed</p>
              )}
              {open ? (
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-10 md:min-h-8"
                    onClick={() => {
                      const last = windows[windows.length - 1]!;
                      const nextStart = last.end === "24:00" ? "23:00" : last.end;
                      setDay(dow, [...windows, { start: nextStart, end: "24:00" }]);
                    }}
                  >
                    <Plus className="size-3.5" /> Add window
                  </Button>
                  {openDays > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-10 md:min-h-8"
                      title="Give every open day these windows"
                      onClick={() =>
                        onChange(
                          value.map((d) => (d.length ? windows.map((w) => ({ ...w })) : d)),
                        )
                      }
                    >
                      <Copy className="size-3.5" /> Copy to open days
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AppointmentsSettingsSheet({
  open,
  onOpenChange,
  settings,
  onSaved,
  locations,
  onToggleLocation,
}: Props) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<SheetTab>("locations");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const availabilityError = validateAvailability(draft.availability);
  const pathname = usePathname() ?? "/";
  const locale = (getLocaleFromPathname(pathname) ?? "en-US") as Locale;

  const addressed = locations.filter((l) => !!l.address?.trim());
  const bookableCount = addressed.filter((l) => l.bookable).length;
  const colors = locationColorMap(locations.map((l) => l.id));

  const toggle = async (loc: ResolvedLocation, bookable: boolean) => {
    setTogglingId(loc.id);
    try {
      await onToggleLocation(loc.id, bookable);
    } catch {} finally {
      setTogglingId(null);
    }
  };

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const [serviceFees, setServiceFees] = useState<{
    readjustment: number;
    freeVisits: number;
    freeWindowDays: number;
  } | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/settings/service-fees")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.ok) return;
        setServiceFees({
          readjustment: d.services.readjustment.msrp,
          freeVisits: d.readjustmentPolicy.freeVisits,
          freeWindowDays: d.readjustmentPolicy.freeWindowDays,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  const save = async () => {
    if (availabilityError) {
      setTab("availability");
      toast.error(availabilityError);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/appointments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappEnabled: draft.whatsappEnabled,
          venue: draft.venue,
          durationMinutes: draft.durationMinutes,
          customisationBookingUrl: draft.customisationBookingUrl,
          readjustmentBookingUrl: draft.readjustmentBookingUrl,
          customisationSummaryMatch: draft.customisationSummaryMatch,
          readjustmentSummaryMatch: draft.readjustmentSummaryMatch,
          slotLookaheadDays: draft.slotLookaheadDays,
          slotOfferCount: draft.slotOfferCount,
          showCancelled: draft.showCancelled,
          availability: draft.availability,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        settings?: AppointmentSettings;
        error?: unknown;
      };
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "These settings aren't valid.",
        );
      }
      if (json.settings) {
        onSaved(json.settings);
        toast.success("Settings saved");
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Appointment settings</SheetTitle>
          <SheetDescription>
            Locations, weekly hours, booking links, WhatsApp slot rules and calendar display.
            Blocks are added on the calendar.
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as SheetTab)}
          className="flex min-h-0 flex-1 flex-col gap-3 max-md:px-3"
        >
          <TabsList className="w-full justify-start md:w-fit">
            {(
              [
                ["locations", "Locations"],
                ["availability", "Availability"],
                ["booking", "Booking"],
                ["whatsapp", "WhatsApp"],
                ["calendar", "Calendar"],
              ] as [SheetTab, string][]
            ).map(([id, label]) => (
              <TabsTrigger
                key={id}
                value={id}
                className={cn(
                  "min-h-10 shrink-0 px-3 md:min-h-7",
                  id === "availability" && availabilityError && "text-destructive",
                )}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
            <TabsContent value="locations" className="space-y-3">
              <SectionHeading
                title="Bookable locations"
                hint={`${bookableCount} of ${addressed.length} taking bookings. Switches apply at once.`}
              />
              {addressed.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                  No locations with an address yet.{" "}
                  <Link
                    className="underline underline-offset-2"
                    href={withLocale("/settings/partners", locale)}
                  >
                    Add one on the Partners page
                  </Link>
                  .
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {addressed.map((loc) => {
                    const busy = togglingId === loc.id;
                    return (
                      <li key={loc.id}>
                        <label
                          htmlFor={`bookable-${loc.id}`}
                          className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 transition-colors active:bg-press",
                            busy && "opacity-70",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span
                                aria-hidden
                                className="mp-loc-dot"
                                style={{ backgroundColor: colors.get(loc.id) }}
                              />
                              <span className="truncate text-sm font-medium">{loc.name}</span>
                              <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {loc.type === "own" ? "Own studio" : "Partner"}
                              </span>
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {loc.address}
                            </span>
                          </span>
                          <Switch
                            id={`bookable-${loc.id}`}
                            checked={loc.bookable}
                            disabled={busy}
                            aria-label={`${loc.name}: taking bookings`}
                            onCheckedChange={(checked) => void toggle(loc, checked)}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="availability" className="space-y-3">
              <SectionHeading
                title="Weekly hours (SGT)"
                info="One shared schedule for every location, like Google Calendar's appointment availability."
                hint="Saved with the button below."
              />
              <AvailabilityEditor
                value={draft.availability}
                onChange={(availability) => setDraft((p) => ({ ...p, availability }))}
              />
              {availabilityError ? (
                <p role="alert" className="text-xs text-destructive">
                  {availabilityError}
                </p>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="duration">Appointment length (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={15}
                  max={240}
                  value={draft.durationMinutes}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      durationMinutes: Number(e.target.value) || 60,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Slots step by this length inside each window; a slot must end within its window.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="booking" className="space-y-4">
              <SectionHeading title="Booking" hint="Saved with the button below." />
              <div className="grid gap-1.5">
                <Label htmlFor="venue">Default venue</Label>
                <Input
                  id="venue"
                  value={draft.venue}
                  onChange={(e) => setDraft((p) => ({ ...p, venue: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Used in reminders when an event carries no location.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cust-url">Customisation booking URL</Label>
                <Input
                  id="cust-url"
                  value={draft.customisationBookingUrl}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, customisationBookingUrl: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="readj-url">Re-adjustment booking URL</Label>
                <Input
                  id="readj-url"
                  value={draft.readjustmentBookingUrl}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, readjustmentBookingUrl: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cust-match">Customisation summary match</Label>
                <Input
                  id="cust-match"
                  value={draft.customisationSummaryMatch}
                  onChange={(e) =>
                    setDraft((p) => ({
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
                  value={draft.readjustmentSummaryMatch}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      readjustmentSummaryMatch: e.target.value,
                    }))
                  }
                />
              </div>
              {serviceFees ? (
                <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                  Re-adjustment fee{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    ${serviceFees.readjustment.toFixed(2)}
                  </span>
                  {serviceFees.freeVisits > 0
                    ? `, with ${serviceFees.freeVisits} free visit${serviceFees.freeVisits === 1 ? "" : "s"} within ${serviceFees.freeWindowDays} days of purchase for Premium Mpillow`
                    : ", with no complimentary visits"}
                  .{" "}
                  <Link
                    href={withLocale("/settings/costings/services", locale)}
                    className="underline underline-offset-4"
                  >
                    Edit in Costings → Service fees
                  </Link>
                </p>
              ) : null}
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-4">
              <SectionHeading
                title="Notifications"
                info="The master switch for every automated WhatsApp message."
              />
              <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-1">
                  <Label htmlFor="wa-enabled">WhatsApp notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Booking confirmations, day-before reminders, morning-of nudges,
                    and replies to Confirm or Reschedule. Off pauses all of them.
                    Bookings, calendar events and email invites are unaffected.
                  </p>
                </div>
                <Switch
                  id="wa-enabled"
                  checked={draft.whatsappEnabled}
                  onCheckedChange={(next) =>
                    setDraft((p) => ({ ...p, whatsappEnabled: next }))
                  }
                  aria-label="WhatsApp appointment notifications"
                />
              </div>

              <SectionHeading
                title="WhatsApp slot offers"
                hint="How reschedule offers are built. Saved with the button below."
              />
              <div className="grid gap-1.5">
                <Label htmlFor="lookahead">Slot lookahead (days)</Label>
                <Input
                  id="lookahead"
                  type="number"
                  min={1}
                  max={60}
                  value={draft.slotLookaheadDays}
                  onChange={(e) =>
                    setDraft((p) => ({
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
                  value={draft.slotOfferCount}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      slotOfferCount: Number(e.target.value) || 3,
                    }))
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="calendar" className="space-y-4">
              <SectionHeading title="Calendar" hint="Saved with the button below." />
              <label
                htmlFor="show-cancelled"
                className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-2 transition-colors active:bg-press"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Show cancelled appointments</span>
                  <span className="block text-xs text-muted-foreground">
                    Struck-through on the calendar. Off keeps cancellations out of the grid.
                  </span>
                </span>
                <Switch
                  id="show-cancelled"
                  checked={draft.showCancelled}
                  onCheckedChange={(checked) =>
                    setDraft((p) => ({ ...p, showCancelled: checked }))
                  }
                />
              </label>
            </TabsContent>
          </div>
        </Tabs>

        <SheetFooter>
          <Button
            type="button"
            className="min-h-11 md:min-h-9"
            disabled={saving || !!availabilityError}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
