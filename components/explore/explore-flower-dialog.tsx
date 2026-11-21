"use client";

import { Flower2 } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPoints } from "@/lib/points/value";

export type FlowerPopup = { kind: "won"; points: number; balance: number } | { kind: "sign_up"; flower: number };

function FlowerBadge() {
  return (
    <span
      aria-hidden="true"
      className="mx-auto flex size-16 items-center justify-center rounded-full bg-[#ffe3ee] text-[#d6457c] motion-safe:animate-[explore-pop_520ms_cubic-bezier(0.34,1.56,0.64,1)_both] dark:bg-[#4a1f31] dark:text-[#ff9cc2]"
    >
      <Flower2 className="size-8" strokeWidth={1.75} />
    </span>
  );
}

export function ExploreFlowerDialog({
  popup,
  onOpenChange,
  signUpPath,
  canClaim,
  onClaim,
}: {
  popup: FlowerPopup | null;
  onOpenChange: (open: boolean) => void;
  signUpPath: (flower: number) => string;
  canClaim: boolean;
  onClaim: () => void;
}) {
  return (
    <Dialog open={popup !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        data-typography-scope="app"
        {...(popup?.kind === "sign_up" ? { "aria-describedby": undefined } : {})}
      >
        <style>{`@keyframes explore-pop{0%{opacity:0;transform:scale(.4) rotate(-25deg)}100%{opacity:1;transform:scale(1) rotate(0)}}`}</style>
        {popup?.kind === "won" ? (
          <div className="space-y-5 text-center">
            <FlowerBadge />
            <DialogHeader className="items-center text-center sm:text-center">
              <DialogDescription className="text-sm font-medium uppercase tracking-[0.16em]">Surprise!</DialogDescription>
              <DialogTitle className="text-4xl font-semibold tracking-tight tabular-nums">
                +{popup.points} {popup.points === 1 ? "point" : "points"}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              That flower was hiding points, and they are in your account. You now have {formatPoints(popup.balance)}.
            </p>
            <div className="flex flex-col gap-2">
              {canClaim ? (
                <Button size="lg" onClick={onClaim}>
                  Claim my welcome points too
                </Button>
              ) : null}
              <Button size="lg" variant={canClaim ? "outline" : "default"} onClick={() => onOpenChange(false)}>
                Back to the view
              </Button>
            </div>
          </div>
        ) : popup?.kind === "sign_up" ? (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle className="text-2xl font-semibold tracking-tight">Sign in or create your account</DialogTitle>
            </DialogHeader>
            <LoginForm audience="customer" nextPath={signUpPath(popup.flower)} submitLabel="Email me a sign-in code" />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
