"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ImagePicker } from "@/components/ui/image-picker";
import { TikTokVideosEditor } from "@/components/settings/page-builder/tiktok-videos-editor";
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
  onDirtyChange?: (dirty: boolean) => void;
}

const LOCALE_LABELS: Record<Locale, string> = {
  "en-US": "EN",
  "zh-CN": "中文",
};

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
        {over ? " (too long)" : under ? ` (min ${band.min})` : ""}
      </span>
    </div>
  );
}

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
  onChange: (url: string, assetId?: string | null, alt?: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Image URL or pick from media…"
          className="flex-1"
        />
        <ImagePicker onSelect={(s) => onChange(s.url, s.assetId, s.alt)}>
          <Button type="button" variant="outline" size="sm">Browse</Button>
        </ImagePicker>
      </div>
      {value && (
        <div className="mt-2 relative h-24 w-40 overflow-hidden rounded-md border bg-muted">
          <img src={value} alt="Preview" className="h-full w-full object-cover" />
        </div>
      )}
    </div>
  );
}

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
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [confirming, setConfirming] = useState<null | "reset">(null);

  const dirty = stableStringify(content) !== stableStringify(section.content ?? {});

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

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

  const get = (key: string) => readLocalisedField(content, key, locale);

  const set = (key: string, value: string) => {
    setContent((prev) => writeLocalisedField(prev, key, locale, value));
  };

  const setRaw = (key: string, value: unknown) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  };

  const setImage = (url: string, assetId?: string | null, alt?: string | null) => {
    setContent((prev) => {
      const next: Record<string, unknown> = { ...prev, image: url };
      if (assetId !== undefined) {
        next.media_asset_id = assetId;
      } else if (url !== prev.image) {
        next.media_asset_id = null;
      }
      if (alt) next.alt = writeLocalisedValue(prev.alt, DEFAULT_LOCALE, alt);
      return next;
    });
  };

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
          typeof err?.error === "string" ? err.error : "Couldn't save the section.",
        );
      }
      const { section: updated } = await res.json();
      toast.success("Section updated");
      onSave(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the section.");
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
      toast.error("Couldn't reset the section.");
    }
  };

  const renderFields = () => {
    switch (section.section_type) {
      case "hero": {
        const sep = locale === "zh-CN" ? "" : " ";
        const h1 = [get("titlePrefix"), get("titleEmphasis"), get("titleSuffix")]
          .filter((p) => p.trim() !== "")
          .join(sep)
          .trim();
        return (
          <>
            <ImageField label="Hero image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Image alt text"><Input value={get("alt")} onChange={(e) => set("alt", e.target.value)} placeholder="Describes the image for screen readers" /></Field>
            <Field label="Title prefix"><Input value={get("titlePrefix")} onChange={(e) => set("titlePrefix", e.target.value)} placeholder="Default copy" /></Field>
            <Field label="Title emphasis"><Input value={get("titleEmphasis")} onChange={(e) => set("titleEmphasis", e.target.value)} placeholder="Default copy" /></Field>
            <Field label="Title suffix"><Input value={get("titleSuffix")} onChange={(e) => set("titleSuffix", e.target.value)} placeholder="Default copy" /></Field>
            {h1 !== "" && (
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Headline (all three fields together)</p>
                <BandMeter text={h1} band={HERO_H1_WORD_BAND} locale={locale} />
                <BandMeter text={h1} band={HERO_H1_CHAR_BAND} locale={locale} />
              </div>
            )}
            <Field label="Subtitle">
              <Textarea value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} placeholder="Default copy" rows={2} />
              <BandMeter text={get("subtitle")} band={HERO_SUBTITLE_BAND} locale={locale} />
            </Field>
            <Field label="Customise button label"><Input value={get("ctaCustomiseLabel")} onChange={(e) => set("ctaCustomiseLabel", e.target.value)} placeholder="Default copy" /></Field>
            <Field label="Book appointment button label"><Input value={get("ctaBookLabel")} onChange={(e) => set("ctaBookLabel", e.target.value)} placeholder="Default copy" /></Field>
          </>
        );
      }

      case "text_image":
        return (
          <>
            <ImageField label="Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Image alt text"><Input value={get("alt")} onChange={(e) => set("alt", e.target.value)} placeholder="Defaults to the title" /></Field>
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="Default copy" /></Field>
            <Field label="Description"><Textarea value={get("description")} onChange={(e) => set("description", e.target.value)} placeholder="Default copy" rows={3} /></Field>
          </>
        );

      case "marquee":
        return (
          <ImageField label="Marquee image" value={(content.image as string) ?? ""} onChange={setImage} />
        );

      case "stories":
        return <p className="text-sm text-muted-foreground">This section is driven by customer reviews and has no editable content.</p>;

      case "faq":
        return (
          <p className="text-sm text-muted-foreground" data-page-builder-faq-hint="">
            Questions and answers live on the FAQ page, in the Page FAQs tab (Home). This section only sets where it sits and whether it shows.
          </p>
        );

      case "pick_your_mpillow":
        return (
          <>
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="Default copy" /></Field>
            <Field label="Subtitle"><Textarea value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} placeholder="Default copy" rows={2} /></Field>
            <p className="text-xs text-muted-foreground">Products and prices come from the shop.</p>
          </>
        );

      case "neck_pains":
        return (
          <>
            <ImageField label="Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Image alt text"><Input value={get("alt")} onChange={(e) => set("alt", e.target.value)} placeholder="Defaults to the title" /></Field>
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="Default copy" /></Field>
            <Field label="Description"><Textarea value={get("description")} onChange={(e) => set("description", e.target.value)} placeholder="Default copy" rows={3} /></Field>
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
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="Default copy" /></Field>
            <Field label="Description"><Textarea value={get("description")} onChange={(e) => set("description", e.target.value)} placeholder="Default copy" rows={3} /></Field>
            <Field label="Subtitle"><Input value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} placeholder="Default copy" /></Field>
          </>
        );

      case "credibility": {
        const cards = (content.cards as Array<Record<string, unknown>>) ?? [];
        return (
          <>
            {cards.length > 0 ? (
              <CardsEditor
                label="Credibility cards"
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
            <Field label="YouTube video ID"><Input value={(content.videoId as string) ?? ""} onChange={(e) => setRaw("videoId", e.target.value)} placeholder="e.g. nvFI6woJD9g" /></Field>
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="Default copy" /></Field>
            <Field label="Subtitle"><Input value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} placeholder="Default copy" /></Field>
          </>
        );

      case "founder_note":
        return (
          <>
            <ImageField label="Founder image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="Default copy" /></Field>
            <Field label="Subtitle"><Input value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} placeholder="Default copy" /></Field>
            <ParagraphsEditor
              label="Paragraphs"
              paragraphs={(content.paragraphs as unknown[]) ?? []}
              onChange={(v) => setRaw("paragraphs", v)}
              locale={locale}
            />
            <Field label="Name"><Input value={get("name")} onChange={(e) => set("name", e.target.value)} placeholder="Default copy" /></Field>
            <Field label="Role"><Input value={get("role")} onChange={(e) => set("role", e.target.value)} placeholder="Default copy" /></Field>
          </>
        );

      case "explore":
        return (
          <>
            <ImageField label="Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Alt text"><Input value={get("alt")} onChange={(e) => set("alt", e.target.value)} placeholder="Default copy" /></Field>
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="Default copy" /></Field>
            <Field label="Text"><Textarea value={get("body")} onChange={(e) => set("body", e.target.value)} placeholder="Default copy" rows={2} /></Field>
            <Field label="Button label"><Input value={get("buttonLabel")} onChange={(e) => set("buttonLabel", e.target.value)} placeholder="Default copy" /></Field>
            <p className="text-xs text-muted-foreground">
              Leads to the Explore page. Empty fields use the default still of its scenery and the default copy for the language.
            </p>
          </>
        );

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
            <Field label="Alt text"><Input value={get("alt")} onChange={(e) => set("alt", e.target.value)} /></Field>
          </>
        );

      case "custom_video":
        return (
          <>
            <Field label="YouTube video ID"><Input value={(content.videoId as string) ?? ""} onChange={(e) => setRaw("videoId", e.target.value)} /></Field>
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
            <ImageField label="Background image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Subtitle"><Textarea value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} rows={2} /></Field>
            <Field label="Button label"><Input value={get("buttonLabel")} onChange={(e) => set("buttonLabel", e.target.value)} placeholder="Shop now" /></Field>
            <Field label="Button URL">
              <Input
                value={(content.buttonUrl as string) ?? ""}
                onChange={(e) => setRaw("buttonUrl", e.target.value)}
                placeholder="Defaults to /shop"
              />
            </Field>
          </>
        );

      case "delivery_estimator":
        return (
          <>
            <Field label="Title"><Input value={get("title")} onChange={(e) => set("title", e.target.value)} placeholder="Delivery to your door" /></Field>
            <Field label="Subtitle"><Textarea value={get("subtitle")} onChange={(e) => set("subtitle", e.target.value)} rows={2} /></Field>
            <p className="text-xs text-muted-foreground">
              Rates and couriers come from the Shipping page. Empty fields use the default copy for the language.
            </p>
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
              Products come from the shop: anything that&apos;s active and marked Featured.
            </p>
          </>
        );

      case "tiktok_videos":
        return <TikTokVideosEditor content={content} locale={locale} setContent={setContent} />;

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
