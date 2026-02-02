"use client";

import * as React from "react";

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
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
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
  }, [threshold]);

  const src = React.useMemo(() => buildYouTubeEmbedSrc(videoId, controls), [videoId, controls]);

  return (
    <div ref={hostRef} className={cn("absolute inset-0 h-full w-full", className)}>
      {isVisible ? (
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

