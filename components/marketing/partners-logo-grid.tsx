"use client";

import Image from "next/image";
import SpotlightCard from "@/components/effects/SpotlightCard";
import type { ResolvedPartner } from "@/lib/partners";

type PartnersLogoGridProps = {
  partners: ResolvedPartner[];
  sectionTitle?: string;
};

function PartnerCard({ partner }: { partner: ResolvedPartner }) {
  const inner = (
    <SpotlightCard className="flex h-full min-h-[180px] flex-col items-center rounded-2xl border bg-card/40 p-6 text-center backdrop-blur-sm">
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
      <h3 className="mt-4 text-base font-semibold">{partner.name}</h3>
      {partner.description ? (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{partner.description}</p>
      ) : null}
    </SpotlightCard>
  );

  if (partner.websiteUrl) {
    return (
      <a
        href={partner.websiteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full transition-transform hover:scale-[1.02]"
      >
        {inner}
      </a>
    );
  }

  return inner;
}

export function PartnersLogoGrid({ partners, sectionTitle = "Our Partners" }: PartnersLogoGridProps) {
  if (partners.length === 0) return null;

  return (
    <section id="our-partners" className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <h2 className="mb-8 text-center text-3xl font-semibold tracking-tight md:text-4xl">
          {sectionTitle}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {partners.map((partner) => (
            <PartnerCard key={partner.id} partner={partner} />
          ))}
        </div>
      </div>
    </section>
  );
}
