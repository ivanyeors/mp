import { CircleAlert, PlugZap } from "lucide-react";
import type { Outputs } from "@/lib/company/load";
import type { CopyState } from "@/lib/company/overview";
import { cn } from "@/lib/utils";
import { PANEL } from "./bits";

export function HarnessCopy({ copies, outputs }: { copies: CopyState[]; outputs: Outputs }) {
  const off = copies.filter((c) => c.state !== "same");
  if (outputs.state !== "ok" || off.length === 0) return null;
  const none = off.length === copies.length && off.every((c) => c.state === "missing");
  return (
    <section aria-labelledby="harness-title" className={cn(PANEL, "flex gap-3 border-amber-300/70 p-4 dark:border-amber-900")}>
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <h2 id="harness-title" className="text-sm font-semibold">
          {none ? "The agents' instructions are not in Drive yet" : `${off.length} of ${copies.length} instruction files in Drive differ from the code`}
        </h2>
        <p className="text-xs text-muted-foreground">
          Each agent reads its instructions from Drive, folder Agents / _company, copied from <span className="font-mono text-foreground">company/</span> in the code. Agents follow the Drive copy until it is updated: ask Claude to run the company-sync skill.
        </p>
        {!none ? (
          <ul className="grid max-h-40 gap-x-6 gap-y-0.5 overflow-y-auto font-mono text-xs sm:grid-cols-2">
            {off.map((c) => (
              <li key={c.path} className="flex justify-between gap-3">
                <span className="truncate">{c.path}</span>
                <span className={c.state === "missing" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}>{c.state === "missing" ? "not in Drive" : "out of date"}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export function SetupNotice({ outputs }: { outputs: Exclude<Outputs, { state: "ok" }> }) {
  return (
    <div role="status" className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <PlugZap className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        {outputs.state === "unconfigured" ? (
          <>
            <p className="font-medium">Reports need the Google Drive connection.</p>
            <p>The org chart comes from the code. Reports, decisions and alerts appear once GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN are set for the Google account that owns the Agents folder.</p>
          </>
        ) : (
          <>
            <p className="font-medium">Google Drive could not be read, so reports are missing.</p>
            <p>Google said: {outputs.message}</p>
            <p>The Google account behind GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN must be able to open the Agents folder. Press Refresh to try again.</p>
          </>
        )}
      </div>
    </div>
  );
}
