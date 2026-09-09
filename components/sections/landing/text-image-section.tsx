import Image from "next/image";
import { AmbassadorsSlideIn } from "@/components/slide-in-pages/ambassadors-slide-in";
import { SizeMattersSlideIn } from "@/components/slide-in-pages/size-matters-slide-in";
import type { Messages } from "@/lib/i18n/messages/types";
import type { Locale } from "@/lib/i18n/locales";
import type { LandingSection, TextImageContent } from "@/lib/types/landing-sections";

interface TextImageSectionProps {
  section: LandingSection;
  messages: Messages;
  locale: Locale;
  images: Record<string, string>;
}

export function TextImageSection({ section, messages: m, images }: TextImageSectionProps) {
  const c = section.content as TextImageContent;
  const slug = section.slug;

  // Determine which built-in variant this is
  const isSizeMatters = slug === "size-matters";
  const isAmbassadors = slug === "ambassadors";

  const defaultTitle = isSizeMatters
    ? m.home.sizeMatters.title
    : isAmbassadors
      ? m.home.ambassadors.title
      : "";
  const defaultDesc = isSizeMatters
    ? m.home.sizeMatters.description
    : isAmbassadors
      ? m.home.ambassadors.description
      : "";
  const defaultImage = isSizeMatters
    ? images.landing_size_matters
    : isAmbassadors
      ? images.landing_ambassadors
      : "";

  const title = c.title ?? defaultTitle;
  const alt = c.alt ?? title;
  const description = c.description ?? defaultDesc;
  const image = c.image ?? defaultImage;

  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl md:text-4xl">
              {title}
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              {description}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {isSizeMatters && <SizeMattersSlideIn />}
              {isAmbassadors && <AmbassadorsSlideIn />}
            </div>
          </div>

          <div className="relative aspect-[3/4] md:aspect-video overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm">
            <Image
              src={image}
              alt={alt}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
