import Link from "next/link";
import Image from "next/image";
import type { Messages } from "@/lib/i18n/messages/types";
import type { LandingSection } from "@/lib/types/landing-sections";
import type { ShopCtaContent } from "@/lib/types/landing-sections";

interface ShopCtaSectionProps {
  section: LandingSection;
  locale: string;
  messages: Messages;
}

export function ShopCtaSection({ section, locale, messages: m }: ShopCtaSectionProps) {
  const content = section.content as ShopCtaContent;
  const buttonUrl = content.buttonUrl || `/${locale}/shop`;
  // Was a hardcoded English literal, so the zh-CN page shipped an English button (slice 03).
  const buttonLabel = content.buttonLabel || m.common.shopNow;

  return (
    <section className="relative py-16 md:py-24">
      {content.image && (
        <Image
          src={content.image}
          alt={content.title ?? "Shop"}
          fill
          className="object-cover"
          sizes="100vw"
        />
      )}
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center text-white">
        {content.title && (
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
            {content.title}
          </h2>
        )}
        {content.subtitle && (
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80 md:text-xl">
            {content.subtitle}
          </p>
        )}
        <Link
          href={buttonUrl}
          className="mt-8 inline-flex h-12 items-center rounded-full bg-white px-8 text-base font-semibold text-black transition-colors hover:bg-white/90"
        >
          {buttonLabel}
        </Link>
      </div>
    </section>
  );
}
