"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pickPartnerCommission } from "./commission-choice-actions";

/**
 * The partner's pick of how much of the pool they take (clause 7.2). `current` is
 * what they will be on once any waiting change starts, so the field opens on it.
 */
export function CommissionChoiceForm({ pool, current }: { pool: number; current: number }) {
  const [value, setValue] = useState(String(current));
  const [pending, startTransition] = useTransition();

  const amount = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(amount) && amount >= 0 && amount <= pool;
  const unchanged = valid && Math.round(amount * 100) === Math.round(current * 100);

  const save = (picked: number | null) =>
    startTransition(async () => {
      const res = await pickPartnerCommission(picked);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.startsOn ? "Saved. It starts the day after the next Payout Date." : "Saved.");
      if (picked == null) setValue(String(pool));
    });

  return (
    <form
      className="flex flex-wrap items-end gap-3 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save(amount >= pool ? null : amount);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="commission-choice">Take per sale (S$)</Label>
        <Input
          id="commission-choice"
          type="number"
          inputMode="decimal"
          min="0"
          max={pool}
          step="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!valid || undefined}
          className="w-32"
        />
      </div>
      <Button type="submit" disabled={pending || !valid || unchanged}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save
      </Button>
      {current < pool ? (
        <Button type="button" variant="outline" disabled={pending} onClick={() => save(null)}>
          Take the full S${pool.toFixed(2)}
        </Button>
      ) : null}
      {!valid ? (
        <p className="w-full text-sm text-destructive">Enter an amount from S$0 to S${pool.toFixed(2)}.</p>
      ) : null}
    </form>
  );
}
