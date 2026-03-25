import { AspectRatio } from "@/components/ui/aspect-ratio";
import { InfiniteImageMarquee } from "@/components/effects/infinite-image-marquee";
import type { LandingSection, MarqueeContent } from "@/lib/types/landing-sections";

interface MarqueeSectionProps {
  section: LandingSection;
  images: Record<string, string>;
}

export function MarqueeSection({ section, images }: MarqueeSectionProps) {
  const c = section.content as MarqueeContent;
  const image = c.image ?? images.landing_marquee;

  return (
    <section className="relative py-12 md:py-16">
      <div className="relative left-1/2 w-screen -translate-x-1/2">
        <AspectRatio ratio={1150 / 310} className="relative overflow-hidden border bg-card/40 backdrop-blur-sm">
          <InfiniteImageMarquee
            src={image}
            alt="Three-way sleep positions illustration"
            imageClassName="object-cover"
          />
        </AspectRatio>
      </div>
    </section>
  );
}
