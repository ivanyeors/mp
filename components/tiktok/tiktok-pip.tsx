"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TikTokIcon } from "@/components/tiktok/tiktok-icon";
import { TikTokPlayer, type TikTokPlayerHandle } from "@/components/tiktok/tiktok-player";
import type { TikTokPipSession } from "@/components/tiktok/tiktok-pip-provider";
import { stripLocale } from "@/lib/i18n/routing";
import type { TikTokPlayerOptions } from "@/lib/tiktok/embed";
import { DEFAULT_PIP_CORNER, nearestPipCorner, otherSidePipCorner, type PipCorner } from "@/lib/tiktok/pip";
import { fillLabel } from "@/lib/tiktok/types";
import { cn } from "@/lib/utils";

/**
 * Opened by a tap, so the player may start with sound. Our own button sits
 * under the player, so TikTok's caption and sound credit are left off; the end
 * screen recommends only this account's posts (see `tiktokPlayerSrc`).
 */
const PLAYER: TikTokPlayerOptions = {
  autoplay: true,
  loop: false,
  closedCaption: true,
  description: false,
  musicInfo: false,
};

const SIDE = "1rem";
/**
 * `--tiktok-pip-top`, set by class on the window: below the floating logo pill
 * on a phone, which a top corner would otherwise cover. From md up the pill is
 * well clear of the corners.
 */
const TOP = "var(--tiktok-pip-top)";
/**
 * The chat bubble's offset (support-chat-window.tsx): above the phone dock, a
 * page's or the cart's action bar, and the analytics notice.
 */
const BOTTOM =
  "calc(max(var(--safe-bottom), var(--app-dock-clearance), var(--mobile-bottom-bar-height, 0px)) + var(--analytics-notice-clearance, 0px) + 1rem)";
/**
 * The large size: as wide as fits the window's height between those offsets,
 * after the header and button (`--tiktok-pip-chrome`): at most 20rem, and
 * never narrower than the small size on a tablet.
 */
const LARGE_WIDTH = `max(11rem, min(20rem, calc(100vw - 2 * ${SIDE}), calc((100dvh - ${TOP} - ${BOTTOM} - var(--tiktok-pip-chrome)) * 9 / 16)))`;

function cornerStyle(corner: PipCorner): React.CSSProperties {
  const [vertical, horizontal] = corner.split("-") as ["top" | "bottom", "left" | "right"];
  return { [vertical]: vertical === "top" ? TOP : BOTTOM, [horizontal]: SIDE };
}

function isInternal(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

/** Whether a button link points at the page the visitor is on. */
function isCurrentPage(href: string, pathname: string): boolean {
  if (!isInternal(href)) return false;
  return stripLocale(href.split(/[?#]/)[0]) === stripLocale(pathname);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Where the visitor last left it and at what size, for the next video this visit. */
const remembered: { corner: PipCorner; large: boolean } = { corner: DEFAULT_PIP_CORNER, large: false };

function HeaderButton({ label, className, ...props }: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

interface TikTokPipProps {
  session: TikTokPipSession;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * A TikTok video in a small window docked to a corner of the screen, over the
 * page rather than in front of it: the page keeps scrolling and working, and
 * the window follows the visitor to the page its button opens.
 *
 * Drag it by its top bar to any corner, or use the move button for the other
 * side. It has a small and a large size, previous and next through the set,
 * and moves on to the next video when one ends. Opened through
 * `useTikTokPip().open` (tiktok-pip-provider.tsx).
 */
export default function TikTokPip({ session, onIndexChange, onClose }: TikTokPipProps) {
  const { videos, index, labels, opener, openCount } = session;
  const video = videos[index];
  const many = videos.length > 1;
  const pathname = usePathname() ?? "/";

  const [corner, setCorner] = React.useState<PipCorner>(remembered.corner);
  const [large, setLarge] = React.useState(remembered.large);
  const [dragging, setDragging] = React.useState(false);
  // Bumped on every snap, so a drag let go in the same corner still slides home.
  const [snaps, setSnaps] = React.useState(0);

  const box = React.useRef<HTMLElement>(null);
  const player = React.useRef<TikTokPlayerHandle>(null);
  const drag = React.useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const slideFrom = React.useRef<DOMRect | null>(null);

  // Take focus each time a video is picked, so keyboard and screen reader users land in the player.
  React.useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, [openCount]);

  // Slide from where it was (mid-drag, or the old corner) to where it now docks.
  React.useLayoutEffect(() => {
    const el = box.current;
    const from = slideFrom.current;
    slideFrom.current = null;
    if (!el || !from) return;
    el.style.transform = "";
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if ((dx === 0 && dy === 0) || prefersReducedMotion()) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
      duration: 220,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    });
  }, [corner, snaps]);

  const dock = (next: PipCorner) => {
    if (box.current) slideFrom.current = box.current.getBoundingClientRect();
    remembered.corner = next;
    setCorner(next);
    setSnaps((n) => n + 1);
  };

  const resize = (next: boolean) => {
    remembered.large = next;
    setLarge(next);
  };

  /** Closes; focus goes back to the card that opened it when the visitor closed it from the keyboard. */
  const close = (fromKeyboard: boolean) => {
    onClose();
    if (fromKeyboard && opener?.isConnected && !opener.closest("[aria-hidden='true']")) {
      opener.focus({ preventScroll: true });
    }
  };

  const go = (step: number) => onIndexChange((index + step + videos.length) % videos.length);

  // Stop after the last one rather than looping the visitor forever.
  const onEnded = () => {
    if (index < videos.length - 1) onIndexChange(index + 1);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, a")) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !box.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      setDragging(true);
    }
    box.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved || !box.current) return;
    setDragging(false);
    const r = box.current.getBoundingClientRect();
    dock(
      nearestPipCorner(
        { x: r.left + r.width / 2, y: r.top + r.height / 2 },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  };

  if (!video) return null;

  const title = video.hook?.trim() || fillLabel(labels.untitled, { n: index + 1 });
  const external = !isInternal(video.buttonUrl);
  // Once the visitor has followed the button, it would only reload the page they are on.
  const showButton = !isCurrentPage(video.buttonUrl, pathname);

  return (
    <section
      ref={box}
      tabIndex={-1}
      aria-label={`${labels.player}: ${title}`}
      data-tiktok-pip=""
      data-corner={corner}
      data-size={large ? "large" : "small"}
      // Public pages force headings and some text sizes; this window sizes its own.
      data-typography-scope="app"
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
        "@container fixed z-40 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4",
        "[--tiktok-pip-top:calc(var(--mobile-top-clearance)_+_4.75rem)] md:[--tiktok-pip-top:1rem]",
        // Header and button around the video in the large size (the hook joins them from md up).
        "[--tiktok-pip-chrome:6.5rem] md:[--tiktok-pip-chrome:9.5rem]",
        !large && "w-40 sm:w-44 md:w-52",
      )}
      style={{ ...cornerStyle(corner), ...(large ? { width: LARGE_WIDTH } : null) }}
    >
      {/* The bar is the handle it is dragged by; its buttons work as usual. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className={cn(
          "flex h-9 shrink-0 touch-none select-none items-center gap-0.5 px-1",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <HeaderButton label={labels.movePlayer} onClick={() => dock(otherSidePipCorner(corner))}>
          <ArrowLeftRight />
        </HeaderButton>
        {many && (
          // Dropped when the window is too narrow for them (the small size on a phone): it
          // still moves on when a video ends, and the large size has room.
          <div className="flex items-center gap-0.5 @max-[10.5rem]:hidden">
            <HeaderButton label={labels.previousVideo} onClick={() => go(-1)}>
              <ChevronLeft />
            </HeaderButton>
            <span aria-hidden className="min-w-8 text-center text-xs tabular-nums text-muted-foreground @max-[14.5rem]:hidden">
              {index + 1}/{videos.length}
            </span>
            <HeaderButton label={labels.nextVideo} onClick={() => go(1)}>
              <ChevronRight />
            </HeaderButton>
          </div>
        )}
        <span className="flex-1" />
        <HeaderButton label={large ? labels.shrinkPlayer : labels.enlargePlayer} onClick={() => resize(!large)}>
          {large ? <Minimize2 /> : <Maximize2 />}
        </HeaderButton>
        <HeaderButton label={labels.closePlayer} onClick={(e) => close(e.detail === 0)}>
          <X />
        </HeaderButton>
      </div>

      <span className="sr-only" aria-live="polite">
        {many ? `${fillLabel(labels.position, { current: index + 1, total: videos.length })}: ` : ""}
        {title}
      </span>

      {/* A drag that crosses the player would hand the pointer to TikTok's frame. */}
      <div className={cn("relative aspect-[9/16] w-full shrink-0 bg-black", dragging && "pointer-events-none")}>
        <TikTokPlayer
          key={video.id}
          ref={player}
          postId={video.id}
          title={title}
          loading="eager"
          options={PLAYER}
          onEnded={onEnded}
        />
      </div>

      {(showButton || large) && (
        <div className="space-y-2 p-2">
          {large && video.hook?.trim() && (
            <p aria-hidden className="line-clamp-2 px-1 text-sm font-medium leading-snug max-md:hidden">
              {video.hook}
            </p>
          )}
          <div className="flex items-center justify-end gap-1">
            {showButton && (
              <Button asChild size="sm" className={cn("min-w-0 flex-1 rounded-full", large ? "h-10" : "h-9")}>
                {external ? (
                  <a href={video.buttonUrl} target="_blank" rel="noopener noreferrer" onClick={() => player.current?.pause()}>
                    <span className="truncate">{video.buttonLabel}</span>
                  </a>
                ) : (
                  // Stays playing on the page the button opens, out of the way in the small size.
                  <Link href={video.buttonUrl} onClick={() => resize(false)}>
                    <span className="truncate">{video.buttonLabel}</span>
                  </Link>
                )}
              </Button>
            )}
            {large && (
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={labels.watchOnTikTok}
                title={labels.watchOnTikTok}
                onClick={() => player.current?.pause()}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <TikTokIcon className="size-4" />
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
