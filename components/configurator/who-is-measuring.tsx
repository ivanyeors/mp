"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WORKING_AS_CHANGED_EVENT } from "@/components/settings/working-as-picker";
import { cn } from "@/lib/utils";

export type MeasurerProfile = { id: string; name: string };

/**
 * "Who's measuring?" on the configurator's start screen, for a Staff session on
 * a shared login where nobody at this device has chosen under "Working as".
 * A Staff login is always Staff here: the choice is saved as this device's
 * "Working as", so the Draft Result is stamped measured by that profile and
 * charges its Measurement service (ADR 0024), the same as on a personal login.
 * Attribution only — it changes nothing the login can do.
 */
export function WhoIsMeasuring({
  profiles,
  chosen,
  onChosen,
}: {
  profiles: MeasurerProfile[];
  chosen: string | null;
  onChosen: (id: string) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const chosenName = profiles.find((p) => p.id === chosen)?.name ?? null;

  async function choose(id: string) {
    if (saving || id === chosen) return;
    setSaving(id);
    try {
      const res = await fetch("/api/admin/working-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't save who's measuring.");
      window.dispatchEvent(new Event(WORKING_AS_CHANGED_EVENT));
      onChosen(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save who's measuring.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div role="group" aria-labelledby="who-is-measuring" className="w-full max-w-md space-y-3">
      <p id="who-is-measuring" className="text-sm font-medium">
        Who&apos;s measuring?
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {profiles.map((p) => {
          const on = p.id === chosen;
          return (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              aria-pressed={on}
              disabled={saving != null}
              onClick={() => void choose(p.id)}
              className={cn("min-w-20", !on && "bg-background/70")}
            >
              {on ? <Check className="mr-1 h-3.5 w-3.5" /> : null}
              {p.name}
            </Button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {chosenName
          ? `${chosenName} is measuring on this device. The price includes the Measurement service.`
          : "Pick your name to start. This device remembers it."}
      </p>
    </div>
  );
}
