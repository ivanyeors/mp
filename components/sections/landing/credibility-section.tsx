import SpotlightCard from "@/components/effects/SpotlightCard";
import { Award, ShieldCheck, BadgeCheck } from "lucide-react";
import type { Messages } from "@/lib/i18n/messages/types";
import type { LandingSection, CredibilityContent } from "@/lib/types/landing-sections";

const ICONS = [Award, ShieldCheck, BadgeCheck];

interface CredibilitySectionProps {
  section: LandingSection;
  messages: Messages;
}

export function CredibilitySection({ section, messages: m }: CredibilitySectionProps) {
  const c = section.content as CredibilityContent;
  const cards = c.cards?.length ? c.cards : m.home.credibility.cards;

  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {cards.map((card, idx) => {
            const Icon = ICONS[idx % ICONS.length];
            return (
              <SpotlightCard key={idx} className="min-h-[207px] rounded-2xl border bg-card/40 p-6 backdrop-blur-sm">
                <Icon className="h-6 w-6 text-primary" />
                <div className="mt-3 text-2xl font-semibold">{card.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{card.description}</div>
              </SpotlightCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
