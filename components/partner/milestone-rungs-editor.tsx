import { supabaseAdmin } from "@/lib/supabase/server";
import { upsertMilestoneRung } from "./milestone-rungs-actions";

/**
 * Admin editor for the milestone rung ladder (#79). Self-contained async server
 * component — reads the rungs and renders a table + a plain server-action form (no
 * client JS). Mounted on the Partner Commissions settings page (which already gates
 * with requireAdminPage('page-builder')); the action re-asserts assertAdmin. Values
 * here feed both the hub progress bar and the per-unit rate bump (AC5).
 */
type RungRow = {
  tier: number;
  units_threshold: number;
  cash_bonus: number | string;
  rate_bump: number | string;
  perk_label: string | null;
};

export async function MilestoneRungsEditor() {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("milestone_rungs")
    .select("tier, units_threshold, cash_bonus, rate_bump, perk_label")
    .order("tier", { ascending: true });
  const rungs = (data ?? []) as RungRow[];

  return (
    <div className="mt-12">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Milestone rungs</h2>
        <p className="text-sm text-muted-foreground">
          The gamified ladder partners climb by referred pillow &amp; bolster units (a 2-unit
          launch head start is added on top). Each rung grants a one-time cash bonus, a permanent
          rate bump (percentage points added to the partner&apos;s commission scheme), and a perk.
          Tiers never demote.
        </p>
      </div>

      <div className="mt-4 min-w-0 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Tier</th>
              <th className="px-4 py-2 font-medium">Units</th>
              <th className="px-4 py-2 font-medium">Cash bonus</th>
              <th className="px-4 py-2 font-medium">Rate bump</th>
              <th className="px-4 py-2 font-medium">Perk</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rungs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No rungs yet.
                </td>
              </tr>
            ) : (
              rungs.map((r) => (
                <tr key={r.tier} className="align-top">
                  <td className="px-4 py-3 font-medium">{r.tier}</td>
                  <td className="px-4 py-3">{Number(r.units_threshold)}</td>
                  <td className="px-4 py-3">${Number(r.cash_bonus).toFixed(2)}</td>
                  <td className="px-4 py-3">+{Number(r.rate_bump)}%</td>
                  <td className="px-4 py-3">{r.perk_label || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Upsert form — plain server action, no client JS. Existing tier updates in place. */}
      <form
        action={upsertMilestoneRung}
        className="mt-6 grid max-w-xl grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2"
      >
        <h3 className="sm:col-span-2 text-sm font-medium">Add / update a rung</h3>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Tier</span>
          <input type="number" name="tier" min="1" step="1" defaultValue="1" required
            className="h-9 rounded-md border bg-background px-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Units threshold</span>
          <input type="number" name="units_threshold" min="0" step="1" defaultValue="5" required
            className="h-9 rounded-md border bg-background px-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Cash bonus ($)</span>
          <input type="number" name="cash_bonus" min="0" step="0.01" defaultValue="25" required
            className="h-9 rounded-md border bg-background px-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Rate bump (percentage points)</span>
          <input type="number" name="rate_bump" min="0" step="0.01" defaultValue="1" required
            className="h-9 rounded-md border bg-background px-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Perk label</span>
          <input type="text" name="perk_label" defaultValue=""
            className="h-9 rounded-md border bg-background px-2" />
        </label>

        <div className="sm:col-span-2">
          <button type="submit"
            className="h-9 rounded-md border bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Save rung
          </button>
        </div>
      </form>
    </div>
  );
}
