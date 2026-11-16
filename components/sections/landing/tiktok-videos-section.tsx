import { TikTokVideoMarquee } from "@/components/tiktok/tiktok-video-marquee";
import type { TikTokLabels } from "@/lib/tiktok/types";
import type { Locale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n/messages/types";
import { tiktokVideosFromContent } from "@/lib/tiktok/videos";
import type { LandingSection, TikTokVideosContent } from "@/lib/types/landing-sections";

interface TikTokVideosSectionProps {
  section: LandingSection;
  messages: Messages;
  locale: Locale;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export function TikTokVideosSection({ section, messages: m, locale }: TikTokVideosSectionProps) {
  const c = section.content as TikTokVideosContent;
  const videos = tiktokVideosFromContent(c.videos, locale, m.common.shopNow);

  if (videos.length === 0) return null;

  const t = m.tiktok;
  const labels: TikTokLabels = {
    playVideo: t.playVideo,
    pauseScrolling: t.pauseScrolling,
    resumeScrolling: t.resumeScrolling,
    previousVideo: t.previousVideo,
    nextVideo: t.nextVideo,
    watchOnTikTok: t.watchOnTikTok,
    position: t.position,
    untitled: t.untitled,
    player: t.player,
    closePlayer: t.closePlayer,
    enlargePlayer: t.enlargePlayer,
    shrinkPlayer: t.shrinkPlayer,
    movePlayer: t.movePlayer,
    nowPlaying: t.nowPlaying,
  };

  return (
    <section className="relative py-12 md:py-16">
      <div className="mx-auto mb-6 w-full max-w-6xl space-y-2 px-4 md:mb-8">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">{text(c.title) ?? m.tiktok.title}</h2>
        <p className="text-muted-foreground">{text(c.subtitle) ?? m.tiktok.subtitle}</p>
      </div>
      <TikTokVideoMarquee videos={videos} labels={labels} direction={c.direction === "right" ? "right" : "left"} />
    </section>
  );
}
