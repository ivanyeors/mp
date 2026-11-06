"use client";

import { useState } from "react";
import { Loader2, Undo2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { describePending, type PendingSummary } from "@/lib/page-builder/draft";

export const EMPTY_PENDING: PendingSummary = {
  total: 0,
  content: 0,
  position: 0,
  visibility: 0,
  removal: 0,
  slugs: [],
};

/**
 * Draft state and the one action that reaches shoppers.
 *
 * Every edit lands in a Section draft; nothing is live until Publish. Discard is the
 * mirror — it clears pending edits and leaves published content untouched.
 */
export function PublishBar({
  pending,
  onPublished,
  onDiscarded,
  endpoint = "/api/landing-sections/publish",
  liveLabel = "the live site",
}: {
  pending: PendingSummary;
  onPublished: () => void;
  onDiscarded: () => void;
  /** Publish (POST) and Discard (DELETE) for this page. Defaults to the landing page. */
  endpoint?: string;
  /** What Publish ships to, for the confirm dialog, e.g. "the live Basic Mpillow sheet". */
  liveLabel?: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = pending.total > 0;

  const run = async (method: "POST" | "DELETE") => {
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Something went wrong.");
      if (method === "POST") {
        toast.success(`Published to ${liveLabel}`);
        onPublished();
      } else {
        toast.success("Draft discarded");
        onDiscarded();
      }
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const parts = [
    pending.content > 0 ? `${pending.content} edited` : null,
    pending.position > 0 ? `${pending.position} moved` : null,
    pending.visibility > 0 ? `${pending.visibility} shown/hidden` : null,
    pending.removal > 0 ? `${pending.removal} removed` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-2 max-md:w-full">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium max-md:mr-auto ${
          dirty ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground"
        }`}
        data-page-builder-draft-state=""
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dirty ? "bg-amber-500" : "bg-muted-foreground/50"}`} />
        {describePending(pending)}
      </span>

      <Button
        variant="ghost"
        size="sm"
        disabled={!dirty || busy}
        onClick={() => run("DELETE")}
      >
        <Undo2 className="mr-1.5 h-3.5 w-3.5" />
        Discard
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger asChild>
          <Button size="sm" disabled={!dirty || busy}>
            <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
            Publish
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish to {liveLabel}?</DialogTitle>
            <DialogDescription>
              {parts.length > 0
                ? `${parts.join(", ")}. This is what shoppers will see.`
                : "This is what shoppers will see."}
            </DialogDescription>
          </DialogHeader>
          {pending.slugs.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
              {pending.slugs.map((slug) => (
                <li key={slug} className="text-muted-foreground">
                  {slug}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => run("POST")} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Publish
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
