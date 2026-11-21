"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatAdminDateTime } from "@/lib/format/admin-date";
import type { GoogleReviewsStatus } from "@/lib/reviews/status";
import { ConnectionRow } from "./social-inbox-card";

export function GoogleReviewsCard() {
  const [status, setStatus] = useState<GoogleReviewsStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reviews/google/status")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return (await res.json()) as GoogleReviewsStatus;
      })
      .then((payload) => !cancelled && setStatus(payload))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const bp = status?.businessProfile;
  const setup = bp?.setup?.ok ? bp.setup : null;
  const setupError = bp?.setup && !bp.setup.ok ? bp.setup.error : null;
  const connected = !!setup?.reviews;
  const places = status?.places;

  return (
    <Card className="space-y-4 p-4 text-sm">
      <div className="space-y-1">
        <p className="font-medium">Google Maps reviews</p>
        <p className="text-muted-foreground">
          New Google reviews arrive in the measurements group as review cards with a reply drafted by Claude. Anyone
          allowed to <span className="font-medium text-foreground">Reply to Google reviews</span> publishes it, or
          replies to the card with their own wording first. A reply that starts with{" "}
          <code className="rounded bg-muted px-1">{"//"}</code> stays in the group as a team note.
          {status?.stored && status.stored.waiting > 0
            ? ` ${status.stored.waiting} ${status.stored.waiting === 1 ? "card is" : "cards are"} waiting for a reply now.`
            : ""}
        </p>
      </div>

      {!status && !failed ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking connections…
        </p>
      ) : failed || !bp || !places ? (
        <p className="text-destructive">Couldn&apos;t load the connection status.</p>
      ) : (
        <ul className="space-y-3">
          <ConnectionRow
            name="Business Profile API"
            connected={connected}
            detail={
              connected
                ? `Reads every review${setup?.reviews?.total != null ? ` (${setup.reviews.total} on Google` : ""}${
                    setup?.reviews?.average != null ? `, average ${setup.reviews.average.toFixed(1)}` : ""
                  }${setup?.reviews?.total != null ? ")" : ""}. Post reply publishes from Telegram.`
                : setupError
                  ? "Google refused the check (below)."
                  : setup && !setup.location
                    ? setup.locations.length
                      ? "Almost there: set GOOGLE_BUSINESS_LOCATION in Vercel to the location below, then redeploy."
                      : "No location found (below)."
                    : `Not set on this deployment: ${bp.missing.join(", ")} (OPS checklist, steps 1–4).`
            }
          />
          {connected ? (
            <ConnectionRow
              name="Real-time notifications"
              connected={!!setup?.pubsubTopic && !setup.problems.some((p) => p.startsWith("GOOGLE_REVIEWS_PUSH_TOKEN"))}
              detail={
                setup?.pubsubTopic
                  ? `Google publishes new and edited reviews to ${setup.pubsubTopic}.`
                  : "Not set up yet (below). Until then, cards come with the daily catch-up."
              }
            />
          ) : null}
          <ConnectionRow
            name="Places API (until then)"
            connected={places.active}
            detail={
              !places.configured
                ? "Set GOOGLE_MAPS_API_KEY and GOOGLE_PLACE_ID."
                : !places.active
                  ? "Standing by: the Business Profile API reads every review now."
                  : `Checks Google's five most relevant reviews once a week. ${places.callsThisMonth} of ${places.cap} reads used this month (Google gives 1,000 free a month, shared with the landing page). Reply on Google Maps, then tap Mark replied on the card.${
                      places.lastPolledAt ? ` Last checked ${formatAdminDateTime(places.lastPolledAt)}.` : ""
                    }`
            }
          />
          {setupError ? <li className="break-words text-destructive">Business Profile: {setupError}</li> : null}
          {setup?.problems.map((problem) => (
            <li key={problem} className="break-words text-destructive">
              {problem}
            </li>
          ))}
          {places.active && places.lastError ? (
            <li className="break-words text-destructive">Places API, last check: {places.lastError}</li>
          ) : null}
          {setup && !setup.location
            ? setup.locations.map((l) => (
                <li key={l.name} className="break-words text-xs text-muted-foreground">
                  {l.title ?? "Location"}:{" "}
                  <code className="rounded bg-muted px-1">GOOGLE_BUSINESS_LOCATION={l.name}</code>
                </li>
              ))
            : null}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        The Places API shows only five reviews, picked by relevance, and can&apos;t post. When Google counts a review it
        doesn&apos;t show, the group gets a note with a link to answer it on Google Maps. Places reviews are deleted
        here after 30 days, as Google&apos;s terms require.
      </p>
    </Card>
  );
}
