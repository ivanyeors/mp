"use client";

import { useState } from "react";
import Image from "next/image";
import { MapPin } from "lucide-react";
import { toWebUrl } from "@/lib/format/web-url";
import { formatLocationAddress, locationMapsUrl } from "@/lib/locations/branches";
import SpotlightCard from "@/components/effects/SpotlightCard";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import type { PartnerPlace, ResolvedPartner } from "@/lib/partners";

type PartnersLogoGridProps = {
  partners: ResolvedPartner[];
  sectionTitle?: string;
  locale?: Locale;
};

/** Clinics a card lists before "Show more", so a big group doesn't stretch its row. */
const SHOWN_PLACES = 3;

const COPY: Record<
  Locale,
  { count: (n: number) => string; more: (n: number) => string; fewer: string; directions: string }
> = {
  "en-US": {
    count: (n) => `${n} locations`,
    more: (n) => `Show ${n} more`,
    fewer: "Show fewer",
    directions: "Directions to",
  },
  "zh-CN": {
    count: (n) => `${n} 个地点`,
    more: (n) => `再显示 ${n} 个`,
    fewer: "收起",
    directions: "前往",
  },
};

function PlaceLink({ place, directions }: { place: PartnerPlace; directions: string }) {
  const address = formatLocationAddress(place.address, place.postalCode);
  const href = locationMapsUrl(place.address, place.postalCode);
  const body = (
    <>
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 text-sm leading-snug">
        {place.branchName ? (
          <span className="block font-medium text-foreground">{place.branchName}</span>
        ) : null}
        <span className="block break-words text-muted-foreground">{address}</span>
      </span>
    </>
  );
  if (!href) return <div className="flex gap-2 py-1.5">{body}</div>;
  return (
    // Above the card's website link (z-10), so a tap here opens the map instead.
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${directions} ${[place.branchName, address].filter(Boolean).join(", ")}`}
      className="relative z-10 -mx-2 flex gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </a>
  );
}

function PartnerPlaces({ places, locale }: { places: PartnerPlace[]; locale: Locale }) {
  const [expanded, setExpanded] = useState(false);
  if (places.length === 0) return null;
  const copy = COPY[locale] ?? COPY[DEFAULT_LOCALE];
  const extra = places.length - SHOWN_PLACES;
  const shown = expanded || extra <= 0 ? places : places.slice(0, SHOWN_PLACES);

  return (
    <div className="mt-auto w-full pt-4">
      <div className="border-t pt-3 text-left">
        {places.length > 1 ? (
          // A div, not a <p>: marketing pages size every <p> up.
          <div className="mb-1 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {copy.count(places.length)}
          </div>
        ) : null}
        <ul className="space-y-0.5">
          {shown.map((place) => (
            <li key={place.id}>
              <PlaceLink place={place} directions={copy.directions} />
            </li>
          ))}
        </ul>
        {extra > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="relative z-10 mt-1 inline-flex min-h-11 items-center text-sm font-medium text-foreground underline-offset-4 hover:underline md:min-h-8"
          >
            {expanded ? copy.fewer : copy.more(extra)}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PartnerCard({ partner, locale }: { partner: ResolvedPartner; locale: Locale }) {
  const websiteUrl = toWebUrl(partner.websiteUrl);

  return (
    <SpotlightCard
      className={`flex h-full min-h-[180px] flex-col items-center rounded-2xl border bg-card/40 p-6 text-center backdrop-blur-sm ${
        websiteUrl ? "transition-transform hover:scale-[1.02]" : ""
      }`}
    >
      <div className="flex h-20 w-full items-center justify-center">
        {partner.logoUrl ? (
          <Image
            src={partner.logoUrl}
            alt={partner.name}
            width={160}
            height={64}
            className="max-h-16 w-auto max-w-full object-contain"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
            {partner.name.charAt(0)}
          </div>
        )}
      </div>
      <h3 className="mt-4 text-base font-semibold">
        {websiteUrl ? (
          // The link covers the whole card, as the card itself used to be the link.
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {partner.name}
          </a>
        ) : (
          partner.name
        )}
      </h3>
      {partner.description ? (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{partner.description}</p>
      ) : null}
      <PartnerPlaces places={partner.locations} locale={locale} />
    </SpotlightCard>
  );
}

export function PartnersLogoGrid({
  partners,
  sectionTitle = "Our Partners",
  locale = DEFAULT_LOCALE,
}: PartnersLogoGridProps) {
  if (partners.length === 0) return null;

  return (
    <section id="our-partners" className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <h2 className="mb-8 text-center text-3xl font-semibold tracking-tight md:text-4xl">
          {sectionTitle}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {partners.map((partner) => (
            <PartnerCard key={partner.id} partner={partner} locale={locale} />
          ))}
        </div>
      </div>
    </section>
  );
}
