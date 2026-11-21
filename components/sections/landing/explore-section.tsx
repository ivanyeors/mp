import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { Messages } from "@/lib/i18n/messages/types";
import type { Locale } from "@/lib/i18n/locales";
import type { ExploreContent, LandingSection } from "@/lib/types/landing-sections";
import { EXPLORE_PATH } from "@/lib/routing/explore-route";

const EXPLORE_SCENERY = "/images/landing/explore-scenery.webp";

interface ExploreSectionProps {
  section: LandingSection;
  messages: Messages;
  locale: Locale;
}

export function ExploreSection({ section, messages: m, locale }: ExploreSectionProps) {
  const c = section.content as ExploreContent;
  const image = c.image || EXPLORE_SCENERY;
  const title = c.title ?? m.home.explore.title;
  const body = c.body ?? m.home.explore.body;
  const cta = c.buttonLabel ?? m.home.explore.cta;
  const alt = c.alt ?? (c.image ? "" : m.home.explore.alt);

  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8 lg:py-10">
        <Link
          href={`/${locale}${EXPLORE_PATH}`}
          className="group relative block overflow-hidden rounded-2xl border bg-[#1b1d45] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="relative aspect-[16/10] overflow-hidden sm:absolute sm:inset-0 sm:aspect-auto">
            <Image
              src={image}
              alt={alt}
              fill
              className="object-cover object-[70%_center] transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100 sm:object-[center_74%]"
              sizes="(min-width: 1152px) 1120px, 100vw"
            />
            <div
              className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#1b1d45] to-transparent sm:inset-0 sm:h-auto sm:bg-gradient-to-r sm:from-[#1b1d45]/75 sm:via-[#1b1d45]/25"
              aria-hidden="true"
            />
          </div>
          <div className="relative flex flex-col p-6 pt-2 sm:min-h-72 sm:max-w-md sm:justify-center sm:p-10">
            <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{title}</h2>
            <p className="mt-2 leading-relaxed text-white/85">{body}</p>
            <span className="mt-5 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-[#1b1d45] transition-colors group-hover:bg-white/90">
              {cta}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
            </span>
          </div>
        </Link>
      </div>
    </section>
  );
}
