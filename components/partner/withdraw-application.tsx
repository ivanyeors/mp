"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { withdrawApplication } from "@/app/[lang]/partner/apply/actions";

/**
 * "Withdraw application" on the under-review screen. Asks first, and says
 * plainly that withdrawing deletes the application, so joining later means
 * applying again. Success redirects to the application form.
 */
export function WithdrawApplication({ lang }: { lang: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function withdraw() {
    setError(null);
    startTransition(async () => {
      // Reached only on failure (success redirects server-side).
      const res = await withdrawApplication(lang);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Withdraw application
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Withdraw your application?</DialogTitle>
            <DialogDescription>
              We&apos;ll stop reviewing it and delete what you sent us, including your logo. To
              become a Partner later, you&apos;ll need to fill in the application and agree to the
              Partner Agreement again.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Keep my application
            </Button>
            <Button variant="destructive" disabled={pending} onClick={withdraw}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
