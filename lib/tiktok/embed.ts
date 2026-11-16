/**
 * TikTok posts shown on this site through TikTok's Embed Player
 * (developers.tiktok.com/doc/embed-player): an iframe at
 * `https://www.tiktok.com/player/v1/{postId}` driven by query flags and
 * `postMessage`. TikTok's older blockquote + embed.js product ("Embed Videos")
 * is being deprecated in favour of it, so nothing here uses embed.js.
 *
 * Pure helpers only: parsing a pasted link, building the player URL and the
 * link back to TikTok. Short share links (vm./vt.tiktok.com, /t/…) need a
 * network hop and are resolved by `/api/tiktok/resolve`, never at render.
 */

const POST_ID = /^\d{15,22}$/;

/** Hosts whose path carries the post id. */
const POST_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);

/** Share-link hosts that only redirect to a post. */
const SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

export type TikTokPostType = "video" | "photo";

export type ParsedTikTokUrl =
  | {
      kind: "post";
      id: string;
      postType: TikTokPostType;
      /** Account handle without the `@`, when the link carries it. */
      handle: string | null;
    }
  /** A share link that has to be followed to find the post. */
  | { kind: "short"; url: string };

function toUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // People paste links without the scheme ("tiktok.com/@x/video/1…").
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Read a pasted TikTok link. Accepts post links (`/@handle/video/{id}`,
 * `/@handle/photo/{id}`), embed and player URLs, the old mobile `/v/{id}.html`,
 * and a bare post id. Returns `{ kind: "short" }` for share links that must be
 * followed first, and null for anything that is not a TikTok post.
 */
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

  // /@handle/video/{id} and /@handle/photo/{id}
  if (parts.length >= 3 && parts[0].startsWith("@") && (parts[1] === "video" || parts[1] === "photo")) {
    const id = parts[2];
    if (!POST_ID.test(id)) return null;
    const handle = parts[0].slice(1);
    return { kind: "post", id, postType: parts[1], handle: handle || null };
  }

  // /t/{code} is a share link on the main host.
  if (parts[0] === "t" && parts.length >= 2) {
    return { kind: "short", url: `https://www.tiktok.com/t/${parts[1]}` };
  }

  // /embed/{id}, /embed/v2/{id}, /player/v1/{id}, /v/{id}.html
  const last = parts[parts.length - 1]?.replace(/\.html$/, "");
  const embedLike =
    parts[0] === "embed" || (parts[0] === "player" && parts[1] === "v1") || parts[0] === "v";
  if (embedLike && last && POST_ID.test(last)) {
    return { kind: "post", id: last, postType: "video", handle: null };
  }

  return null;
}

/** The post id in a link, or null when the link is not a post (or still needs resolving). */
export function tiktokPostId(input: string | null | undefined): string | null {
  if (!input) return null;
  const parsed = parseTikTokUrl(input);
  return parsed?.kind === "post" ? parsed.id : null;
}

/**
 * The link back to the post on TikTok, without tracking parameters. With no
 * handle known it uses `/@/video/{id}`, the form TikTok itself redirects the
 * old `m.tiktok.com/v/{id}.html` links to, which opens the post.
 */
export function tiktokPostUrl(post: { id: string; postType?: TikTokPostType; handle?: string | null }): string {
  const type = post.postType ?? "video";
  return `https://www.tiktok.com/@${post.handle ?? ""}/${type}/${post.id}`;
}

/**
 * The canonical form a pasted post link is stored as. Returns null for
 * anything that is not a post link (including unresolved short links).
 */
export function canonicalTikTokUrl(input: string): string | null {
  const parsed = parseTikTokUrl(input);
  return parsed?.kind === "post" ? tiktokPostUrl(parsed) : null;
}

/** Embed Player flags (all 1/0 on the wire). Unset flags keep TikTok's defaults. */
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
  /** Mute and lock the volume. */
  forceMuted?: boolean;
  /**
   * What the end screen recommends: true is TikTok's mix, false is only this
   * account's own posts. Defaults to false here so the end screen keeps people
   * on our videos instead of sending them into TikTok's feed.
   */
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

/** The Embed Player iframe URL for one post. */
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

/**
 * Messages the player posts to the host page. TikTok documents them as
 * `{ "x-tiktok-player": true, type, value }`.
 */
export type TikTokPlayerEvent =
  | { type: "onPlayerReady" }
  /** -1 init, 0 ended, 1 playing, 2 paused, 3 buffering. */
  | { type: "onStateChange"; value: number }
  | { type: "onCurrentTime"; value: { currentTime: number; duration: number } }
  | { type: "onMute"; value: boolean }
  | { type: "onVolumeChange"; value: number }
  | { type: "onPlayerError"; value: { errorCode?: number; errorType?: string } };

export const TIKTOK_STATE_ENDED = 0;

/** A message from the player, or null for anything else arriving on `window`. */
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

/** Commands the host can send to the player. */
export type TikTokPlayerCommand = "play" | "pause" | "mute" | "unMute";

export function tiktokPlayerCommand(type: TikTokPlayerCommand): Record<string, unknown> {
  return { type, "x-tiktok-player": true };
}
