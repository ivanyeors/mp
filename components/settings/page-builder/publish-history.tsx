"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { History, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { describeSnapshotDiff, type PendingSummary, type SnapshotDiff } from "@/lib/page-builder/draft";

interface SnapshotRow {
  id: string;
  published_at: string;
  published_by: string | null;
  sectionCount: number;
  diff: SnapshotDiff;
}

/**
 * **Publish snapshot** history and restore.
 *
 * Restore stages the snapshot as the current **Section draft** rather than writing
 * published state, so a recovery is reviewed in Preview mode and ships through the same
 * Publish path as any other edit — which matters because a snapshot can reference a
 * Media Asset that has since been deleted.
 */
export function PublishHistory({
  pending,
  onRestored,
  open: openProp,
  onOpenChange,
  triggerClassName,
  endpoint = "/api/landing-sections/history",
}: {
  pending: PendingSummary;
  onRestored: () => void;
  /** List (GET) and restore (POST) for this page. Defaults to the landing page. */
  endpoint?: string;
  /** Controlled open state, for opening the history from elsewhere (the phone ⋯ menu). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const [rows, setRows] = useState<SnapshotRow[] | null>(null);
  const [confirming, setConfirming] = useState<SnapshotRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Failed to load history");
      const body = await res.json();
      setRows(body.snapshots ?? []);
    } catch {
      toast.error("Couldn't load the publish history.");
      setRows([]);
    }
  }, [endpoint]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const restore = async (snapshot: SnapshotRow) => {
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snapshot.id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Couldn't restore this version.");
      toast.success("Restored as a draft. Review it, then publish.");
      setConfirming(null);
      setOpen(false);
      onRestored();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't restore this version.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className={triggerClassName}>
            <History className="mr-1.5 h-3.5 w-3.5" />
            History
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Publish history</SheetTitle>
            <SheetDescription>
              Restoring brings a version back as a draft. Nothing goes live until you publish it.
            </SheetDescription>
          </SheetHeader>

          {/* Phones: room under the last version for the sheet's pinned close button. */}
          <div className="space-y-2 px-4 pb-6 max-md:pb-20">
            {rows === null && (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            )}
            {rows?.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing published yet. The first publish starts the history.
              </p>
            )}
            {rows?.map((row, index) => (
              <div key={row.id} className="rounded-lg border p-3" data-snapshot-row="">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {new Date(row.published_at).toLocaleString()}
                  </span>
                  {index === 0 && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Latest
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.published_by ?? "Unknown"}, {row.sectionCount} sections
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {describeSnapshotDiff(row.diff)}
                </p>
                {row.diff.missing.length > 0 && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                    {row.diff.missing.length} section
                    {row.diff.missing.length === 1 ? "" : "s"} in this version no longer exist and
                    can&apos;t be brought back.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setConfirming(row)}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={confirming != null} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this version?</DialogTitle>
            <DialogDescription>
              {pending.total > 0
                ? `This replaces your current draft, discarding ${pending.total} pending change${
                    pending.total === 1 ? "" : "s"
                  }. The live site doesn't change until you publish.`
                : "It comes back as a draft, so the live site doesn't change until you publish."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirming(null)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => confirming && restore(confirming)} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Restore as draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
