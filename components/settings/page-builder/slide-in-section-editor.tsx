"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ImageIcon, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImagePicker } from "@/components/ui/image-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import type { ImageMediaConfig } from "@/lib/product-slide-sections/types";
import {
  HEADER_SLUG,
  headerDefaults,
  resolveSectionDefaults,
  VIDEO_ID_PATTERN,
  type MediaOverride,
  type SlideInSectionContent,
} from "@/lib/slide-in-pages/content";
import {
  FIXED_CONTENT_NOTES,
  mediaFieldsFor,
  visibleCopyFields,
  type CopyField,
  type MediaField,
  type SubField,
} from "@/lib/slide-in-pages/fields";
import { slideMessages, SLIDE_IN_PAGES, type SlideInPageKey } from "@/lib/slide-in-pages/pages";
import type { SlideInSectionView } from "@/lib/slide-in-pages/sections";

const LOCALE_LABELS: Record<Locale, string> = { "en-US": "EN", "zh-CN": "中文" };

type Copy = Record<string, unknown>;

/** Key-order-independent stringify, for comparing local state against a jsonb row. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value ?? {}, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Drop empty copy and media so "cleared" means "back to the default", and storage stays small. */
function normalise(content: SlideInSectionContent): SlideInSectionContent {
  const out: SlideInSectionContent = {};
  const copy: NonNullable<SlideInSectionContent["copy"]> = {};
  for (const locale of SUPPORTED_LOCALES) {
    const record = asRecord(content.copy?.[locale]);
    const kept = Object.fromEntries(
      Object.entries(record).filter(([, v]) => (typeof v === "string" ? v !== "" : v != null)),
    );
    if (Object.keys(kept).length > 0) copy[locale] = kept;
  }
  if (Object.keys(copy).length > 0) out.copy = copy;
  const media = Object.fromEntries(
    Object.entries(asRecord(content.media)).filter(([, v]) => {
      if (typeof v === "string") return v.trim() !== "";
      if (Array.isArray(v)) return v.some((item) => item != null);
      return v != null;
    }),
  );
  if (Object.keys(media).length > 0) out.media = media;
  return out;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground disabled:opacity-30 ${
        destructive ? "hover:text-destructive" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** "Showing the built-in …" with a button to start editing from it. */
function SeedPrompt({ summary, onSeed, action }: { summary: string; onSeed: () => void; action: string }) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-sm text-muted-foreground">{summary}</p>
      <Button type="button" variant="outline" size="sm" onClick={onSeed}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {action}
      </Button>
    </div>
  );
}

function ListEditor({
  field,
  value,
  fallback,
  onChange,
}: {
  field: Extract<CopyField, { kind: "list" }>;
  value: unknown;
  fallback: unknown;
  onChange: (next: string[] | undefined) => void;
}) {
  const defaults = Array.isArray(fallback) ? (fallback as unknown[]).map(str) : [];
  if (!Array.isArray(value)) {
    return (
      <Field label={field.label}>
        <SeedPrompt
          summary={`Showing the built-in ${defaults.length} ${field.itemLabel.toLowerCase()}${defaults.length === 1 ? "" : "s"}.`}
          action={`Edit ${field.label.toLowerCase()}`}
          onSeed={() => onChange(defaults)}
        />
      </Field>
    );
  }
  const items = (value as unknown[]).map(str);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">{field.label}</Label>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange(undefined)}>
          Use built-in
        </Button>
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {field.itemLabel} {idx + 1}
            </span>
            <span className="flex items-center">
              <IconButton label={`Move ${field.itemLabel} ${idx + 1} up`} disabled={idx === 0} onClick={() => onChange(move(items, idx, idx - 1))}>
                <ChevronUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label={`Move ${field.itemLabel} ${idx + 1} down`}
                disabled={idx === items.length - 1}
                onClick={() => onChange(move(items, idx, idx + 1))}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label={`Remove ${field.itemLabel} ${idx + 1}`} destructive onClick={() => onChange(items.filter((_, i) => i !== idx))}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </span>
          </div>
          <Textarea
            rows={2}
            value={item}
            placeholder={defaults[idx]}
            onChange={(e) => onChange(items.map((v, i) => (i === idx ? e.target.value : v)))}
          />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add {field.itemLabel.toLowerCase()}
      </Button>
    </div>
  );
}

function CardsEditor({
  field,
  value,
  fallback,
  onChange,
}: {
  field: Extract<CopyField, { kind: "cards" }>;
  value: unknown;
  fallback: unknown;
  onChange: (next: Array<Record<string, unknown>> | undefined) => void;
}) {
  const defaults = (Array.isArray(fallback) ? fallback : []).map(asRecord);
  const seed = () =>
    onChange(defaults.map((card) => Object.fromEntries(field.fields.map(({ key }) => [key, str(card[key])]))));

  if (!Array.isArray(value)) {
    return (
      <Field label={field.label}>
        <SeedPrompt
          summary={`Showing the built-in ${defaults.length} ${field.itemLabel.toLowerCase()}${defaults.length === 1 ? "" : "s"}.`}
          action={`Edit ${field.label.toLowerCase()}`}
          onSeed={seed}
        />
      </Field>
    );
  }

  const cards = (value as unknown[]).map(asRecord);
  const update = (idx: number, key: string, text: string) =>
    onChange(cards.map((card, i) => (i === idx ? { ...card, [key]: text } : card)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">{field.label}</Label>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange(undefined)}>
          Use built-in
        </Button>
      </div>
      {field.fixedCount ? (
        <p className="text-xs text-muted-foreground">
          Each {field.itemLabel.toLowerCase()} is paired with its image, so there are always {defaults.length}.
        </p>
      ) : null}
      {cards.map((card, idx) => (
        <div key={idx} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {field.itemLabel} {idx + 1}
            </span>
            {field.fixedCount ? null : (
              <span className="flex items-center">
                <IconButton label={`Move ${field.itemLabel} ${idx + 1} up`} disabled={idx === 0} onClick={() => onChange(move(cards, idx, idx - 1))}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label={`Move ${field.itemLabel} ${idx + 1} down`}
                  disabled={idx === cards.length - 1}
                  onClick={() => onChange(move(cards, idx, idx + 1))}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label={`Remove ${field.itemLabel} ${idx + 1}`} destructive onClick={() => onChange(cards.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </span>
            )}
          </div>
          {field.fields.map((sub) => (
            <SubInput
              key={sub.key}
              sub={sub}
              value={str(card[sub.key])}
              placeholder={str(defaults[idx]?.[sub.key])}
              onChange={(text) => update(idx, sub.key, text)}
            />
          ))}
        </div>
      ))}
      {field.fixedCount ? null : (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...cards, {}])}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add {field.itemLabel.toLowerCase()}
        </Button>
      )}
    </div>
  );
}

function SubInput({
  sub,
  value,
  placeholder,
  onChange,
}: {
  sub: SubField;
  value: string;
  placeholder: string;
  onChange: (text: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{sub.label}</Label>
      {sub.multiline ? (
        <Textarea rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function ImageSlot({
  label,
  fallback,
  value,
  onChange,
}: {
  label: string;
  fallback: ImageMediaConfig | undefined;
  value: MediaOverride | null | undefined;
  onChange: (next: MediaOverride | null) => void;
}) {
  const src = value?.src || fallback?.src || "";
  const replaced = Boolean(value?.src);
  return (
    <div className="space-y-2 rounded-lg border p-2">
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md border bg-muted">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{replaced ? "Replaced" : fallback ? "Built-in image" : "No image"}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ImagePicker onSelect={(s) => onChange({ src: s.url, assetId: s.assetId ?? null, alt: s.alt ?? value?.alt ?? "" })}>
          <Button type="button" variant="outline" size="sm">
            {replaced || fallback ? "Replace" : "Choose"}
          </Button>
        </ImagePicker>
        {replaced ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Use original
          </Button>
        ) : null}
      </div>
      {replaced ? (
        <Input
          value={value?.alt ?? ""}
          placeholder={fallback?.alt || "Describe the image for screen readers"}
          onChange={(e) => onChange({ ...(value as MediaOverride), alt: e.target.value })}
          aria-label={`${label} alt text`}
        />
      ) : null}
    </div>
  );
}

function MediaEditor({
  field,
  value,
  onChange,
}: {
  field: MediaField;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  if (field.kind === "image") {
    return (
      <ImageSlot
        label={field.label}
        fallback={field.fallback}
        value={value as MediaOverride | undefined}
        onChange={(next) => onChange(next ?? undefined)}
      />
    );
  }
  if (field.kind === "images") {
    const slots = Array.isArray(value) ? (value as Array<MediaOverride | null>) : [];
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">{field.label}</Label>
        {field.fallbacks.map((fallback, idx) => (
          <ImageSlot
            key={idx}
            label={`${field.itemLabel} ${idx + 1}`}
            fallback={fallback}
            value={slots[idx]}
            onChange={(next) => {
              const updated = field.fallbacks.map((_, i) => (i === idx ? next : (slots[i] ?? null)));
              onChange(updated.some((s) => s != null) ? updated : undefined);
            }}
          />
        ))}
      </div>
    );
  }
  const id = typeof value === "string" ? value : "";
  const invalid = id.trim() !== "" && !VIDEO_ID_PATTERN.test(id.trim());
  return (
    <Field label={field.label} hint={invalid ? "Paste the video id only, e.g. r9XfezALQhA — not the whole link." : "The id from the YouTube link. Empty uses the built-in video."}>
      <Input
        value={id}
        placeholder={field.fallback}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      />
    </Field>
  );
}

interface SlideInSectionEditorProps {
  page: SlideInPageKey;
  section: SlideInSectionView;
  onSaved: (section: SlideInSectionView) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The inspector for one **Slide-in section** of a sub page (or its sheet header).
 *
 * Copy is edited one language at a time and stored per language, so an English edit
 * never appears on the Chinese page; an empty field shows the built-in copy as its
 * placeholder and keeps it. Images and video are shared by both languages.
 */
export function SlideInSectionEditor({ page, section, onSaved, onCancel, onDirtyChange }: SlideInSectionEditorProps) {
  const [content, setContent] = useState<SlideInSectionContent>(() => structuredClone(section.content ?? {}));
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const config = useMemo(
    () => SLIDE_IN_PAGES[page].sections.find((s) => s.key === section.slug),
    [page, section.slug],
  );
  const isHeader = section.slug === HEADER_SLUG;

  const defaults = useMemo<Copy>(() => {
    const messages = slideMessages(getMessages(locale), page);
    try {
      if (isHeader) return headerDefaults(messages);
      return config ? resolveSectionDefaults(messages, config) : {};
    } catch {
      return {};
    }
  }, [page, locale, isHeader, config]);

  const copyFields = visibleCopyFields(section.section_type, defaults);
  const mediaFields = config ? mediaFieldsFor(config) : [];
  const copy = asRecord(content.copy?.[locale]);
  const media = asRecord(content.media);

  const dirty = stableStringify(normalise(content)) !== stableStringify(normalise(section.content ?? {}));

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

  const setCopy = (key: string, value: unknown) => {
    setContent((prev) => {
      const record = { ...asRecord(prev.copy?.[locale]) };
      if (value === undefined) delete record[key];
      else record[key] = value;
      return { ...prev, copy: { ...prev.copy, [locale]: record } };
    });
  };

  const setMedia = (key: string, value: unknown) => {
    setContent((prev) => {
      const record = { ...asRecord(prev.media) };
      if (value === undefined) delete record[key];
      else record[key] = value;
      return { ...prev, media: record };
    });
  };

  const save = async (next: SlideInSectionContent) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/slide-in-sections/${page}/${section.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Couldn't save the section.");
      return body.section as SlideInSectionView;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    try {
      const saved = await save(normalise(content));
      toast.success("Saved as a draft");
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the section.");
    }
  };

  const handleReset = async () => {
    setConfirmReset(false);
    try {
      const saved = await save({});
      setContent({});
      toast.success("Section reset to the built-in content");
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reset the section.");
    }
  };

  const note =
    section.section_type === "size_guide_split"
      ? defaults.table
        ? FIXED_CONTENT_NOTES.size_guide_split
        : undefined
      : FIXED_CONTENT_NOTES[section.section_type];

  const renderCopyField = (field: CopyField) => {
    const fallback = defaults[field.key];
    switch (field.kind) {
      case "text":
        return (
          <Field key={field.key} label={field.label}>
            {field.multiline ? (
              <Textarea rows={3} value={str(copy[field.key])} placeholder={str(fallback)} onChange={(e) => setCopy(field.key, e.target.value)} />
            ) : (
              <Input value={str(copy[field.key])} placeholder={str(fallback)} onChange={(e) => setCopy(field.key, e.target.value)} />
            )}
          </Field>
        );
      case "list":
        return <ListEditor key={field.key} field={field} value={copy[field.key]} fallback={fallback} onChange={(v) => setCopy(field.key, v)} />;
      case "cards":
        return <CardsEditor key={field.key} field={field} value={copy[field.key]} fallback={fallback} onChange={(v) => setCopy(field.key, v)} />;
      case "group": {
        const group = asRecord(copy[field.key]);
        const base = asRecord(fallback);
        return (
          <div key={field.key} className="space-y-2 rounded-lg border p-3">
            <Label className="text-sm font-medium">{field.label}</Label>
            {field.fields.map((sub) => (
              <SubInput
                key={sub.key}
                sub={sub}
                value={str(group[sub.key])}
                placeholder={str(base[sub.key])}
                onChange={(text) => {
                  const next = { ...group, [sub.key]: text };
                  const empty = Object.values(next).every((v) => str(v) === "");
                  setCopy(field.key, empty ? undefined : next);
                }}
              />
            ))}
          </div>
        );
      }
    }
  };

  return (
    <div className="space-y-4 border-t pt-4" data-slide-in-editor={section.slug}>
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs text-muted-foreground">Language</Label>
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Editing language">
          {SUPPORTED_LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
              className={`min-h-8 rounded px-2.5 text-xs font-medium transition-colors ${
                locale === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {LOCALE_LABELS[code]}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Empty fields keep the built-in copy.</span>
      </div>

      {copyFields.length > 0 ? (
        <div className="space-y-4">{copyFields.map(renderCopyField)}</div>
      ) : (
        <p className="text-sm text-muted-foreground">This section has no copy to edit.</p>
      )}

      {mediaFields.length > 0 ? (
        <div className="space-y-3 border-t pt-4">
          <div>
            <h3 className="text-sm font-semibold">Images and video</h3>
            <p className="text-xs text-muted-foreground">Shared by both languages.</p>
          </div>
          {mediaFields.map((field) => (
            <MediaEditor key={field.key} field={field} value={media[field.key]} onChange={(v) => setMedia(field.key, v)} />
          ))}
        </div>
      ) : null}

      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}

      <div className="flex items-center gap-2 pt-2">
        <Button onClick={handleSave} size="sm" disabled={!dirty || saving}>
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
        <Button onClick={() => setConfirmReset(true)} variant="ghost" size="sm" className="ml-auto text-muted-foreground">
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset to default
        </Button>
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset this section to its built-in content?</DialogTitle>
            <DialogDescription>
              Every edit to this section is cleared, in both languages, including replaced images. It stays a
              draft until you publish.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)}>
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
