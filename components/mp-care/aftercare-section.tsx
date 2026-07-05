"use client";

import { LeftContentRightImgSection } from "@/components/sections/left-content-right-img-section";
import { YouTubeAutoplayOnView } from "@/components/effects/youtube-autoplay-on-view";
import { useI18n } from "@/lib/i18n/use-i18n";

export function MpCareAftercareSection() {
  const { m } = useI18n();

  return (
    <LeftContentRightImgSection
      className="space-y-3 px-0 pt-0 md:px-0"
      gridClassName="md:items-start"
      headerClassName="space-y-2"
      title={m.slides.basicMpillow.aftercareTitle}
      titleAs="h2"
      titleClassName="text-lg font-semibold tracking-tight md:text-xl"
      description={
        <>
          <p>{m.slides.basicMpillow.aftercareParagraphs[0]}</p>
          <p>{m.slides.basicMpillow.aftercareParagraphs[1]}</p>
        </>
      }
      right={
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="relative aspect-video bg-muted/20">
            <YouTubeAutoplayOnView videoId="dsuB9ndOixY" title="Mpillow aftercare video (Basic)" />
          </div>
        </div>
      }
    />
  );
}
