"use client";

import { History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { draftTimeLabel } from "@/lib/editor-drafts";
import { cn } from "@/lib/utils";

export function DraftNotice({
  kind,
  savedAt,
  onDiscard,
  onRestore,
  what = "edit",
  className,
}: {
  kind: "restored" | "offered" | "waiting";
  savedAt: number;
  onDiscard: () => void;
  onRestore?: () => void;
  what?: string;
  className?: string;
}) {
  const at = draftTimeLabel(savedAt);
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-sky-300/60 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-100",
        className,
      )}
      data-editor-draft={kind}
    >
      <History className="h-4 w-4 shrink-0 self-start max-sm:mt-0.5 sm:self-center" aria-hidden />
      <p className="min-w-0 flex-1 basis-56">
        {kind === "restored"
          ? `Picked up your unsaved ${what} from ${at}. It stays on this device until you save.`
          : kind === "waiting"
            ? `Unsaved ${what} from ${at}, kept on this device.`
            : `Your unsaved ${what} from ${at} was made before this was last saved, so it was not put back.`}
      </p>
      <div className="flex shrink-0 gap-2 max-sm:w-full max-sm:pl-7">
        {kind !== "restored" && onRestore && (
          <Button size="sm" variant="secondary" onClick={onRestore}>
            {kind === "waiting" ? "Resume" : "Restore it"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}

export function DraftSavedHint({ savedAt, className }: { savedAt: number | null; className?: string }) {
  if (savedAt === null) return null;
  return (
    <span className={cn("text-xs text-muted-foreground", className)} aria-live="polite" data-editor-draft-saved>
      Unsaved, kept on this device · {draftTimeLabel(savedAt)}
    </span>
  );
}
