"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { MAX_TIKTOK_VIDEOS, isAllowedLinkUrl } from "@/lib/page-builder/link-rules";
import { readLocalisedField, writeLocalisedField, writeLocalisedValue } from "@/lib/page-builder/locale";
import { tiktokPostId } from "@/lib/tiktok/embed";

type Video = Record<string, unknown>;

/** What fits the card's three lines at phone width; longer still saves, up to the hard limit. */
const HOOK_GUIDE_CHARS = 50;

type LinkCheck =
  | { state: "checking" }
  | { state: "ok"; verified: boolean }
  | { state: "error"; message: string };

type Content = Record<string, unknown>;

interface TikTokVideosEditorProps {
  content: Content;
  locale: Locale;
  /** The section editor's state setter. Every write is functional, because the link check
   *  resolves after a network hop and must not overwrite edits made while it ran. */
  setContent: (update: (prev: Content) => Content) => void;
}

function asVideos(value: unknown): Video[] {
  return Array.isArray(value) ? (value as Video[]) : [];
}

/**
 * Inspector for a TikTok videos section. Each video needs three things before it
 * saves: its TikTok link, a cover from the media library, and the button link.
 */
export function TikTokVideosEditor({ content, locale, setContent }: TikTokVideosEditorProps) {
  const videos = asVideos(content.videos);
  const direction = content.direction === "right" ? "right" : "left";
  /** Keyed by the link as typed, so a check follows its row through reordering. */
  const [checks, setChecks] = useState<Record<string, LinkCheck>>({});

  const get = (key: string) => readLocalisedField(content, key, locale);
  const set = (key: string, value: string) => setContent((prev) => writeLocalisedField(prev, key, locale, value));
  const setRaw = (key: string, value: unknown) => setContent((prev) => ({ ...prev, [key]: value }));

  const write = (change: (list: Video[]) => Video[]) =>
    setContent((prev) => ({ ...prev, videos: change(asVideos(prev.videos)) }));
  const update = (idx: number, patch: (v: Video) => Video) =>
    write((list) => list.map((v, i) => (i === idx ? patch(v) : v)));
  const field = (idx: number, key: string, value: string) =>
    update(idx, (v) => writeLocalisedField(v, key, locale, value));
  const raw = (idx: number, key: string, value: unknown) => update(idx, (v) => ({ ...v, [key]: value }));

  const move = (idx: number, step: -1 | 1) =>
    write((list) => {
      const to = idx + step;
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      const [moved] = next.splice(idx, 1);
      next.splice(to, 0, moved);
      return next;
    });

  /** Follow share links and confirm TikTok will embed the post, then store the canonical link. */
  const checkLink = async (typed: string) => {
    const value = typed.trim();
    if (value === "") return;
    setChecks((c) => ({ ...c, [value]: { state: "checking" } }));
    try {
      const res = await fetch("/api/tiktok/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; url: string; verified: boolean }
        | { ok: false; error: string }
        | null;
      if (!body) throw new Error("Couldn't check the link.");
      if (!body.ok) {
        setChecks((c) => ({ ...c, [value]: { state: "error", message: body.error } }));
        return;
      }
      setChecks((c) => ({ ...c, [value]: { state: "ok", verified: body.verified }, [body.url]: { state: "ok", verified: body.verified } }));
      // Match the row by the link it still holds: it may have moved, or been edited, meanwhile.
      if (body.url !== value) {
        write((list) => list.map((v) => (v.tiktokUrl === typed ? { ...v, tiktokUrl: body.url } : v)));
      }
    } catch (err) {
      setChecks((c) => ({
        ...c,
        [value]: { state: "error", message: err instanceof Error ? err.message : "Couldn't check the link." },
      }));
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Title</Label>
        <Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="Seen on TikTok" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Subtitle</Label>
        <Textarea value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} placeholder="Tap a video to watch it here." rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Scroll direction</Label>
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Scroll direction">
          {(["left", "right"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRaw("direction", d)}
              aria-pressed={direction === d}
              className={`min-h-8 rounded px-3 text-xs font-medium transition-colors ${
                direction === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d === "left" ? "To the left" : "To the right"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <Label className="text-sm font-medium">Videos</Label>
          <span className="text-xs text-muted-foreground">
            {videos.length} of {MAX_TIKTOK_VIDEOS} · 6 to 10 works best
          </span>
        </div>

        {videos.length === 0 && (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            No videos yet. Add one, paste its TikTok link, pick a cover and say where its button goes.
            The section stays hidden on the page until it has a video.
          </p>
        )}

        {videos.map((video, idx) => {
          const link = typeof video.tiktokUrl === "string" ? video.tiktokUrl : "";
          const check = link ? checks[link.trim()] : undefined;
          const parsedId = tiktokPostId(link);
          const cover = typeof video.image === "string" ? video.image : "";
          const buttonUrl = typeof video.buttonUrl === "string" ? video.buttonUrl : "";
          const hook = readLocalisedField(video, "hook", locale);
          const buttonUrlBad = buttonUrl.trim() !== "" && !isAllowedLinkUrl(buttonUrl);

          return (
            <div key={idx} className="space-y-3 rounded-lg border p-3" data-tiktok-video-row="">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Video {idx + 1}</span>
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    aria-label={`Move video ${idx + 1} up`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === videos.length - 1}
                    aria-label={`Move video ${idx + 1} down`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => write((list) => list.filter((_, i) => i !== idx))}
                    aria-label={`Remove video ${idx + 1}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">TikTok link</Label>
                <Input
                  value={link}
                  onChange={(e) => raw(idx, "tiktokUrl", e.target.value)}
                  onBlur={(e) => checkLink(e.target.value)}
                  placeholder="https://www.tiktok.com/@thempillow/video/…"
                  inputMode="url"
                />
                {check?.state === "checking" ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking with TikTok…
                  </p>
                ) : check?.state === "error" ? (
                  <p className="text-xs text-destructive">{check.message}</p>
                ) : check?.state === "ok" ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    {check.verified ? "Found on TikTok." : "Link looks right; TikTok didn't answer, so check it plays in the preview."}
                    <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                ) : link && !parsedId ? (
                  <p className="text-xs text-muted-foreground">Share links are fine; they&apos;re checked when you leave the field.</p>
                ) : null}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Cover image</Label>
                <div className="flex items-start gap-3">
                  <div className="relative aspect-[9/16] w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                    {cover ? (
                      <img src={cover} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <ImagePicker
                      onSelect={(s) =>
                        update(idx, (v) => {
                          const next: Video = { ...v, image: s.url, media_asset_id: s.assetId ?? null };
                          // Library alt text is English copy.
                          if (s.alt) next.alt = writeLocalisedValue(v.alt, DEFAULT_LOCALE, s.alt);
                          return next;
                        })
                      }
                    >
                      <Button type="button" variant="outline" size="sm">
                        {cover ? "Change cover" : "Pick cover"}
                      </Button>
                    </ImagePicker>
                    <p className="text-xs text-muted-foreground">
                      Tall (9:16). Use the frame that makes people want to tap.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Cover alt text</Label>
                <Input value={readLocalisedField(video, "alt", locale)} onChange={(e) => field(idx, "alt", e.target.value)} placeholder="What the cover shows" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Hook on the card</Label>
                <Input value={hook} onChange={(e) => field(idx, "hook", e.target.value)} placeholder="e.g. Two weeks with a pillow made for her" />
                {locale === DEFAULT_LOCALE && hook.length > 0 && (
                  <p className={`text-xs tabular-nums ${hook.length > HOOK_GUIDE_CHARS ? "text-amber-600" : "text-muted-foreground"}`}>
                    {hook.length}/{HOOK_GUIDE_CHARS} characters{hook.length > HOOK_GUIDE_CHARS ? " — may be cut off on phones" : ""}
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Button label</Label>
                  <Input value={readLocalisedField(video, "buttonLabel", locale)} onChange={(e) => field(idx, "buttonLabel", e.target.value)} placeholder="Shop now" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Button link (required)</Label>
                  <Input
                    value={buttonUrl}
                    onChange={(e) => raw(idx, "buttonUrl", e.target.value)}
                    placeholder="/shop or https://…"
                    aria-invalid={buttonUrlBad || undefined}
                    inputMode="url"
                  />
                  {buttonUrlBad && <p className="text-xs text-destructive">Start with / for a page here, or https://.</p>}
                </div>
              </div>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={videos.length >= MAX_TIKTOK_VIDEOS}
          onClick={() => write((list) => [...list, {}])}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add video
        </Button>
      </div>
    </div>
  );
}
