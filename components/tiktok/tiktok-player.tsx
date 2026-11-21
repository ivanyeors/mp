"use client";

import * as React from "react";

import {
  TIKTOK_PLAYER_ORIGIN,
  TIKTOK_STATE_ENDED,
  readTikTokPlayerMessage,
  tiktokPlayerCommand,
  tiktokPlayerSrc,
  type TikTokPlayerCommand,
  type TikTokPlayerEvent,
  type TikTokPlayerOptions,
} from "@/lib/tiktok/embed";
import { cn } from "@/lib/utils";

export interface TikTokPlayerHandle {
  play(): void;
  pause(): void;
  mute(): void;
  unMute(): void;
}

interface TikTokPlayerProps {
  postId: string;
  title: string;
  options?: TikTokPlayerOptions;
  loading?: "lazy" | "eager";
  onEnded?: () => void;
  onError?: (error: { errorCode?: number; errorType?: string }) => void;
  onEvent?: (event: TikTokPlayerEvent) => void;
  className?: string;
}

export const TikTokPlayer = React.forwardRef<TikTokPlayerHandle, TikTokPlayerProps>(function TikTokPlayer(
  { postId, title, options, loading = "lazy", onEnded, onError, onEvent, className },
  ref,
) {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const src = React.useMemo(() => tiktokPlayerSrc(postId, options), [postId, options]);

  const onMessage = React.useEffectEvent((e: MessageEvent) => {
    if (!frame.current || e.source !== frame.current.contentWindow) return;
    const event = readTikTokPlayerMessage(e.origin, e.data);
    if (!event) return;
    onEvent?.(event);
    if (event.type === "onStateChange" && event.value === TIKTOK_STATE_ENDED) onEnded?.();
    if (event.type === "onPlayerError") onError?.(event.value ?? {});
  });

  React.useEffect(() => {
    const listener = (e: MessageEvent) => onMessage(e);
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  React.useImperativeHandle(ref, () => {
    const send = (type: TikTokPlayerCommand) =>
      frame.current?.contentWindow?.postMessage(tiktokPlayerCommand(type), TIKTOK_PLAYER_ORIGIN);
    return {
      play: () => send("play"),
      pause: () => send("pause"),
      mute: () => send("mute"),
      unMute: () => send("unMute"),
    };
  }, []);

  return (
    <iframe
      ref={frame}
      src={src}
      title={title}
      loading={loading}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      className={cn("block h-full w-full border-0", className)}
    />
  );
});
