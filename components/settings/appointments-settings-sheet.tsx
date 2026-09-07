"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AppointmentSettings } from "@/lib/appointments/settings";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import type { Locale } from "@/lib/i18n/locales";
import type { ResolvedLocation } from "@/lib/locations";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppointmentSettings;
  onSaved: (settings: AppointmentSettings) => void;
  /** Every Location (own + partner); the sheet shows those with an address. */
  locations: ResolvedLocation[];
  /** Immediate, optimistic write — unlike the form fields, which wait for Save. */
  onToggleLocation: (id: string, bookable: boolean) => Promise<void>;
};

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="pt-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
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
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const pathname = usePathname() ?? "/";
  const locale = (getLocaleFromPathname(pathname) ?? "en-US") as Locale;

  // Only Locations with an address can be booked (the address is stamped on the event).
  const addressed = locations.filter((l) => !!l.address?.trim());
  const bookableCount = addressed.filter((l) => l.bookable).length;

  const toggle = async (loc: ResolvedLocation, bookable: boolean) => {
    setTogglingId(loc.id);
    try {
      await onToggleLocation(loc.id, bookable);
    } catch {
      /* toast + rollback handled by the caller */
    } finally {
      setTogglingId(null);
    }
  };

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/appointments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venue: draft.venue,
          durationMinutes: draft.durationMinutes,
          customisationBookingUrl: draft.customisationBookingUrl,
          readjustmentBookingUrl: draft.readjustmentBookingUrl,
          customisationSummaryMatch: draft.customisationSummaryMatch,
          readjustmentSummaryMatch: draft.readjustmentSummaryMatch,
          slotLookaheadDays: draft.slotLookaheadDays,
          slotOfferCount: draft.slotOfferCount,
          showCancelled: draft.showCancelled,
        }),
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
        onSaved(json.settings);
        toast.success("Settings saved");
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
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
            Locations, venue, booking links, and WhatsApp slot rules. Hours and blocks are
            edited on the calendar.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-1 py-2">
          <SectionHeading
            title="Bookable locations"
            hint={`${bookableCount} of ${addressed.length} taking bookings · switches apply immediately`}
          />
          {addressed.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              No locations with an address yet.{" "}
              <Link
                className="underline underline-offset-2"
                href={withLocale("/settings/partners", locale)}
              >
                Add one in Settings → Locations
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {addressed.map((loc) => {
                const busy = togglingId === loc.id;
                return (
                  <li key={loc.id}>
                    {/* Whole row is the tap target: the switch alone is 20×36px. */}
                    <label
                      htmlFor={`bookable-${loc.id}`}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2",
                        busy && "opacity-70",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
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

          <SectionHeading title="Booking" hint="Saved with the button below." />
          <div className="grid gap-1.5">
            <Label htmlFor="venue">Default venue</Label>
            <Input
              id="venue"
              value={draft.venue}
              onChange={(e) => setDraft((p) => ({ ...p, venue: e.target.value }))}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="duration">Duration (minutes)</Label>
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

          <SectionHeading title="WhatsApp slot offers" />
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

          <SectionHeading title="Calendar" />
          {/* Whole row is the tap target: the switch alone is 20×36px. */}
          <label
            htmlFor="show-cancelled"
            className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
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
        </div>

        <SheetFooter>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
