"use client";

import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";
import { CUSTOM_SECTION_TEMPLATES } from "@/lib/types/landing-sections";
import type { LandingSection } from "@/lib/types/landing-sections";

/** Human labels for the section type badge. */
export const SECTION_TYPE_LABELS: Record<string, string> = {
  hero: "Hero",
  text_image: "Text + Image",
  marquee: "Marquee",
  stories: "Testimonials",
  pick_your_mpillow: "Pick Your Mpillow",
  neck_pains: "Neck Pains",
  why_choose_highlights: "Why Choose",
  product_card: "Product Card",
  credibility: "Credibility",
  video_embed: "Video Embed",
  founder_note: "Founder Note",
  custom_text_image: "Custom: Text + Image",
  custom_full_width_image: "Custom: Full-Width Image",
  custom_video: "Custom: Video",
  custom_rich_text: "Custom: Rich Text",
  featured_products: "Featured Products",
  shop_cta: "Shop CTA Banner",
  faq: "Page FAQs",
};

export function sectionTitle(section: LandingSection): string {
  return section.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface RowProps {
  section: LandingSection;
  index: number;
  total: number;
  selected: boolean;
  onSelect: (slug: string) => void;
  onToggleVisibility: (section: LandingSection) => void;
  onDelete: (section: LandingSection) => void;
  onMove: (section: LandingSection, direction: -1 | 1) => void;
}

function SectionRow({
  section,
  index,
  total,
  selected,
  onSelect,
  onToggleVisibility,
  onDelete,
  onMove,
}: RowProps) {
  const { ref, isDragging, handleRef } = useSortable({ id: section.id, index });
  // Derived from the same list the Add dialog offers, so it cannot drift from the
  // server's delete guard the way a hand-maintained copy would.
  const isCustom = CUSTOM_SECTION_TEMPLATES.some((t) => t.type === section.section_type);
  const label = SECTION_TYPE_LABELS[section.section_type] ?? section.section_type;
  const title = sectionTitle(section);

  return (
    <div
      ref={ref}
      data-section-row={section.slug}
      className={`rounded-lg border transition-shadow ${
        isDragging ? "z-50 opacity-70 shadow-lg" : ""
      } ${selected ? "border-primary bg-primary/5" : "bg-card"} ${
        section.visible ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          ref={handleRef}
          className="inline-flex min-h-8 min-w-6 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Drag ${title} to reorder`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/*
          Keyboard path for reordering. The drag handle is pointer-only, so without these
          the tree cannot be reordered without a mouse.
        */}
        <span className="flex flex-col">
          <button
            onClick={(e) => { e.stopPropagation(); onMove(section, -1); }}
            disabled={index === 0}
            aria-label={`Move ${title} up`}
            className="inline-flex h-4 w-5 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMove(section, 1); }}
            disabled={index === total - 1}
            aria-label={`Move ${title} down`}
            className="inline-flex h-4 w-5 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(section); }}
          aria-pressed={section.visible}
          aria-label={section.visible ? `Hide ${title}` : `Show ${title}`}
          className="inline-flex min-h-8 min-w-8 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {section.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>

        <button
          onClick={() => onSelect(section.slug)}
          aria-current={selected ? "true" : undefined}
          className="min-w-0 flex-1 truncate px-1 text-left text-sm font-medium"
        >
          {title}
        </button>

        <Badge variant="outline" className="shrink-0 text-[10px]">
          {label}
        </Badge>

        {isCustom && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(section); }}
            aria-label={`Remove ${title}`}
            className="inline-flex min-h-8 min-w-8 items-center justify-center text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export interface SectionTreeProps {
  sections: LandingSection[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onToggleVisibility: (section: LandingSection) => void;
  onDelete: (section: LandingSection) => void;
  onMove: (section: LandingSection, direction: -1 | 1) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDragEnd: (event: any) => void;
}

/** Ordered list of Landing sections — the builder's left pane. */
export function SectionTree({
  sections,
  selectedSlug,
  onSelect,
  onToggleVisibility,
  onDelete,
  onMove,
  onDragEnd,
}: SectionTreeProps) {
  if (sections.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No sections configured. Add a section to get started.
      </div>
    );
  }

  return (
    <DragDropProvider onDragEnd={onDragEnd}>
      <div className="space-y-1.5">
        {sections.map((section, index) => (
          <SectionRow
            key={section.id}
            section={section}
            index={index}
            total={sections.length}
            selected={selectedSlug === section.slug}
            onSelect={onSelect}
            onToggleVisibility={onToggleVisibility}
            onDelete={onDelete}
            onMove={onMove}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
