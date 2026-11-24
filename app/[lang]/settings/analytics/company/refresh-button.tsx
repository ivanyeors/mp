"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { refreshCompanyOutputs } from "./actions";

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      className="h-8 rounded-full bg-card px-3 text-xs shadow-sm"
      onClick={() =>
        start(async () => {
          try {
            await refreshCompanyOutputs();
            router.refresh();
          } catch {
            toast.error("Could not refresh. Reload the page to try again.");
          }
        })
      }
    >
      <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} aria-hidden="true" />
      {pending ? "Reading Drive…" : "Refresh"}
    </Button>
  );
}
