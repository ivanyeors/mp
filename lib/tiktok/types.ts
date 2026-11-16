/** One TikTok post as the site shows it: a cover card that opens the floating player, and a button link. */
export interface TikTokVideo {
  /** TikTok post id (the long number in the post link). */
  id: string;
  /** The post on TikTok, for "Watch on TikTok". */
  url: string;
  /** Cover image shown on the card. TikTok no longer hands one out, so Staff pick it. */
  cover: string;
  /** Describes the cover for screen readers. */
  alt?: string;
  /** Short hook printed on the card and above the player. */
  hook?: string;
  /** Where the button under the player goes: a path on this site or an https URL. */
  buttonUrl: string;
  buttonLabel: string;
}

/** Every visible or spoken string, so the components carry no copy of their own. */
export interface TikTokLabels {
  /** Prefix for a card's spoken name: "Play video: …". */
  playVideo: string;
  pauseScrolling: string;
  resumeScrolling: string;
  /** "{current} of {total}". */
  position: string;
  /** Spoken title for a video with no hook: "TikTok video {n}". */
  untitled: string;
  /** The floating player's spoken name. */
  player: string;
  closePlayer: string;
  /** On the card whose video is playing. */
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
