"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveApplication, rejectApplication } from "./actions";

/** Approve / reject buttons for one pending application. revalidatePath in the
 *  action re-renders the queue, so the row drops off on success. */
export function ReviewActions({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<unknown>, ok: string, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed");
      }
    });
  };

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => run(() => approveApplication(id), "Application approved")}
      >
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(
            () => rejectApplication(id),
            "Application rejected",
            "Reject this application? The applicant will be emailed a decline.",
          )
        }
      >
        Reject
      </Button>
    </div>
  );
}
