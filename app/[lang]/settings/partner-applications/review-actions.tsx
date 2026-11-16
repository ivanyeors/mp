"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SCHEDULE_COMMISSION_POOL } from "@/lib/partner-terms";
import { approveApplication, rejectApplication } from "./actions";

/** Approve / reject buttons for one pending application. Approving first asks for
 *  the partner's terms (ADR 0034). revalidatePath in the action re-renders the
 *  queue, so the row drops off on success. */
export function ReviewActions({ id, companyName }: { id: string; companyName: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [pool, setPool] = useState(String(SCHEDULE_COMMISSION_POOL));
  const [customerDiscount, setCustomerDiscount] = useState(false);
  const [list, setList] = useState(true);

  const poolValue = Number(pool);
  const poolValid = pool.trim() !== "" && Number.isFinite(poolValue) && poolValue >= 0;

  const run = (fn: () => Promise<unknown>, ok: string, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update the application.");
      }
    });
  };

  return (
    <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
      <Button size="sm" disabled={pending} onClick={() => setOpen(true)}>
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
            "Reject this application? The applicant gets a decline email.",
          )
        }
      >
        Reject
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve {companyName}</DialogTitle>
            <DialogDescription>
              Set their commission terms. You can change them later in Partner commissions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor={`pool-${id}`}>Commission Pool per qualifying sale (S$)</Label>
              <Input
                id={`pool-${id}`}
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={pool}
                onChange={(e) => setPool(e.target.value)}
                aria-invalid={!poolValid || undefined}
              />
              <p className="text-xs text-muted-foreground">
                Paid once per order with a customised premium pillow. The Schedule sets S$
                {SCHEDULE_COMMISSION_POOL}. The partner can choose to take less in their Partner
                Hub.
              </p>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor={`discount-${id}`}>Pass what they leave to customers</Label>
                <p className="text-xs text-muted-foreground">
                  When on, the part of the pool the partner doesn&apos;t take comes off the order of
                  a customer who uses their code. When off, Mpillow keeps it.
                </p>
              </div>
              <Switch
                id={`discount-${id}`}
                checked={customerDiscount}
                onCheckedChange={setCustomerDiscount}
                className="mt-1"
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor={`list-${id}`}>List them on Our partners now</Label>
                <p className="text-xs text-muted-foreground">
                  Shows the logo, write-up and website they sent. Turn off to keep the listing
                  hidden until you show it in Partners.
                </p>
              </div>
              <Switch
                id={`list-${id}`}
                checked={list}
                onCheckedChange={setList}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !poolValid}
              onClick={() =>
                run(
                  () => approveApplication(id, { pool: poolValue, customerDiscount, list }),
                  "Application approved",
                )
              }
            >
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
