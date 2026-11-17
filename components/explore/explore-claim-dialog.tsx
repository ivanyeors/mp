"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ExploreGiftKind, ExploreViewer } from "@/lib/explore/viewer";
import { POINTS_KIND_LABEL } from "@/lib/points/kinds";
import { formatDollars, pointsToDollars } from "@/lib/points/value";
import { stepEndLabel, stepStartLabel, welcomeLeftShare, type WelcomeGrantReason, type WelcomeOffer } from "@/lib/points/welcome";

/**
 * The Explore page's popup: the points flow (ADR 0030, amendment of
 * 2026-11-17). What it asks, then what the visitor holds.
 *
 * Before the claim it shows points only, never what they are worth (owner,
 * 2026-11-16); the value appears with the balance once they have claimed. The
 * count of bonuses left is the database's count, on a bar that only goes
 * down. Pressing Claim is the consent to our emails, said in the line under
 * the button at a size people can read; there is no box.
 */

export type ClaimStage = "offer" | "working" | "done" | "error";

const number = (n: number) => n.toLocaleString("en-SG");

const GIFT_LABEL: Record<ExploreGiftKind, string> = {
  welcome_bonus: POINTS_KIND_LABEL.welcome_bonus,
  claim_bonus: POINTS_KIND_LABEL.claim_bonus,
  past_purchases: POINTS_KIND_LABEL.past_purchases,
  explore_flower: "Flowers picked",
};

/** What the popup says above the balance, by how the claim ended. */
const DONE_LINE: Record<WelcomeGrantReason | "balance", string> = {
  granted: "Your welcome bonus is in.",
  migrated: "Welcome back. Your points came with you.",
  already: "You have already claimed your welcome bonus.",
  ended: "The welcome bonus has all been claimed. You still earn points on every order.",
  partner: "Partner accounts earn through the Partner Hub, so points are not added here.",
  off: "You are signed in. Points open soon.",
  balance: "Here is what you have.",
};

/** The bonuses left at the open step: a bar that only ever empties. */
export function LeftMeter({ offer, className }: { offer: WelcomeOffer; className?: string }) {
  if (!offer.current) return null;
  const share = welcomeLeftShare(offer);
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium tabular-nums">
          {number(offer.left)} of {number(offer.current.allocation)} left
        </span>
        <span className="text-muted-foreground">at {number(offer.current.points)} points</span>
      </div>
      <div
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label="Welcome bonuses left at this step"
        aria-valuemin={0}
        aria-valuemax={offer.current.allocation}
        aria-valuenow={offer.left}
      >
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${Math.max(share * 100, offer.left > 0 ? 1.5 : 0)}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {offer.next
          ? `Then ${number(offer.next.points)} points, from ${stepStartLabel(offer.current.until)} or as soon as these run out.`
          : `Until ${stepEndLabel(offer.current.until)}, or until these run out.`}
      </p>
    </div>
  );
}

/**
 * The balance, counted up once when it appears. Mounted only when there is a
 * balance to show, so it starts from nothing each time the popup reaches it.
 */
function PointsCount({ points }: { points: number }) {
  const [progress, setProgress] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 0,
  );
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      setProgress(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [points]);
  return (
    <>
      {number(Math.round(points * progress))} {points === 1 ? "point" : "points"}
    </>
  );
}

function ConsentLine({ privacyHref }: { privacyHref: string }) {
  return (
    <p className="text-[13px] leading-snug text-muted-foreground">
      By claiming, you agree to get emails from Mpillow with important updates, event invites and offers. No spam, and
      you can unsubscribe anytime.{" "}
      <Link href={privacyHref} className="underline underline-offset-2">
        Privacy policy
      </Link>
    </p>
  );
}

export function ExploreClaimDialog({
  open,
  onOpenChange,
  stage,
  offer,
  signedIn,
  viewer,
  doneReason,
  rules,
  claimPath,
  links,
  onClaim,
  onEmailMeAgain,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: ClaimStage;
  offer: WelcomeOffer | null;
  signedIn: boolean;
  viewer: ExploreViewer | null;
  /** How the claim ended, or "balance" when the popup only shows what they hold. */
  doneReason: WelcomeGrantReason | "balance";
  rules: { minRedeem: number; maxShare: number };
  /** Where a sign-in comes back to, to finish the claim. */
  claimPath: string;
  links: { home: string; points: string; privacy: string };
  onClaim: () => void;
  onEmailMeAgain: () => Promise<void>;
}) {
  const balance = viewer?.points ?? 0;
  const [resubscribing, setResubscribing] = useState(false);
  const open_ = offer?.current ?? null;
  const share = Math.round(rules.maxShare * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-typography-scope="app">
        {stage === "working" ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <DialogTitle className="sr-only">Adding your points</DialogTitle>
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground" role="status">
              Adding your points…
            </p>
          </div>
        ) : stage === "error" ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>That did not go through</DialogTitle>
              <DialogDescription>Your account is fine. Try the claim again.</DialogDescription>
            </DialogHeader>
            <Button className="w-full" onClick={onClaim}>
              Try again
            </Button>
          </div>
        ) : stage === "done" ? (
          <div className="space-y-5">
            <DialogHeader>
              <DialogDescription>{DONE_LINE[doneReason]}</DialogDescription>
              <DialogTitle className="text-3xl font-semibold tracking-tight tabular-nums" aria-label={`${number(balance)} ${balance === 1 ? "point" : "points"}`}>
                <PointsCount points={balance} />
              </DialogTitle>
            </DialogHeader>
            {balance > 0 ? (
              <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                Worth {formatDollars(pointsToDollars(balance))} off a shop order
              </p>
            ) : null}
            {viewer && viewer.gifts.length > 0 ? (
              <ul className="divide-y rounded-lg border text-sm">
                {viewer.gifts.map((g) => (
                  <li key={g.kind} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span>{GIFT_LABEL[g.kind]}</span>
                    <span className="font-medium tabular-nums">+{number(g.points)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Points never expire. From {number(rules.minRedeem)} points, use them for up to {share}% of the products in
              a shop order.{" "}
              <Link href={links.points} className="underline underline-offset-2">
                How points work
              </Link>
            </p>
            {viewer?.marketing === "unsubscribed" ? (
              <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                You unsubscribed from our emails before, so we have not added you back.{" "}
                <button
                  type="button"
                  className="font-medium text-foreground underline underline-offset-2 disabled:opacity-50"
                  disabled={resubscribing}
                  onClick={async () => {
                    setResubscribing(true);
                    await onEmailMeAgain();
                    setResubscribing(false);
                  }}
                >
                  Email me again
                </button>
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1">
                <Link href={links.home}>Explore the new site</Link>
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Back to the view
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                {open_ ? `Claim ${number(open_.points)} welcome points` : "Sign in or create your account"}
              </DialogTitle>
              <DialogDescription>
                {open_
                  ? signedIn
                    ? "One press and they are yours."
                    : "Sign in or create your account and they are yours. Shopped with us before? Use the same email and your points for past orders come too."
                  : "One step, no password. Shopped with us before? Use the same email to pick up your orders and points."}
              </DialogDescription>
            </DialogHeader>
            {offer && open_ ? <LeftMeter offer={offer} /> : null}
            {signedIn ? (
              <div className="space-y-3">
                <Button className="w-full" size="lg" onClick={onClaim}>
                  Claim my points
                </Button>
                <ConsentLine privacyHref={links.privacy} />
              </div>
            ) : open_ ? (
              <div className="space-y-3">
                <LoginForm
                  audience="customer"
                  nextPath={claimPath}
                  consent="explore_claim"
                  submitLabel="Email me a sign-in code"
                />
                <ConsentLine privacyHref={links.privacy} />
              </div>
            ) : (
              <LoginForm audience="customer" nextPath={claimPath} submitLabel="Email me a sign-in code" />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
