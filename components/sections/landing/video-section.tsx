import { AspectRatio } from "@/components/ui/aspect-ratio";
import { YouTubeAutoplayOnView } from "@/components/effects/youtube-autoplay-on-view";
import type { Messages } from "@/lib/i18n/messages/types";
import type { LandingSection, VideoEmbedContent } from "@/lib/types/landing-sections";

interface VideoSectionProps {
  section: LandingSection;
  messages: Messages;
}

export function VideoSection({ section, messages: m }: VideoSectionProps) {
  const c = section.content as VideoEmbedContent;
  const title = c.title ?? m.home.review.title;
  const subtitle = c.subtitle ?? m.home.review.subtitle;
  const videoId = c.videoId ?? "nvFI6woJD9g";

  return (
    <section id="review" className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
            <p className="text-muted-foreground">{subtitle}</p>
          </div>

          <AspectRatio
            ratio={16 / 9}
            className="overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm"
          >
            <YouTubeAutoplayOnView
              videoId={videoId}
              title={m.home.review.videoTitle}
            />
          </AspectRatio>
        </div>
      </div>
    </section>
  );
}
