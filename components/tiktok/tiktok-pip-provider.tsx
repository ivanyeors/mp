"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { stripLocale } from "@/lib/i18n/routing";
import { pipFollowsTo } from "@/lib/tiktok/pip";
import type { TikTokLabels, TikTokVideo } from "@/lib/tiktok/types";

const loadPip = () => import("./tiktok-pip");
const TikTokPip = dynamic(loadPip, { ssr: false });

export function preloadTikTokPip() {
  void loadPip();
}

export interface TikTokPipSession {
  videos: TikTokVideo[];
  index: number;
  labels: TikTokLabels;
  opener: HTMLElement | null;
  openCount: number;
}

export interface TikTokPipApi {
  playingId: string | null;
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

export function useTikTokPip(): TikTokPipApi {
  const api = React.useContext(TikTokPipContext);
  if (!api) throw new Error("useTikTokPip: no TikTokPipProvider above (app/layout.tsx)");
  return api;
}
