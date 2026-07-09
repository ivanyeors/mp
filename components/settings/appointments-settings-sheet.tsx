"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AppointmentSettings } from "@/lib/appointments/settings";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppointmentSettings;
  onSaved: (settings: AppointmentSettings) => void;
};

export function AppointmentsSettingsSheet({
  open,
  onOpenChange,
  settings,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);

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
            Venue, booking links, and WhatsApp slot rules. Availability is edited on the
            calendar.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-1 py-2">
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
