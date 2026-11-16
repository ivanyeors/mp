"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TikTokIcon } from "@/components/tiktok/tiktok-icon";
import { TikTokPlayer } from "@/components/tiktok/tiktok-player";
import { DEFAULT_TIKTOK_LABELS, fillLabel, type TikTokLabels, type TikTokVideo } from "@/lib/tiktok/types";
import type { TikTokPlayerOptions } from "@/lib/tiktok/embed";

/**
 * Opened by a tap, so the player may start with sound. Our own hook and button
 * sit around the player, so TikTok's caption and sound credit are left off; the
 * end screen recommends only this account's posts (see `tiktokPlayerSrc`).
 */
const VIEWER_PLAYER: TikTokPlayerOptions = {
  autoplay: true,
  loop: false,
  closedCaption: true,
  description: false,
  musicInfo: false,
};

function isInternal(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

interface TikTokVideoViewerProps {
  videos: TikTokVideo[];
  /** Which video is open; null when closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  labels?: TikTokLabels;
}

/**
 * Plays one post at a time in a dialog (a bottom drawer on phones), with the
 * video's button under it and previous/next to move through the set. Moves on
 * to the next video when one ends. Only the open video loads a player.
 */
export function TikTokVideoViewer({
  videos,
  index,
  onIndexChange,
  labels = DEFAULT_TIKTOK_LABELS,
}: TikTokVideoViewerProps) {
  const open = index !== null && videos.length > 0;
  const current = open ? ((index % videos.length) + videos.length) % videos.length : 0;
  const video = videos[current];
  const many = videos.length > 1;

  const go = React.useCallback(
    (step: number) => {
      if (index === null || videos.length === 0) return;
      onIndexChange((index + step + videos.length) % videos.length);
    },
    [index, onIndexChange, videos.length],
  );

  const onEnded = React.useCallback(() => {
    // Stop after the last one rather than looping the visitor forever.
    if (index !== null && index < videos.length - 1) onIndexChange(index + 1);
  }, [index, onIndexChange, videos.length]);

  if (!video) return null;

  const title = video.hook?.trim() || fillLabel(labels.untitled, { n: current + 1 });
  const external = !isInternal(video.buttonUrl);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onIndexChange(null)}>
      <DialogContent
        aria-describedby={undefined}
        // Public pages force every h2 to 24–28px; this title sizes itself.
        data-typography-scope="app"
        className="gap-3 md:max-w-[26rem] md:p-5"
        onKeyDown={(e) => {
          if (!many) return;
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
      >
        <DialogTitle
          className={
            video.hook?.trim()
              ? "line-clamp-2 text-lg font-medium leading-snug md:pr-10"
              : "sr-only"
          }
        >
          {title}
        </DialogTitle>

        {/* Sized by height so the 9:16 player fits the drawer or the window, whichever is shorter. */}
        <div className="mx-auto aspect-[9/16] h-[min(calc(90dvh-16rem),40rem)] max-w-full overflow-hidden rounded-xl bg-black md:h-[min(calc(100dvh-17rem),40rem)]">
          <TikTokPlayer
            key={video.id}
            postId={video.id}
            title={title}
            loading="eager"
            options={VIEWER_PLAYER}
            onEnded={onEnded}
          />
        </div>

        {many && (
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="icon" onClick={() => go(-1)} aria-label={labels.previousVideo}>
              <ChevronLeft className="size-5" />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
              {fillLabel(labels.position, { current: current + 1, total: videos.length })}
            </span>
            <Button type="button" variant="ghost" size="icon" onClick={() => go(1)} aria-label={labels.nextVideo}>
              <ChevronRight className="size-5" />
            </Button>
          </div>
        )}

        <Button asChild size="lg" className="w-full">
          {external ? (
            <a href={video.buttonUrl} target="_blank" rel="noopener noreferrer">
              {video.buttonLabel}
            </a>
          ) : (
            <Link href={video.buttonUrl} onClick={() => onIndexChange(null)}>
              {video.buttonLabel}
            </Link>
          )}
        </Button>

        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-auto inline-flex min-h-8 items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <TikTokIcon className="size-3.5" />
          {labels.watchOnTikTok}
        </a>
      </DialogContent>
    </Dialog>
  );
}
