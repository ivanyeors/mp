"use client";

import { YouTubeAutoplayOnView } from "@/components/effects/youtube-autoplay-on-view";
import type { VideoSectionContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

type VideoSectionProps = {
  content: VideoSectionContent;
  videoId: string;
  borderTop?: boolean;
};

export function VideoSection({ content, videoId, borderTop }: VideoSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-3">
      <SectionTitle>{content.title}</SectionTitle>
      {content.description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{content.description}</p>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="relative aspect-video bg-muted/20">
          <YouTubeAutoplayOnView videoId={videoId} title={content.title} />
        </div>
      </div>
    </ProductSlideSection>
  );
}
