"use client";

import * as React from "react";
import { X } from "lucide-react";

import { TikTokPlayer, type TikTokPlayerHandle } from "@/components/tiktok/tiktok-player";
import type { TikTokPipSession } from "@/components/tiktok/tiktok-pip-provider";
import {
  TIKTOK_STATE_BUFFERING,
  TIKTOK_STATE_PLAYING,
  type TikTokPlayerEvent,
  type TikTokPlayerOptions,
} from "@/lib/tiktok/embed";
import { fillLabel } from "@/lib/tiktok/types";
import { cn } from "@/lib/utils";

/**
 * Opened by a tap, so the player may start with sound. Only TikTok's play,
 * volume and progress controls show (volume matters: where a browser starts the
 * video muted, it is how the visitor turns the sound on). The end screen
 * recommends only this account's posts (see `tiktokPlayerSrc`).
 */
const PLAYER: TikTokPlayerOptions = {
  autoplay: true,
  loop: false,
  closedCaption: true,
  description: false,
  musicInfo: false,
  fullscreenButton: false,
  timestamp: false,
};

/** The site's navy-to-blue (the dock's gradient) ending in its bright accent, glowing under the window. */
const GLOW = "linear-gradient(160deg, #001736 0%, #18478f 40%, #2b69bc 70%, #1298ff 100%)";

const SIDE = "0.75rem";
/** `--tiktok-pip-top`, set by class: below the floating logo pill on a phone. */
const TOP = "var(--tiktok-pip-top)";
/**
 * The chat bubble's offset (support-chat-window.tsx): above the phone dock, a
 * page's or the cart's action bar, and the analytics notice.
 */
const BOTTOM =
  "calc(max(var(--safe-bottom), var(--app-dock-clearance), var(--mobile-bottom-bar-height, 0px)) + var(--analytics-notice-clearance, 0px) + 0.75rem)";
/** The size set by class, narrowed when the window is too short for a 9:16 video that wide. */
const WIDTH = `min(var(--tiktok-pip-w), calc((100dvh - ${TOP} - ${BOTTOM}) * 9 / 16))`;

/**
 * Where the window sits for a position the visitor dragged it to: CSS keeps it
 * inside those margins, on every frame of a drag and whenever the window resizes.
 */
const leftAt = (x: number) => `clamp(${SIDE}, ${Math.round(x)}px, calc(100% - ${SIDE} - var(--tiktok-pip-width)))`;
const topAt = (y: number) =>
  `clamp(${TOP}, ${Math.round(y)}px, calc(100% - ${BOTTOM} - var(--tiktok-pip-width) * 16 / 9))`;

/** Where the visitor last left it, for the next video this visit. Starts bottom right. */
const remembered = { x: 1e5, y: 1e5 };

/** Below this much movement a press is a tap (play or pause), not a drag. */
const DRAG_THRESHOLD = 4;

/**
 * Leaves TikTok's control row at the bottom of the video to TikTok: everything
 * above it is the surface the window is dragged by.
 */
const CONTROLS_HEIGHT = "3.5rem";

interface TikTokPipProps {
  session: TikTokPipSession;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * A TikTok video floating over the page, nothing around it but a blue glow:
 * the page keeps scrolling and working behind it, and it follows the visitor
 * to other pages. Drag it anywhere by the video; a tap plays or pauses. The
 * one control of ours is close, which shows while the pointer is over the
 * window (always, on touch screens). It moves on to the next video in the set
 * when one ends. Opened through `useTikTokPip().open` (tiktok-pip-provider.tsx).
 */
export default function TikTokPip({ session, onIndexChange, onClose }: TikTokPipProps) {
  const { videos, index, labels, opener, openCount } = session;
  const video = videos[index];
  const many = videos.length > 1;

  const [position, setPosition] = React.useState(remembered);
  const [dragging, setDragging] = React.useState(false);

  const box = React.useRef<HTMLElement>(null);
  const player = React.useRef<TikTokPlayerHandle>(null);
  const drag = React.useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(
    null,
  );
  // Autoplay is on, so assume playing until TikTok says otherwise.
  const playing = React.useRef(true);

  // Take focus each time a video is picked, so keyboard and screen reader users land in the player.
  React.useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, [openCount]);

  /** Closes; focus goes back to the card that opened it when the visitor closed it from the keyboard. */
  const close = (fromKeyboard: boolean) => {
    onClose();
    if (fromKeyboard && opener?.isConnected && !opener.closest("[aria-hidden='true']")) {
      opener.focus({ preventScroll: true });
    }
  };

  const go = (step: number) => {
    playing.current = true;
    onIndexChange((index + step + videos.length) % videos.length);
  };

  // Stop after the last one rather than looping the visitor forever.
  const onEnded = () => {
    if (index < videos.length - 1) go(1);
  };

  const onEvent = (event: TikTokPlayerEvent) => {
    if (event.type === "onStateChange") {
      playing.current = event.value === TIKTOK_STATE_PLAYING || event.value === TIKTOK_STATE_BUFFERING;
    }
  };

  const togglePlay = () => {
    if (playing.current) player.current?.pause();
    else player.current?.play();
    playing.current = !playing.current;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !box.current) return;
    const r = box.current.getBoundingClientRect();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !box.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      setDragging(true);
    }
    // Straight to the element: a re-render per pointer move is wasted work.
    box.current.style.left = leftAt(d.left + dx);
    box.current.style.top = topAt(d.top + dy);
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) {
      if (e.type === "pointerup") togglePlay();
      return;
    }
    setDragging(false);
    const next = { x: d.left + e.clientX - d.x, y: d.top + e.clientY - d.y };
    remembered.x = next.x;
    remembered.y = next.y;
    setPosition(next);
  };

  if (!video) return null;

  const title = video.hook?.trim() || fillLabel(labels.untitled, { n: index + 1 });

  return (
    <section
      ref={box}
      tabIndex={-1}
      aria-label={`${labels.player}: ${title}`}
      data-tiktok-pip=""
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close(true);
        } else if (many && e.key === "ArrowRight") {
          go(1);
        } else if (many && e.key === "ArrowLeft") {
          go(-1);
        }
      }}
      className={cn(
        "group/pip fixed z-40 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95",
        "[--tiktok-pip-top:calc(var(--mobile-top-clearance)_+_4.75rem)] md:[--tiktok-pip-top:0.75rem]",
        "[--tiktok-pip-w:10rem] sm:[--tiktok-pip-w:11rem] md:[--tiktok-pip-w:14rem]",
      )}
      style={
        {
          "--tiktok-pip-width": WIDTH,
          width: "var(--tiktok-pip-width)",
          left: leftAt(position.x),
          top: topAt(position.y),
        } as React.CSSProperties
      }
    >
      {/* The drop shadow: the brand gradient, blurred, showing round the window's edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-1 -bottom-4 top-6 -z-10 rounded-[1.75rem] opacity-90 blur-xl"
        style={{ backgroundImage: GLOW }}
      />

      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
        <TikTokPlayer
          key={video.id}
          ref={player}
          postId={video.id}
          title={title}
          loading="eager"
          options={PLAYER}
          onEnded={onEnded}
          onEvent={onEvent}
          // A drag that crosses the control row would hand the pointer to TikTok's frame.
          className={cn(dragging && "pointer-events-none")}
        />

        {/* Drag anywhere above TikTok's controls; a tap there plays or pauses. */}
        <div
          aria-hidden
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          className={cn(
            "absolute inset-x-0 top-0 touch-none select-none",
            dragging ? "cursor-grabbing" : "cursor-grab",
          )}
          style={{ bottom: CONTROLS_HEIGHT }}
        />

        <button
          type="button"
          onClick={(e) => close(e.detail === 0)}
          aria-label={labels.closePlayer}
          title={labels.closePlayer}
          className={cn(
            "absolute left-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-opacity duration-150 hover:bg-black/70 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white pointer-coarse:size-8",
            // Shown while the pointer is over the window; always there on touch screens.
            // and when the window was reached from the keyboard.
            "[@media(hover:hover)]:opacity-0 group-hover/pip:opacity-100 group-focus-visible/pip:opacity-100",
          )}
        >
          <X className="size-3.5" strokeWidth={2.5} />
        </button>
      </div>

      <span className="sr-only" aria-live="polite">
        {many ? `${fillLabel(labels.position, { current: index + 1, total: videos.length })}: ` : ""}
        {title}
      </span>
    </section>
  );
}
