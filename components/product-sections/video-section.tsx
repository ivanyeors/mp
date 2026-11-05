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
  /** `split`: title and description beside the video from `md` up. */
  layout?: "stacked" | "split";
  borderTop?: boolean;
};

export function VideoSection({ content, videoId, layout = "stacked", borderTop }: VideoSectionProps) {
  if (layout === "split") {
    return (
      <ProductSlideSection borderTop={borderTop}>
        <div className="grid gap-4 md:grid-cols-2 md:items-center">
          <header className="space-y-2">
            <h2 className="text-base font-semibold tracking-normal">{content.title}</h2>
            {content.description ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{content.description}</p>
            ) : null}
          </header>
          <div className="relative aspect-video overflow-hidden rounded-xl border bg-muted/20">
            <YouTubeAutoplayOnView videoId={videoId} title={content.title} controls={1} />
          </div>
        </div>
      </ProductSlideSection>
    );
  }

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
