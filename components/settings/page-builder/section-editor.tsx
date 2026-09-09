"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ImagePicker } from "@/components/ui/image-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SUPPORTED_LOCALES, type Locale, DEFAULT_LOCALE } from "@/lib/i18n/locales";
import {
  HERO_H1_CHAR_BAND,
  HERO_H1_WORD_BAND,
  HERO_SUBTITLE_BAND,
  measure,
  type CopyBand,
} from "@/lib/i18n/copy-bands";
import {
  readLocalisedField,
  readLocalisedValue,
  writeLocalisedField,
  writeLocalisedValue,
} from "@/lib/page-builder/locale";
import { getMessages } from "@/lib/i18n/messages";
import type { LandingSection } from "@/lib/types/landing-sections";

interface SectionEditorProps {
  section: LandingSection;
  onSave: (section: LandingSection) => void;
  onCancel: () => void;
  /**
   * Lifts dirtiness to the shell. `beforeunload` only covers reloads and tab closes —
   * the App Router has no navigation-blocking API — so selecting another section, which
   * remounts this editor, has to be guarded by the shell instead.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

const LOCALE_LABELS: Record<Locale, string> = {
  "en-US": "EN",
  "zh-CN": "中文",
};

/**
 * Live count against a copy-fit band (CONTEXT.md "Copy fit"), so an operator compresses
 * while typing rather than after the save is refused. Bands are en-US only, matching the
 * server gate — whitespace word counts are meaningless for Chinese.
 */
function BandMeter({ text, band, locale }: { text: string; band: CopyBand; locale: Locale }) {
  if (locale !== DEFAULT_LOCALE) return null;
  const value = measure(text, band.unit);
  if (value === 0) return null;

  const over = value > band.max;
  const under = band.min !== undefined && value < band.min;
  const pct = Math.min(100, Math.round((value / band.max) * 100));

  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${
            over ? "bg-destructive" : under ? "bg-amber-500" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`shrink-0 text-xs tabular-nums ${
          over ? "font-medium text-destructive" : "text-muted-foreground"
        }`}
      >
        {value}/{band.max} {band.unit}
        {over ? " — too long" : under ? ` — min ${band.min}` : ""}
      </span>
    </div>
  );
}

/** Key-order-independent stringify, for comparing a local object against a jsonb row. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

function ImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  /** `assetId`/`alt` are undefined when the operator typed a URL, so callers keep theirs. */
  onChange: (url: string, assetId?: string | null, alt?: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Image URL or pick from media..."
          className="flex-1"
        />
        <ImagePicker onSelect={(s) => onChange(s.url, s.assetId, s.alt)}>
          <Button type="button" variant="outline" size="sm">Browse</Button>
        </ImagePicker>
      </div>
      {value && (
        <div className="mt-2 relative h-24 w-40 overflow-hidden rounded-md border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Preview" className="h-full w-full object-cover" />
        </div>
      )}
    </div>
  );
}

/**
 * Cards are stored as an array of records whose text values may be locale maps, so each
 * cell reads and writes through the locale helpers rather than touching the raw value.
 */
function CardsEditor({
  label,
  cards,
  onChange,
  fields,
  locale,
}: {
  label: string;
  cards: Array<Record<string, unknown>>;
  onChange: (cards: Array<Record<string, unknown>>) => void;
  fields: Array<{ key: string; label: string }>;
  locale: Locale;
}) {
  const updateCard = (idx: number, key: string, value: string) => {
    const updated = [...cards];
    updated[idx] = writeLocalisedField(updated[idx] ?? {}, key, locale, value);
    onChange(updated);
  };

  const move = (idx: number, direction: -1 | 1) => {
    const to = idx + direction;
    if (to < 0 || to >= cards.length) return;
    const updated = [...cards];
    const [moved] = updated.splice(idx, 1);
    updated.splice(to, 0, moved);
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>
      {cards.map((card, idx) => (
        <div key={idx} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Card {idx + 1}</span>
            <span className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                aria-label={`Move card ${idx + 1} up`}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === cards.length - 1}
                aria-label={`Move card ${idx + 1} down`}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onChange(cards.filter((_, i) => i !== idx))}
                aria-label={`Remove card ${idx + 1}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
          {fields.map((f) => (
            <div key={f.key}>
              <Label className="text-xs">{f.label}</Label>
              <Input
                value={readLocalisedField(card, f.key, locale)}
                onChange={(e) => updateCard(idx, f.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...cards, {}])}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add card
      </Button>
    </div>
  );
}

function ParagraphsEditor({
  label,
  paragraphs,
  onChange,
  locale,
}: {
  label: string;
  paragraphs: unknown[];
  onChange: (v: unknown[]) => void;
  locale: Locale;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {paragraphs.map((p, idx) => (
        <div key={idx} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Paragraph {idx + 1}</span>
            <span className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  if (idx === 0) return;
                  const updated = [...paragraphs];
                  const [moved] = updated.splice(idx, 1);
                  updated.splice(idx - 1, 0, moved);
                  onChange(updated);
                }}
                disabled={idx === 0}
                aria-label={`Move paragraph ${idx + 1} up`}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (idx === paragraphs.length - 1) return;
                  const updated = [...paragraphs];
                  const [moved] = updated.splice(idx, 1);
                  updated.splice(idx + 1, 0, moved);
                  onChange(updated);
                }}
                disabled={idx === paragraphs.length - 1}
                aria-label={`Move paragraph ${idx + 1} down`}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onChange(paragraphs.filter((_, i) => i !== idx))}
                aria-label={`Remove paragraph ${idx + 1}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
          <Textarea
            value={readLocalisedValue(p, locale)}
            onChange={(e) => {
              const updated = [...paragraphs];
              updated[idx] = writeLocalisedValue(p, locale, e.target.value) ?? "";
              onChange(updated);
            }}
            rows={3}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...paragraphs, ""])}
      >
        + Add paragraph
      </Button>
    </div>
  );
}

/**
 * Card sections used to say "edit to override" while the card array defaulted to empty,
 * so there was no way to start — the two card sections were uneditable in practice.
 */
function SeedCardsPrompt({ onSeed }: { onSeed: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-sm text-muted-foreground">
        Showing the built-in cards. Start from them to make your own edits.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onSeed}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Edit these cards
      </Button>
    </div>
  );
}

export function SectionEditor({ section, onSave, onCancel, onDirtyChange }: SectionEditorProps) {
  const [content, setContent] = useState<Record<string, unknown>>({ ...section.content });
  /**
   * Which language the form is bound to. One switch per section rather than per field:
   * a per-field toggle would have to be threaded through every branch below plus the
   * card and paragraph sub-editors, which take arrays rather than scalars.
   */
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [confirming, setConfirming] = useState<null | "reset">(null);

  // Canonical compare: `section.content` round-trips through a jsonb column, which sorts
  // keys, while the local object keeps insertion order. A plain stringify diverges the
  // moment a shorter key is added — e.g. adding `alt` to {image,title,description} — and
  // `dirty` would then stay true forever, arming the unload guard on a saved section.
  const dirty = stableStringify(content) !== stableStringify(section.content ?? {});

  /**
   * Unsaved edits used to vanish silently when the operator navigated away or collapsed
   * the section. The browser prompt is the only thing that survives a real navigation.
   */
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Also reset the shell's flag when this editor goes away.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Read a text field as it should appear for the language being edited. */
  const get = (key: string) => readLocalisedField(content, key, locale);

  /** Write a text field under the language being edited, preserving the other one. */
  const set = (key: string, value: string) => {
    setContent((prev) => writeLocalisedField(prev, key, locale, value));
  };

  /** Non-localised values (images, ids, numbers, booleans) are written as-is. */
  const setRaw = (key: string, value: unknown) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * Typing a URL used to pass a null asset id, silently downgrading a tracked Media
   * Asset to an untracked string and breaking the DAM's used/unused count. The id and
   * alt text now change only when the operator actually picks from the library.
   */
  const setImage = (url: string, assetId?: string | null, alt?: string | null) => {
    setContent((prev) => {
      const next: Record<string, unknown> = { ...prev, image: url };
      if (assetId !== undefined) {
        next.media_asset_id = assetId;
      } else if (url !== prev.image) {
        // Typed a different URL: it is no longer the picked asset, and leaving the id
        // behind would make the DAM mark the wrong asset as Used.
        next.media_asset_id = null;
      }
      // The library's alt text is English copy, so it belongs in the default locale
      // rather than whichever language the form happens to be showing.
      if (alt) next.alt = writeLocalisedValue(prev.alt, DEFAULT_LOCALE, alt);
      return next;
    });
  };

  /** Seed a card list from the i18n defaults, so overriding is not a blank slate. */
  const seedCards = (defaults: Array<Record<string, string>>) => {
    setContent((prev) => ({
      ...prev,
      cards: defaults.map((card) => {
        let seeded: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(card)) {
          seeded = writeLocalisedField(seeded, key, locale, value);
        }
        return seeded;
      }),
    }));
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/landing-sections/${section.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(
          typeof err?.error === "string" ? err.error : "Failed to save section",
        );
      }
      const { section: updated } = await res.json();
      toast.success("Section updated");
      onSave(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save section");
    }
  };

  const handleReset = async () => {
    setConfirming(null);
    try {
      const res = await fetch(`/api/landing-sections/${section.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: {} }),
      });
      if (!res.ok) throw new Error("Failed to reset");
      const { section: updated } = await res.json();
      setContent({});
      toast.success("Section reset to defaults");
      onSave(updated);
    } catch {
      toast.error("Failed to reset section");
    }
  };

  const renderFields = () => {
    switch (section.section_type) {
      case "hero": {
        // The <h1> is the three title fields concatenated, so the band applies to the
        // composed string — metering each part alone would be misleading.
        const sep = locale === "zh-CN" ? "" : " ";
        const h1 = [get("titlePrefix"), get("titleEmphasis"), get("titleSuffix")]
          .filter((p) => p.trim() !== "")
          .join(sep)
          .trim();
        return (
          <>
            <ImageField label="Hero Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Image Alt Text"><Input value={get("alt")} onChange={(e) => set("alt", e.target.value)} placeholder="Describes the image for screen readers" /></Field>
            <Field label="Title Prefix"><Input value={get("titlePrefix")} onChange={(e) => set("titlePrefix", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Title Emphasis"><Input value={get("titleEmphasis")} onChange={(e) => set("titleEmphasis", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Title Suffix"><Input value={get("titleSuffix")} onChange={(e) => set("titleSuffix", e.target.value)} placeholder="i18n default" /></Field>
            {h1 !== "" && (
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Headline (all three fields together)</p>
                <BandMeter text={h1} band={HERO_H1_WORD_BAND} locale={locale} />
                <BandMeter text={h1} band={HERO_H1_CHAR_BAND} locale={locale} />
              </div>
            )}
            <Field label="Subtitle">
              <Textarea value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} placeholder="i18n default" rows={2} />
              <BandMeter text={get("subtitle")} band={HERO_SUBTITLE_BAND} locale={locale} />
            </Field>
            <Field label="Customise Button Label"><Input value={get("ctaCustomiseLabel")} onChange={(e) => set("ctaCustomiseLabel", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Book Appointment Button Label"><Input value={get("ctaBookLabel")} onChange={(e) => set("ctaBookLabel", e.target.value)} placeholder="i18n default" /></Field>
          </>
        );
      }

      case "text_image":
        return (
          <>
            <ImageField label="Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Image Alt Text"><Input value={get("alt")} onChange={(e) => set("alt", e.target.value)} placeholder="Defaults to the title" /></Field>
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Description"><Textarea value={get("description")} onChange={(e) => set("description", e.target.value)} placeholder="i18n default" rows={3} /></Field>
          </>
        );

      case "marquee":
        return (
          <ImageField label="Marquee Image" value={(content.image as string) ?? ""} onChange={setImage} />
        );

      case "stories":
        return <p className="text-sm text-muted-foreground">This section is driven by customer reviews and has no editable content.</p>;

      case "faq":
        return (
          <p className="text-sm text-muted-foreground" data-page-builder-faq-hint="">
            Questions and answers are managed in Settings → FAQ → Page FAQs (Home surface). This section only controls placement and visibility.
          </p>
        );

      case "pick_your_mpillow":
        return (
          <>
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Subtitle"><Textarea value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} placeholder="i18n default" rows={2} /></Field>
            <p className="text-xs text-muted-foreground">Product data and prices are fetched dynamically.</p>
          </>
        );

      case "neck_pains":
        return (
          <>
            <ImageField label="Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Image Alt Text"><Input value={get("alt")} onChange={(e) => set("alt", e.target.value)} placeholder="Defaults to the title" /></Field>
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Description"><Textarea value={get("description")} onChange={(e) => set("description", e.target.value)} placeholder="i18n default" rows={3} /></Field>
          </>
        );

      case "why_choose_highlights": {
        const cards = (content.cards as Array<Record<string, unknown>>) ?? [];
        return (
          <>
            {cards.length > 0 ? (
              <CardsEditor
                label="Cards"
                cards={cards}
                onChange={(v) => setRaw("cards", v)}
                locale={locale}
                fields={[
                  { key: "label", label: "Label" },
                  { key: "title", label: "Title" },
                  { key: "description", label: "Description" },
                ]}
              />
            ) : (
              <SeedCardsPrompt
                onSeed={() => seedCards(getMessages(locale).home.whyChoose.cards)}
              />
            )}
          </>
        );
      }

      case "product_card":
        return (
          <>
            <ImageField label="Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Description"><Textarea value={get("description")} onChange={(e) => set("description", e.target.value)} placeholder="i18n default" rows={3} /></Field>
            <Field label="Subtitle"><Input value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} placeholder="i18n default" /></Field>
          </>
        );

      case "credibility": {
        const cards = (content.cards as Array<Record<string, unknown>>) ?? [];
        return (
          <>
            {cards.length > 0 ? (
              <CardsEditor
                label="Credibility Cards"
                cards={cards}
                onChange={(v) => setRaw("cards", v)}
                locale={locale}
                fields={[
                  { key: "title", label: "Title" },
                  { key: "description", label: "Description" },
                ]}
              />
            ) : (
              <SeedCardsPrompt
                onSeed={() => seedCards(getMessages(locale).home.credibility.cards)}
              />
            )}
          </>
        );
      }

      case "video_embed":
        return (
          <>
            <Field label="YouTube Video ID"><Input value={(content.videoId as string) ?? ""} onChange={(e) => setRaw("videoId", e.target.value)} placeholder="e.g. nvFI6woJD9g" /></Field>
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Subtitle"><Input value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} placeholder="i18n default" /></Field>
          </>
        );

      case "founder_note":
        return (
          <>
            <ImageField label="Founder Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Subtitle"><Input value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} placeholder="i18n default" /></Field>
            <ParagraphsEditor
              label="Paragraphs"
              paragraphs={(content.paragraphs as unknown[]) ?? []}
              onChange={(v) => setRaw("paragraphs", v)}
              locale={locale}
            />
            <Field label="Name"><Input value={get("name")} onChange={(e) => set("name", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Role"><Input value={get("role")} onChange={(e) => set("role", e.target.value)} placeholder="i18n default" /></Field>
          </>
        );

      // Custom section types
      case "custom_text_image":
        return (
          <>
            <ImageField label="Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Description"><Textarea value={get("description")} onChange={(e) => set("description", e.target.value)} rows={3} /></Field>
          </>
        );

      case "custom_full_width_image":
        return (
          <>
            <ImageField label="Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Alt Text"><Input value={get("alt")} onChange={(e) => set("alt", e.target.value)} /></Field>
          </>
        );

      case "custom_video":
        return (
          <>
            <Field label="YouTube Video ID"><Input value={(content.videoId as string) ?? ""} onChange={(e) => setRaw("videoId", e.target.value)} /></Field>
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Subtitle"><Input value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} /></Field>
          </>
        );

      case "custom_rich_text":
        return (
          <>
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Body (Markdown)"><Textarea value={get("body")} onChange={(e) => set("body", e.target.value)} rows={6} /></Field>
          </>
        );

      case "shop_cta":
        return (
          <>
            <ImageField label="Background Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Subtitle"><Textarea value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} rows={2} /></Field>
            <Field label="Button Label"><Input value={get("buttonLabel")} onChange={(e) => set("buttonLabel", e.target.value)} placeholder="Shop now" /></Field>
            <Field label="Button URL">
              <Input
                value={(content.buttonUrl as string) ?? ""}
                onChange={(e) => setRaw("buttonUrl", e.target.value)}
                placeholder="Defaults to /shop"
              />
            </Field>
          </>
        );

      case "featured_products":
        return (
          <>
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Subtitle"><Textarea value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} rows={2} /></Field>
            <Field label="Maximum products">
              <Input
                type="number"
                min={1}
                max={12}
                value={(content.limit as number) ?? 4}
                onChange={(e) => setRaw("limit", Number(e.target.value) || 4)}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Products come from the shop — anything marked Featured and active.
            </p>
          </>
        );

      default:
        return <p className="text-sm text-muted-foreground">No editable fields for this section type.</p>;
    }
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Language</Label>
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Editing language">
          {SUPPORTED_LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
              className={`min-h-8 rounded px-2.5 text-xs font-medium transition-colors ${
                locale === code
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {LOCALE_LABELS[code]}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          Empty fields fall back to the translated default.
        </span>
      </div>

      {renderFields()}

      <div className="flex items-center gap-2 pt-2">
        <Button onClick={handleSave} size="sm" disabled={!dirty}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {dirty ? "Save" : "Saved"}
        </Button>
        <Button
          onClick={() => {
            if (dirty && !window.confirm("Discard your unsaved edits to this section?")) return;
            onCancel();
          }}
          variant="outline"
          size="sm"
        >
          Cancel
        </Button>
        <Button
          onClick={() => setConfirming("reset")}
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset to default
        </Button>
      </div>

      {/* Reset is destructive and used to fire with no confirmation at all. */}
      <Dialog open={confirming === "reset"} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset this section to its defaults?</DialogTitle>
            <DialogDescription>
              Every override on this section is cleared, in both languages, and it falls back
              to the built-in copy and images. It stays a draft until you publish.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleReset}>
              Reset section
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
