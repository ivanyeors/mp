"use client";

import { FittingHistory } from "@/components/fittings/fitting-history";
import type { FittingAnswersView } from "@/lib/fitting-import/view";

const sgDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });

export function OwnFittingsCard({ fittings }: { fittings: FittingAnswersView[] }) {
  return (
    <FittingHistory
      fittings={fittings}
      formatDate={sgDate}
      className="rounded-lg shadow-none"
      description={
        fittings.length === 1
          ? "What we recorded at your in-store fitting. Measurements are in inches."
          : `What we recorded at each of your ${fittings.length} in-store fittings, newest first. Measurements are in inches; where one changed, you can see what it was the visit before.`
      }
    />
  );
}
