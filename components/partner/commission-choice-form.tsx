"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { pickPartnerCommission } from "./commission-choice-actions";

const sgd = (n: number) => `S$${n.toFixed(2)}`;

/**
 * The partner's pick of how much of the pool they take (clause 7.2), on a slider
 * from S$0 to the pool with the same amount in a field beside it. `current` is
 * what they will be on once any waiting change starts, so both open on it.
 * `customerDiscount` only words the split; the discount stays Staff's call.
 */
export function CommissionChoiceForm({
  pool,
  current,
  customerDiscount,
}: {
  pool: number;
  current: number;
  customerDiscount: boolean;
}) {
  const [value, setValue] = useState(String(current));
  const [pending, startTransition] = useTransition();

  const amount = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(amount) && amount >= 0 && amount <= pool;
  const unchanged = valid && Math.round(amount * 100) === Math.round(current * 100);
  // The slider holds still on whatever the field last made sense as.
  const sliderAt = valid ? amount : Math.min(Math.max(Number.isFinite(amount) ? amount : current, 0), pool);
  const rest = valid ? pool - amount : null;

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
      className="space-y-3 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save(amount >= pool ? null : amount);
      }}
    >
      <Label htmlFor="commission-choice">Take per sale (S$)</Label>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <Slider
            value={[sliderAt]}
            min={0}
            max={pool}
            step={1}
            disabled={pending}
            onValueChange={([v]) => setValue(String(v ?? 0))}
            thumbProps={{ "aria-label": "Take per sale", "aria-valuetext": sgd(sliderAt) }}
          />
          <div className="mt-1.5 flex justify-between text-xs tabular-nums text-muted-foreground">
            <span>S$0</span>
            <span>{sgd(pool)}</span>
          </div>
        </div>
        {/* The width sits on the wrapper: a number Input fills a container-query box,
            which takes no width from its content. */}
        <div className="w-24 shrink-0">
          <Input
            id="commission-choice"
            type="number"
            min="0"
            max={pool}
            step="1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!valid || undefined}
          />
        </div>
      </div>

      <p
        className={rest != null ? "text-sm text-muted-foreground" : "text-sm text-destructive"}
        aria-live="polite"
      >
        {rest == null
          ? `Enter an amount from S$0 to ${sgd(pool)}.`
          : `You take ${sgd(amount)} per sale. ${
              customerDiscount ? `Your customers get ${sgd(rest)} off.` : `${sgd(rest)} goes back to Mpillow.`
            }`}
      </p>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || !valid || unchanged}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
        {current < pool ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => save(null)}>
            Take the full {sgd(pool)}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
