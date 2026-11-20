"use client";

import * as React from "react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type Props = {
  videoId: string;
  title: string;
  className?: string;
  /**
   * IntersectionObserver threshold.
   * 0.5 means “at least half the block is visible”.
   */
  threshold?: number;
  /**
   * YouTube controls UI.
   * Defaults to 0 to match existing embeds.
   */
  controls?: 0 | 1;
};

function buildYouTubeEmbedSrc(videoId: string, controls: 0 | 1): string {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: String(controls),
    modestbranding: "1",
    rel: "0",
    fs: "0",
    iv_load_policy: "3",
    disablekb: "1",
    playsinline: "1",
    loop: "1",
    // YouTube requires playlist=<videoId> for looping a single video.
    playlist: videoId,
  });

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function YouTubeAutoplayOnView({
  videoId,
  title,
  className,
  threshold = 0.5,
  controls = 0,
}: Props) {
  const isMobile = useIsMobile();
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = React.useState(false);
  // Mobile: never autoplay on scroll; iframe mounts only after the user taps the poster.
  const [showIframe, setShowIframe] = React.useState(false);

  React.useEffect(() => {
    // Mobile uses a click-to-play facade instead of the scroll observer.
    if (isMobile) return;

    const el = hostRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      // Older browsers: render the iframe (best-effort).
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsVisible(Boolean(entry?.isIntersecting));
      },
      { threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, isMobile]);

  const src = React.useMemo(() => buildYouTubeEmbedSrc(videoId, controls), [videoId, controls]);

  // Mobile facade: lightweight poster thumbnail + play button, no iframe until tapped.
  if (isMobile && !showIframe) {
    return (
      <button
        type="button"
        onClick={() => setShowIframe(true)}
        aria-label={`Play ${title}`}
        className={cn("group absolute inset-0 h-full w-full", className)}
      >
        <img
          src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md">
            <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-7 w-7" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </button>
    );
  }

  const showFrame = isMobile ? showIframe : isVisible;

  return (
    <div ref={hostRef} className={cn("absolute inset-0 h-full w-full", className)}>
      {showFrame ? (
        <iframe
          className="h-full w-full"
          src={src}
          title={title}
          frameBorder={0}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <div className="h-full w-full" aria-label={title} />
      )}
    </div>
  );
}

