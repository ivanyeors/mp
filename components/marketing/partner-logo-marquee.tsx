"use client";

import * as React from "react";
import Image from "next/image";
import type { ResolvedPartner } from "@/lib/partners";

type PartnerLogoMarqueeProps = {
  partners: ResolvedPartner[];
  durationSeconds?: number;
};

function LogoStrip({ partners }: { partners: ResolvedPartner[] }) {
  return (
    <>
      {partners.map((partner) => (
        <div
          key={partner.id}
          className="mx-6 flex h-16 w-36 shrink-0 items-center justify-center rounded-xl border bg-card/40 px-4 backdrop-blur-sm"
        >
          {partner.logoUrl ? (
            <Image
              src={partner.logoUrl}
              alt={partner.name}
              width={120}
              height={48}
              draggable={false}
              className="max-h-10 w-auto max-w-full object-contain"
            />
          ) : (
            <span className="text-center text-sm font-medium text-muted-foreground">
              {partner.name}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

export function PartnerLogoMarquee({
  partners,
  durationSeconds = 30,
}: PartnerLogoMarqueeProps) {
  if (partners.length === 0) return null;

  const items =
    partners.length < 4
      ? [...partners, ...partners, ...partners, ...partners]
      : [...partners, ...partners];

  return (
    <div className="relative overflow-hidden py-4" aria-hidden="true">
      <div
        className="mp-marquee-track flex w-max items-center will-change-transform motion-reduce:translate-x-0 motion-reduce:animate-none"
        style={
          {
            ["--mp-marquee-duration" as never]: `${durationSeconds}s`,
            ["--mp-marquee-direction" as never]: "normal",
          } as React.CSSProperties
        }
      >
        <LogoStrip partners={items} />
        <LogoStrip partners={items} />
      </div>
    </div>
  );
}
