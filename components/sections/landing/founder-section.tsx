import Image from "next/image";
import type { Messages } from "@/lib/i18n/messages/types";
import type { LandingSection, FounderNoteContent } from "@/lib/types/landing-sections";

interface FounderSectionProps {
  section: LandingSection;
  messages: Messages;
  images: Record<string, string>;
}

export function FounderSection({ section, messages: m, images }: FounderSectionProps) {
  const c = section.content as FounderNoteContent;
  const title = c.title ?? m.home.founder.title;
  const subtitle = c.subtitle ?? m.home.founder.subtitle;
  const paragraphs = c.paragraphs?.length ? c.paragraphs : m.home.founder.paragraphs;
  const name = c.name ?? m.home.founder.name;
  const role = c.role ?? m.home.founder.role;
  const image = c.image ?? images.landing_founder;

  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <div className="rounded-2xl border bg-card/40 p-8 backdrop-blur-sm">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
            <div className="min-w-0">
              <div className="mb-8">
                <h2 className="mb-3 text-3xl font-bold tracking-tight">{title}</h2>
                <p className="text-muted-foreground">{subtitle}</p>
              </div>

              <div className="space-y-6">
                {paragraphs.map((text, idx) => (
                  <p key={idx} className="text-muted-foreground leading-relaxed">
                    {text}
                  </p>
                ))}

                <div className="pt-2">
                  <p className="font-semibold">{name}</p>
                  <p className="text-sm text-muted-foreground">{role}</p>
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border bg-muted">
                <Image
                  src={image}
                  alt={name}
                  fill
                  className="object-cover object-top"
                  sizes="(min-width: 768px) 50vw, 100vw"
                  priority={false}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
