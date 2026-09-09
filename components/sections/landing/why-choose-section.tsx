import dynamic from "next/dynamic";
const MagicBento = dynamic(() => import("@/components/effects/MagicBento"));
import type { Messages } from "@/lib/i18n/messages/types";
import type { LandingSection, WhyChooseContent } from "@/lib/types/landing-sections";

interface WhyChooseSectionProps {
  section: LandingSection;
  messages: Messages;
}

export function WhyChooseSection({ section, messages: m }: WhyChooseSectionProps) {
  const c = section.content as WhyChooseContent;
  const rawCards = c.cards?.length ? c.cards : m.home.whyChoose.cards;
  const cards = rawCards.map((card) => ({
    key: card.key,
    label: card.label ?? "",
    title: card.title ?? "",
    description: card.description ?? "",
    color: "var(--card)",
  }));

  return (
    <section className="relative pt-10 md:pt-12">
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 md:pb-16">
        <MagicBento
          className="card-grid--asymmetric rounded-2xl bg-card/40 p-2 shadow-sm backdrop-blur-sm"
          cards={cards}
          textAutoHide={false}
          enableTilt={false}
          enableSpotlight
          enableBorderGlow
          enableStars
          enableMagnetism
          clickEffect
          particleCount={10}
          spotlightRadius={260}
        />
      </div>
    </section>
  );
}
