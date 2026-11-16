"use client";

import * as React from "react";
import Image from "next/image";
import { AudioLines, Pause, Play } from "lucide-react";

import { TikTokIcon } from "@/components/tiktok/tiktok-icon";
import { preloadTikTokPip, useTikTokPip } from "@/components/tiktok/tiktok-pip-provider";
import { DEFAULT_TIKTOK_LABELS, fillLabel, type TikTokLabels, type TikTokVideo } from "@/lib/tiktok/types";
import { cn } from "@/lib/utils";

/** Fewer cards than this leave a gap in a wide band, so the set is repeated to fill it. */
const MIN_CARDS_PER_HALF = 8;

interface TikTokVideoMarqueeProps {
  videos: TikTokVideo[];
  labels?: TikTokLabels;
  direction?: "left" | "right";
  /** Seconds each card takes to pass; the loop's length follows from the number of cards. */
  secondsPerCard?: number;
  className?: string;
}

function VideoCard({
  video,
  label,
  hidden,
  playing,
  playingLabel,
  onOpen,
}: {
  video: TikTokVideo;
  label: string;
  /** A repeat that only fills the loop: hidden from assistive tech and the tab order. */
  hidden: boolean;
  /** Its video is the one in the floating player. */
  playing: boolean;
  playingLabel: string;
  onOpen: (opener: HTMLElement) => void;
}) {
  return (
    <li className={cn("shrink-0 pr-3 md:pr-4", hidden && "motion-reduce:hidden")} aria-hidden={hidden || undefined}>
      <button
        type="button"
        onClick={(e) => onOpen(e.currentTarget)}
        tabIndex={hidden ? -1 : undefined}
        aria-label={playing ? `${label} (${playingLabel})` : label}
        className={cn(
          "group/card relative block aspect-[9/16] w-36 overflow-hidden rounded-2xl border bg-muted text-left shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-44 md:w-52",
          playing && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <Image
          src={video.cover}
          alt=""
          fill
          sizes="(min-width: 768px) 208px, (min-width: 640px) 176px, 144px"
          draggable={false}
          className="select-none object-cover transition-transform duration-500 group-hover/card:scale-105 motion-reduce:transition-none"
        />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/20" />
        <span
          aria-hidden
          className="absolute left-2.5 top-2.5 inline-flex size-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
        >
          <TikTokIcon className="size-3.5" />
        </span>
        {playing ? (
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-black shadow-md"
          >
            <AudioLines className="size-4" />
            {playingLabel}
          </span>
        ) : (
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 inline-flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-md transition-transform duration-300 group-hover/card:scale-110 motion-reduce:transition-none"
          >
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        )}
        {video.hook && (
          <span aria-hidden className="absolute inset-x-0 bottom-0 line-clamp-3 p-3 text-sm font-medium leading-snug text-white">
            {video.hook}
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * A slow, endless band of TikTok cover cards (the landing page's marquee
 * motion, `mp-marquee-track`). A card plays its post in the floating player
 * (`TikTokPip`), which stays in a corner while the visitor carries on; the
 * card playing is marked.
 *
 * Movement stops while the pointer or keyboard focus is on the band, while one
 * of its videos is playing, and from the visible pause button (WCAG 2.2.2).
 * With reduced motion it is a still row that scrolls sideways.
 */
export function TikTokVideoMarquee({
  videos,
  labels = DEFAULT_TIKTOK_LABELS,
  direction = "left",
  secondsPerCard = 6,
  className,
}: TikTokVideoMarqueeProps) {
  const [paused, setPaused] = React.useState(false);
  const pip = useTikTokPip();

  if (videos.length === 0) return null;

  // The keyframes move the track by half its width, so it is two identical halves.
  const repeats = Math.max(1, Math.ceil(MIN_CARDS_PER_HALF / videos.length));
  const half = Array.from({ length: repeats }, () => videos).flat();
  const strip = [...half, ...half];
  const playingHere = pip.playingId !== null && videos.some((v) => v.id === pip.playingId);
  const stopped = paused || playingHere;

  const cardLabel = (video: TikTokVideo, n: number) =>
    `${labels.playVideo}: ${video.hook?.trim() || video.alt?.trim() || fillLabel(labels.untitled, { n })}`;

  return (
    <div className={cn("relative", className)} onPointerEnter={preloadTikTokPip} onFocus={preloadTikTokPip}>
      <div className="group/marquee overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)] motion-reduce:overflow-x-auto motion-reduce:[mask-image:none]">
        <ul
          className="mp-marquee-track flex w-max py-2 will-change-transform group-focus-within/marquee:[animation-play-state:paused] group-hover/marquee:[animation-play-state:paused] motion-reduce:animate-none"
          style={
            {
              ["--mp-marquee-duration" as never]: `${half.length * secondsPerCard}s`,
              ["--mp-marquee-direction" as never]: direction === "right" ? "reverse" : "normal",
              animationPlayState: stopped ? "paused" : undefined,
            } as React.CSSProperties
          }
        >
          {strip.map((video, i) => {
            const n = i % videos.length;
            return (
              <VideoCard
                key={`${video.id}-${i}`}
                video={video}
                label={cardLabel(video, n + 1)}
                hidden={i >= videos.length}
                playing={video.id === pip.playingId}
                playingLabel={labels.nowPlaying}
                onOpen={(opener) => pip.open(videos, n, { labels, opener })}
              />
            );
          })}
        </ul>
      </div>

      <div className="mt-3 flex justify-end px-4 motion-reduce:hidden">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-background/80 px-3 text-xs font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-11"
        >
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {paused ? labels.resumeScrolling : labels.pauseScrolling}
        </button>
      </div>

    </div>
  );
}
