"use client";

import SpotlightCard from "@/components/effects/SpotlightCard";
import { Award, ShieldCheck, BadgeCheck } from "lucide-react";
import type { BenefitCard } from "@/lib/partners/types";

const ICONS = [Award, ShieldCheck, BadgeCheck];

type PartnersBenefitCardsProps = {
  cards: BenefitCard[];
};

export function PartnersBenefitCards({ cards }: PartnersBenefitCardsProps) {
  if (!cards.length) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {cards.map((card, idx) => {
        const Icon = ICONS[idx % ICONS.length];
        return (
          <SpotlightCard
            key={idx}
            className="min-h-[180px] rounded-2xl border bg-card/40 p-6 backdrop-blur-sm"
          >
            <Icon className="h-6 w-6 text-primary" />
            <div className="mt-3 text-xl font-semibold">{card.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{card.description}</div>
          </SpotlightCard>
        );
      })}
    </div>
  );
}
