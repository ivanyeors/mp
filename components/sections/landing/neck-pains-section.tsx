import { CervicalNeckSupportLearnMoreCta } from "@/components/slide-in-pages/cervical-neck-support-learn-more-cta";
import { ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import Image from "next/image";
import type { Messages } from "@/lib/i18n/messages/types";
import type { LandingSection, NeckPainsContent } from "@/lib/types/landing-sections";

interface NeckPainsSectionProps {
  section: LandingSection;
  messages: Messages;
  images: Record<string, string>;
}

export function NeckPainsSection({ section, messages: m, images }: NeckPainsSectionProps) {
  const c = section.content as NeckPainsContent;
  const title = c.title ?? m.home.neckPains.title;
  const description = c.description ?? m.home.neckPains.description;
  const image = c.image ?? images.landing_cervical_neck;
  const feelTitle = c.feelTitle ?? m.home.neckPains.feelTitle;
  const feelSupported = {
    label: c.feelSupported?.label ?? m.home.neckPains.feelSupported.label,
    description: c.feelSupported?.description ?? m.home.neckPains.feelSupported.description,
  };
  const feelFit = {
    label: c.feelFit?.label ?? m.home.neckPains.feelFit.label,
    description: c.feelFit?.description ?? m.home.neckPains.feelFit.description,
  };
  const feelUpkeep = {
    label: c.feelUpkeep?.label ?? m.home.neckPains.feelUpkeep.label,
    description: c.feelUpkeep?.description ?? m.home.neckPains.feelUpkeep.description,
  };

  const feelCard = (
    <div className="rounded-2xl border bg-card/40 p-6 shadow-sm backdrop-blur-sm">
      <div className="text-sm font-semibold tracking-tight">{feelTitle}</div>
      <div className="mt-4 space-y-3 text-sm text-muted-foreground">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
          <p>
            <span className="font-medium text-foreground">{feelSupported.label}</span>{" "}
            {feelSupported.description}
          </p>
        </div>
        <div className="flex items-start gap-3">
          <SlidersHorizontal className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
          <p>
            <span className="font-medium text-foreground">{feelFit.label}</span>{" "}
            {feelFit.description}
          </p>
        </div>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
          <p>
            <span className="font-medium text-foreground">{feelUpkeep.label}</span>{" "}
            {feelUpkeep.description}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <CervicalNeckSupportLearnMoreCta className="w-full" />
      </div>
    </div>
  );

  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
          <div className="space-y-4">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
            <p className="text-muted-foreground leading-relaxed">{description}</p>
          </div>

          <div className="hidden md:block">{feelCard}</div>
        </div>

        <div className="relative mt-8 overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm md:mt-10 aspect-[4/3] md:aspect-[1048/444]">
          <Image
            src={image}
            alt={c.alt ?? "Mpillow cervical neck support"}
            fill
            className="object-cover"
            sizes="(min-width: 1280px) 1120px, (min-width: 768px) calc(100vw - 2rem), 100vw"
          />
        </div>

        {/* Mobile: feel + Learn more below image so Tech Neck path is reachable */}
        <div className="mt-6 md:hidden">{feelCard}</div>
      </div>
    </section>
  );
}
