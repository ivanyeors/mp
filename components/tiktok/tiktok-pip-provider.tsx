"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { stripLocale } from "@/lib/i18n/routing";
import { pipFollowsTo } from "@/lib/tiktok/pip";
import type { TikTokLabels, TikTokVideo } from "@/lib/tiktok/types";

/**
 * The floating TikTok player's foothold in the root layout (app/layout.tsx),
 * so a video keeps playing in its corner while the visitor scrolls on or
 * follows its button to another page.
 *
 * Every page pays for this file only, so it carries no copy: callers pass their
 * labels. The player itself loads the first time a video is opened, or earlier
 * through `preloadTikTokPip`.
 */

const loadPip = () => import("./tiktok-pip");
const TikTokPip = dynamic(loadPip, { ssr: false });

/** Fetch the player's code before the first tap, e.g. when a pointer reaches a band of cards. */
export function preloadTikTokPip() {
  void loadPip();
}

export interface TikTokPipSession {
  videos: TikTokVideo[];
  index: number;
  labels: TikTokLabels;
  /** What opened it, which gets focus back when the player closes. */
  opener: HTMLElement | null;
  /** Changes on every `open`, so the player takes focus each time a video is picked. */
  openCount: number;
}

export interface TikTokPipApi {
  /** The post playing in the corner, or null when the player is closed. */
  playingId: string | null;
  /** Plays `videos[index]`, replacing whatever was playing; previous and next move through `videos`. */
  open(videos: TikTokVideo[], index: number, options: { labels: TikTokLabels; opener?: HTMLElement | null }): void;
  close(): void;
}

const TikTokPipContext = React.createContext<TikTokPipApi | null>(null);

export function TikTokPipProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<TikTokPipSession | null>(null);
  const pathname = usePathname() ?? "/";

  const open = React.useCallback<TikTokPipApi["open"]>((videos, index, options) => {
    if (videos.length === 0) return;
    setSession((prev) => ({
      videos,
      index: Math.min(Math.max(0, index), videos.length - 1),
      labels: options.labels,
      opener: options.opener ?? null,
      openCount: (prev?.openCount ?? 0) + 1,
    }));
  }, []);

  const close = React.useCallback(() => setSession(null), []);

  const setIndex = React.useCallback((index: number) => {
    setSession((prev) => (prev ? { ...prev, index } : prev));
  }, []);

  // It follows the visitor between pages, but not into the Admin Panel or checkout.
  const [lastPathname, setLastPathname] = React.useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (session && !pipFollowsTo(stripLocale(pathname))) setSession(null);
  }

  const playingId = session ? (session.videos[session.index]?.id ?? null) : null;
  const api = React.useMemo<TikTokPipApi>(() => ({ playingId, open, close }), [playingId, open, close]);

  return (
    <TikTokPipContext.Provider value={api}>
      {children}
      {session && <TikTokPip session={session} onIndexChange={setIndex} onClose={close} />}
    </TikTokPipContext.Provider>
  );
}

/** Opens videos in the floating player. Every page has one: `TikTokPipProvider` is in the root layout. */
export function useTikTokPip(): TikTokPipApi {
  const api = React.useContext(TikTokPipContext);
  if (!api) throw new Error("useTikTokPip: no TikTokPipProvider above (app/layout.tsx)");
  return api;
}
