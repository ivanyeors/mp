"use client";

import { useMemo, type ReactNode } from "react";
import { BedDouble } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PillowContents, PillowXray } from "@/components/customer-pillow/pillow-drawing";
import { rowsToPillowPlacements } from "@/lib/spatial-fillings/core";
import type { OwnPillowView } from "@/lib/customer-pillow/view";

const sgDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });

function describe(pillow: OwnPillowView): ReactNode {
  if (pillow.source === "order") {
    return (
      <>
        What&apos;s inside the pillow we built
        {pillow.orderNumber ? (
          <>
            {" "}for order <span className="whitespace-nowrap">{pillow.orderNumber}</span>
          </>
        ) : null}
        {pillow.date ? ` on ${sgDate(pillow.date)}` : ""}, section by section.
      </>
    );
  }
  if (pillow.source === "fitting") {
    return `What's inside your pillow, section by section, from your in-store fitting${pillow.date ? ` on ${sgDate(pillow.date)}` : ""}.`;
  }
  if (pillow.readjusted) {
    return `What's inside your pillow, section by section, as we re-adjusted it${pillow.date ? ` on ${sgDate(pillow.date)}` : ""}.`;
  }
  return "What's inside your pillow, section by section, as our team recorded it.";
}

export function OwnPillowCard({ pillow }: { pillow: OwnPillowView }) {
  const placements = useMemo(() => rowsToPillowPlacements(pillow.placements), [pillow.placements]);
  return (
    <Card className="rounded-lg shadow-none" data-section="pillow">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BedDouble className="h-4 w-4" aria-hidden />
          Your pillow
        </CardTitle>
        <CardDescription>{describe(pillow)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {pillow.size && <Badge variant="secondary">Size {pillow.size}</Badge>}
          <span className="font-medium">{pillow.name ?? "Custom mix"}</span>
        </div>
        <PillowXray
          placements={placements}
          items={pillow.items}
          size={pillow.size}
          colorOverrides={pillow.colorOverrides}
          dimensionOverrides={pillow.dimensionOverrides}
        />
        <PillowContents label="What's inside" placements={placements} items={pillow.items} />
      </CardContent>
    </Card>
  );
}
