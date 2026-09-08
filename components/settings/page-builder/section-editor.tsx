"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ImagePicker } from "@/components/ui/image-picker";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import type { LandingSection } from "@/lib/types/landing-sections";

interface SectionEditorProps {
  section: LandingSection;
  onSave: (section: LandingSection) => void;
  onCancel: () => void;
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

function CardsEditor({
  label,
  cards,
  onChange,
  fields,
}: {
  label: string;
  cards: Array<Record<string, string>>;
  onChange: (cards: Array<Record<string, string>>) => void;
  fields: Array<{ key: string; label: string }>;
}) {
  const updateCard = (idx: number, key: string, value: string) => {
    const updated = [...cards];
    updated[idx] = { ...updated[idx], [key]: value };
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
                value={card[f.key] ?? ""}
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
}: {
  label: string;
  paragraphs: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {paragraphs.map((p, idx) => (
        <Textarea
          key={idx}
          value={p}
          onChange={(e) => {
            const updated = [...paragraphs];
            updated[idx] = e.target.value;
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

  const set = (key: string, value: unknown) => {
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
      if (!res.ok) throw new Error("Failed to save");
      const { section: updated } = await res.json();
      toast.success("Section updated");
      onSave(updated);
    } catch {
      toast.error("Failed to save section");
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
      case "hero":
        return (
          <>
            <ImageField label="Hero Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Title Prefix"><Input value={(content.titlePrefix as string) ?? ""} onChange={(e) => set("titlePrefix", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Title Emphasis"><Input value={(content.titleEmphasis as string) ?? ""} onChange={(e) => set("titleEmphasis", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Title Suffix"><Input value={(content.titleSuffix as string) ?? ""} onChange={(e) => set("titleSuffix", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Subtitle"><Textarea value={(content.subtitle as string) ?? ""} onChange={(e) => set("subtitle", e.target.value)} placeholder="i18n default" rows={2} /></Field>
          </>
        );

      case "text_image":
        return (
          <>
            <ImageField label="Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Title"><Input value={(content.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Description"><Textarea value={(content.description as string) ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="i18n default" rows={3} /></Field>
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
            <Field label="Title"><Input value={(content.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Subtitle"><Textarea value={(content.subtitle as string) ?? ""} onChange={(e) => set("subtitle", e.target.value)} placeholder="i18n default" rows={2} /></Field>
            <p className="text-xs text-muted-foreground">Product data and prices are fetched dynamically.</p>
          </>
        );

      case "neck_pains":
        return (
          <>
            <ImageField label="Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Title"><Input value={(content.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Description"><Textarea value={(content.description as string) ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="i18n default" rows={3} /></Field>
          </>
        );

      case "why_choose_highlights": {
        const cards = (content.cards as Array<Record<string, string>>) ?? [];
        return (
          <>
            {cards.length > 0 ? (
              <CardsEditor
                label="Cards"
                cards={cards}
                onChange={(v) => set("cards", v)}
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
            <Field label="Title"><Input value={(content.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Description"><Textarea value={(content.description as string) ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="i18n default" rows={3} /></Field>
            <Field label="Subtitle"><Input value={(content.subtitle as string) ?? ""} onChange={(e) => set("subtitle", e.target.value)} placeholder="i18n default" /></Field>
          </>
        );

      case "credibility": {
        const cards = (content.cards as Array<Record<string, string>>) ?? [];
        return (
          <>
            {cards.length > 0 ? (
              <CardsEditor
                label="Credibility Cards"
                cards={cards}
                onChange={(v) => set("cards", v)}
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
            <Field label="YouTube Video ID"><Input value={(content.videoId as string) ?? ""} onChange={(e) => set("videoId", e.target.value)} placeholder="e.g. nvFI6woJD9g" /></Field>
            <Field label="Title"><Input value={(content.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Subtitle"><Input value={(content.subtitle as string) ?? ""} onChange={(e) => set("subtitle", e.target.value)} placeholder="i18n default" /></Field>
          </>
        );

      case "founder_note":
        return (
          <>
            <ImageField label="Founder Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Title"><Input value={(content.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Subtitle"><Input value={(content.subtitle as string) ?? ""} onChange={(e) => set("subtitle", e.target.value)} placeholder="i18n default" /></Field>
            <ParagraphsEditor
              label="Paragraphs"
              paragraphs={(content.paragraphs as string[]) ?? []}
              onChange={(v) => set("paragraphs", v)}
            />
            <Field label="Name"><Input value={(content.name as string) ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="i18n default" /></Field>
            <Field label="Role"><Input value={(content.role as string) ?? ""} onChange={(e) => set("role", e.target.value)} placeholder="i18n default" /></Field>
          </>
        );

      // Custom section types
      case "custom_text_image":
        return (
          <>
            <ImageField label="Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Title"><Input value={(content.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Description"><Textarea value={(content.description as string) ?? ""} onChange={(e) => set("description", e.target.value)} rows={3} /></Field>
          </>
        );

      case "custom_full_width_image":
        return (
          <>
            <ImageField label="Image" value={(content.image as string) ?? ""} onChange={setImage} />
            <Field label="Alt Text"><Input value={(content.alt as string) ?? ""} onChange={(e) => set("alt", e.target.value)} /></Field>
          </>
        );

      case "custom_video":
        return (
          <>
            <Field label="YouTube Video ID"><Input value={(content.videoId as string) ?? ""} onChange={(e) => set("videoId", e.target.value)} /></Field>
            <Field label="Title"><Input value={(content.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Subtitle"><Input value={(content.subtitle as string) ?? ""} onChange={(e) => set("subtitle", e.target.value)} /></Field>
          </>
        );

      case "custom_rich_text":
        return (
          <>
            <Field label="Title"><Input value={(content.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Body (Markdown)"><Textarea value={(content.body as string) ?? ""} onChange={(e) => set("body", e.target.value)} rows={6} /></Field>
          </>
        );

      default:
        return <p className="text-sm text-muted-foreground">No editable fields for this section type.</p>;
    }
  };

  return (
    <div className="space-y-4 border-t pt-4">
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
