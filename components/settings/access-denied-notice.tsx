"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { deniedPageLabel } from "@/lib/auth/permissions";

export function AccessDeniedNotice() {
  const params = useSearchParams();
  const label = deniedPageLabel(params?.get("denied"));
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!label || dismissed === label) return null;

  const dismiss = () => {
    setDismissed(label);
    const url = new URL(window.location.href);
    url.searchParams.delete("denied");
    window.history.replaceState(null, "", url);
  };

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="flex-1">
        You don&apos;t have access to {label}. Ask an Owner or Admin to add it to your role.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="-m-1 rounded p-1 opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
