"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type {
  BolsterPlacementRow,
  PillowPlacementRow,
} from "@/lib/spatial-fillings/core";

export type SaveScope = { size?: string; length?: string };

/**
 * Publishes the staff-edited session mix back to the Filling Template catalog.
 *
 * Two paths, both visible at once so neither hides behind a mode toggle:
 * overwrite the template the mix was loaded from, or fork it under a new name.
 * Overwriting is confirm-gated — it rewrites a curated catalog entry that every
 * future session loads from, which the configurator's own undo cannot reach.
 *
 * On success the caller re-links the session to the saved template, so the
 * toolbox status flips from "Edited" back to "Matches template" and the hold
 * snapshot claims the right id.
 */
export function SaveFillingTemplate({
  scope,
  placements,
  overwrite,
  onSaved,
}: {
  scope: SaveScope;
  placements: PillowPlacementRow[] | BolsterPlacementRow[];
  /** The loaded template, when there is one to replace in place. */
  overwrite: { id: number; name: string } | null;
  /** Fired with the saved template's id so the session can re-link to it. */
  onSaved: (templateId: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/mp-config/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scope, placements, ...body }),
      });
      const data = (await res.json()) as { templateId?: number; name?: string; error?: unknown };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Save failed");
      }
      toast.success(`Saved “${data.name}”`);
      setOpen(false);
      setConfirming(false);
      setName("");
      if (typeof data.templateId === "number") onSaved(data.templateId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setBusy(false);
    }
  };

  const trimmed = name.trim();

  return (
    <>
      <Popover open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="secondary" className="h-auto shrink-0 self-center gap-1.5 rounded-xl">
            <Save className="size-3.5" aria-hidden />
            Save
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-72 space-y-3">
          <p className="text-sm font-medium">Save this mix</p>

          {overwrite ? (
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              <span className="truncate">Update “{overwrite.name}”</span>
            </Button>
          ) : null}

          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" aria-hidden />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {overwrite ? "or save as new" : "save as new"}
            </span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (trimmed) void save({ mode: "new", name: trimmed });
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name"
              aria-label="New template name"
              maxLength={120}
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !trimmed}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Save"}
            </Button>
          </form>
        </PopoverContent>
      </Popover>

      <Dialog open={confirming} onOpenChange={(o) => !busy && setConfirming(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update “{overwrite?.name}”?</DialogTitle>
            <DialogDescription>
              This replaces the template&apos;s saved fillings with the mix on screen. Every
              future session that loads it — and the Admin Panel catalog — gets this mix
              instead. Existing Results keep the mix they were built with.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                overwrite && void save({ mode: "overwrite", templateId: overwrite.id })
              }
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Update template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
