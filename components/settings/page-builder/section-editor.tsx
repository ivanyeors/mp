"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ImagePicker } from "@/components/ui/image-picker";
import { RotateCcw, Save } from "lucide-react";
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
import type { LandingSection } from "@/lib/types/landing-sections";

interface SectionEditorProps {
  section: LandingSection;
  onSave: (section: LandingSection) => void;
  onCancel: () => void;
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
  onChange: (url: string, assetId: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value, null)}
          placeholder="Image URL or pick from media..."
          className="flex-1"
        />
        <ImagePicker onSelect={(s) => onChange(s.url, s.assetId)}>
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

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>
      {cards.map((card, idx) => (
        <div key={idx} className="rounded-lg border p-3 space-y-2">
          <span className="text-xs text-muted-foreground">Card {idx + 1}</span>
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
        <Textarea
          key={idx}
          value={readLocalisedValue(p, locale)}
          onChange={(e) => {
            const updated = [...paragraphs];
            updated[idx] = writeLocalisedValue(p, locale, e.target.value) ?? "";
            onChange(updated);
          }}
          rows={3}
        />
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

export function SectionEditor({ section, onSave, onCancel }: SectionEditorProps) {
  const [content, setContent] = useState<Record<string, unknown>>({ ...section.content });
  /**
   * Which language the form is bound to. One switch per section rather than per field:
   * a per-field toggle would have to be threaded through every branch below plus the
   * card and paragraph sub-editors, which take arrays rather than scalars.
   */
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

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

  const setImage = (url: string, assetId: string | null) => {
    setContent((prev) => ({ ...prev, image: url, media_asset_id: assetId }));
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
          </>
        );
      }

      case "text_image":
        return (
          <>
            <ImageField label="Image" value={(content.image as string) ?? ""} onChange={setImage} />
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
              <p className="text-sm text-muted-foreground">Using default cards from i18n. Edit to override.</p>
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
              <p className="text-sm text-muted-foreground">Using default cards from i18n. Edit to override.</p>
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
        <Button onClick={handleSave} size="sm">
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Save
        </Button>
        <Button onClick={onCancel} variant="outline" size="sm">
          Cancel
        </Button>
        <Button onClick={handleReset} variant="ghost" size="sm" className="ml-auto text-muted-foreground">
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset to default
        </Button>
      </div>
    </div>
  );
}
