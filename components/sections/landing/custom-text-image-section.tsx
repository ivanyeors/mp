import type { LandingSection, CustomTextImageContent } from "@/lib/types/landing-sections";

interface CustomTextImageSectionProps {
  section: LandingSection;
}

export function CustomTextImageSection({ section }: CustomTextImageSectionProps) {
  const c = section.content as CustomTextImageContent;
  const title = c.title ?? "Untitled Section";
  const description = c.description ?? "";
  const image = c.image ?? "";
  const flip = c.flip ?? false;

  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <div className={`grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center ${flip ? "direction-rtl" : ""}`}>
          <div className={`space-y-4 ${flip ? "md:order-2" : ""}`}>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
            {description && (
              <p className="text-muted-foreground leading-relaxed">{description}</p>
            )}
          </div>

          <div className={`relative aspect-[3/4] md:aspect-video overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm ${flip ? "md:order-1" : ""}`}>
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt={title}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
