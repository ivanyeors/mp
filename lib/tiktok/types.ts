export interface TikTokVideo {
  id: string;
  url: string;
  cover: string;
  alt?: string;
  hook?: string;
  buttonUrl: string;
  buttonLabel: string;
}

export interface TikTokLabels {
  playVideo: string;
  pauseScrolling: string;
  resumeScrolling: string;
  position: string;
  untitled: string;
  player: string;
  closePlayer: string;
  nowPlaying: string;
}

export const DEFAULT_TIKTOK_LABELS: TikTokLabels = {
  playVideo: "Play video",
  pauseScrolling: "Pause videos",
  resumeScrolling: "Play videos",
  position: "{current} of {total}",
  untitled: "TikTok video {n}",
  player: "Video player",
  closePlayer: "Close video",
  nowPlaying: "Playing",
};

export function fillLabel(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
