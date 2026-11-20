import Image from "next/image";
import type { LandingSection, CustomFullWidthImageContent } from "@/lib/types/landing-sections";

interface CustomFullWidthImageSectionProps {
  section: LandingSection;
}

export function CustomFullWidthImageSection({ section }: CustomFullWidthImageSectionProps) {
  const c = section.content as CustomFullWidthImageContent;
  const image = c.image;
  if (!image) return null;

  return (
    <section className="relative py-12 md:py-16">
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="relative overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm">
          <Image
            src={image}
            alt={c.alt ?? ""}
            width={1152}
            height={648}
            className="h-auto w-full object-cover"
            sizes="(max-width: 1152px) 100vw, 1152px"
          />
        </div>
      </div>
    </section>
  );
}
