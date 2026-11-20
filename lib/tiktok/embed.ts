const POST_ID = /^\d{15,22}$/;

const POST_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);

const SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

export type TikTokPostType = "video" | "photo";

export type ParsedTikTokUrl =
  | {
      kind: "post";
      id: string;
      postType: TikTokPostType;
      handle: string | null;
    }
  | { kind: "short"; url: string };

function toUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function parseTikTokUrl(input: string): ParsedTikTokUrl | null {
  const trimmed = input.trim();
  if (POST_ID.test(trimmed)) return { kind: "post", id: trimmed, postType: "video", handle: null };

  const url = toUrl(trimmed);
  if (!url) return null;
  const host = url.hostname.toLowerCase();

  if (SHORT_HOSTS.has(host)) {
    return url.pathname.length > 1 ? { kind: "short", url: `https://${host}${url.pathname}` } : null;
  }
  if (!POST_HOSTS.has(host)) return null;

  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length >= 3 && parts[0].startsWith("@") && (parts[1] === "video" || parts[1] === "photo")) {
    const id = parts[2];
    if (!POST_ID.test(id)) return null;
    const handle = parts[0].slice(1);
    return { kind: "post", id, postType: parts[1], handle: handle || null };
  }

  if (parts[0] === "t" && parts.length >= 2) {
    return { kind: "short", url: `https://www.tiktok.com/t/${parts[1]}` };
  }

  const last = parts[parts.length - 1]?.replace(/\.html$/, "");
  const embedLike =
    parts[0] === "embed" || (parts[0] === "player" && parts[1] === "v1") || parts[0] === "v";
  if (embedLike && last && POST_ID.test(last)) {
    return { kind: "post", id: last, postType: "video", handle: null };
  }

  return null;
}

export function tiktokPostId(input: string | null | undefined): string | null {
  if (!input) return null;
  const parsed = parseTikTokUrl(input);
  return parsed?.kind === "post" ? parsed.id : null;
}

export function tiktokPostUrl(post: { id: string; postType?: TikTokPostType; handle?: string | null }): string {
  const type = post.postType ?? "video";
  return `https://www.tiktok.com/@${post.handle ?? ""}/${type}/${post.id}`;
}

export function canonicalTikTokUrl(input: string): string | null {
  const parsed = parseTikTokUrl(input);
  return parsed?.kind === "post" ? tiktokPostUrl(parsed) : null;
}

export interface TikTokPlayerOptions {
  autoplay?: boolean;
  loop?: boolean;
  controls?: boolean;
  progressBar?: boolean;
  playButton?: boolean;
  volumeControl?: boolean;
  fullscreenButton?: boolean;
  timestamp?: boolean;
  musicInfo?: boolean;
  description?: boolean;
  closedCaption?: boolean;
  forceMuted?: boolean;
  relatedFromAnyone?: boolean;
  nativeContextMenu?: boolean;
}

const FLAG_PARAMS: Array<[keyof TikTokPlayerOptions, string]> = [
  ["autoplay", "autoplay"],
  ["loop", "loop"],
  ["controls", "controls"],
  ["progressBar", "progress_bar"],
  ["playButton", "play_button"],
  ["volumeControl", "volume_control"],
  ["fullscreenButton", "fullscreen_button"],
  ["timestamp", "timestamp"],
  ["musicInfo", "music_info"],
  ["description", "description"],
  ["closedCaption", "closed_caption"],
  ["forceMuted", "force_muted"],
  ["relatedFromAnyone", "rel"],
  ["nativeContextMenu", "native_context_menu"],
];

export const TIKTOK_PLAYER_ORIGIN = "https://www.tiktok.com";

export function tiktokPlayerSrc(postId: string, options: TikTokPlayerOptions = {}): string {
  if (!POST_ID.test(postId)) throw new Error(`Not a TikTok post id: ${postId}`);
  const merged: TikTokPlayerOptions = { relatedFromAnyone: false, ...options };
  const params = new URLSearchParams();
  for (const [key, param] of FLAG_PARAMS) {
    const value = merged[key];
    if (value !== undefined) params.set(param, value ? "1" : "0");
  }
  const query = params.toString();
  return `${TIKTOK_PLAYER_ORIGIN}/player/v1/${postId}${query ? `?${query}` : ""}`;
}

export type TikTokPlayerEvent =
  | { type: "onPlayerReady" }
  | { type: "onStateChange"; value: number }
  | { type: "onCurrentTime"; value: { currentTime: number; duration: number } }
  | { type: "onMute"; value: boolean }
  | { type: "onVolumeChange"; value: number }
  | { type: "onPlayerError"; value: { errorCode?: number; errorType?: string } };

export const TIKTOK_STATE_ENDED = 0;
export const TIKTOK_STATE_PLAYING = 1;
export const TIKTOK_STATE_BUFFERING = 3;

export function readTikTokPlayerMessage(origin: string, data: unknown): TikTokPlayerEvent | null {
  if (origin !== TIKTOK_PLAYER_ORIGIN) return null;
  let payload = data;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (record["x-tiktok-player"] !== true || typeof record.type !== "string") return null;
  return { type: record.type, value: record.value } as TikTokPlayerEvent;
}

export type TikTokPlayerCommand = "play" | "pause" | "mute" | "unMute";

export function tiktokPlayerCommand(type: TikTokPlayerCommand): Record<string, unknown> {
  return { type, "x-tiktok-player": true };
}
