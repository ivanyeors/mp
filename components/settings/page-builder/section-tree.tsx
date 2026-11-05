"use client";

import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, MoreHorizontal, Trash2 } from "lucide-react";
import { CUSTOM_SECTION_TEMPLATES } from "@/lib/types/landing-sections";
import type { SortableDragEndEvent } from "@/lib/dnd/sortable-move";
import type { LandingSection } from "@/lib/types/landing-sections";

/** Human labels for the section type badge. */
export const SECTION_TYPE_LABELS: Record<string, string> = {
  hero: "Hero",
  text_image: "Text and image",
  marquee: "Marquee",
  stories: "Testimonials",
  pick_your_mpillow: "Pick your Mpillow",
  neck_pains: "Neck pains",
  why_choose_highlights: "Why choose",
  product_card: "Product card",
  credibility: "Credibility",
  video_embed: "Video embed",
  founder_note: "Founder note",
  custom_text_image: "Custom: text and image",
  custom_full_width_image: "Custom: full-width image",
  custom_video: "Custom: video",
  custom_rich_text: "Custom: rich text",
  featured_products: "Featured products",
  shop_cta: "Shop CTA banner",
  faq: "Page FAQs",
  delivery_estimator: "Delivery estimator",
};

export function sectionTitle(section: Pick<LandingSection, "slug">): string {
  return section.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** What the tree needs of a section — a Landing section or a sub page's Slide-in section. */
export interface TreeSection {
  id: string;
  slug: string;
  section_type: string;
  visible: boolean;
}

/**
 * Landing sections: derived from the same list the Add dialog offers, so it cannot drift
 * from the server's delete guard the way a hand-maintained copy would.
 */
function isCustomLandingSection(section: TreeSection): boolean {
  return CUSTOM_SECTION_TEMPLATES.some((t) => t.type === section.section_type);
}

function landingTypeLabel(section: TreeSection): string {
  return SECTION_TYPE_LABELS[section.section_type] ?? section.section_type;
}

interface RowProps<T extends TreeSection> {
  section: T;
  index: number;
  total: number;
  selected: boolean;
  onSelect: (slug: string) => void;
  onToggleVisibility: (section: T) => void;
  onDelete: (section: T) => void;
  onMove: (section: T, direction: -1 | 1) => void;
  canDelete: (section: T) => boolean;
  typeLabel: (section: T) => string;
}

function SectionRow<T extends TreeSection>({
  section,
  index,
  total,
  selected,
  onSelect,
  onToggleVisibility,
  onDelete,
  onMove,
  canDelete,
  typeLabel,
}: RowProps<T>) {
  const { ref, isDragging, handleRef } = useSortable({ id: section.id, index });
  const isCustom = canDelete(section);
  const label = typeLabel(section);
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
      {/*
        Phones: drag, show/hide, the name (opens the section) and one menu, each 44px
        and 8px apart; the ▲▼ and remove buttons move into the menu.
      */}
      <div className="flex items-center gap-1 px-2 py-1.5 max-md:gap-2 max-md:px-1 max-md:py-1">
        <button
          ref={handleRef}
          className="inline-flex min-h-8 min-w-6 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:text-foreground active:cursor-grabbing active:bg-press max-md:size-11"
          aria-label={`Drag ${title} to reorder`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/*
          Keyboard path for reordering. The drag handle is pointer-only, so without these
          the tree cannot be reordered without a mouse.
        */}
        <span className="flex flex-col max-md:hidden">
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
          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground active:bg-press max-md:size-11"
        >
          {section.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>

        <button
          onClick={() => onSelect(section.slug)}
          aria-current={selected ? "true" : undefined}
          className="min-w-0 flex-1 truncate px-1 text-left text-sm font-medium max-md:min-h-11 max-md:rounded-md max-md:py-1 max-md:transition-colors max-md:active:bg-press"
        >
          <span className="max-md:block max-md:truncate">{title}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground md:hidden">{label}</span>
        </button>

        <Badge variant="outline" className="shrink-0 text-[10px] max-md:hidden">
          {label}
        </Badge>

        {isCustom && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(section); }}
            aria-label={`Remove ${title}`}
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-muted-foreground hover:text-destructive active:bg-press max-md:hidden"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 text-muted-foreground md:hidden"
              aria-label={`More actions for ${title}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem className="min-h-11" disabled={index === 0} onSelect={() => onMove(section, -1)}>
              <ChevronUp />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" disabled={index === total - 1} onSelect={() => onMove(section, 1)}>
              <ChevronDown />
              Move down
            </DropdownMenuItem>
            {isCustom ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="min-h-11" onSelect={() => onDelete(section)}>
                  <Trash2 />
                  Remove
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export interface SectionTreeProps<T extends TreeSection> {
  sections: T[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onToggleVisibility: (section: T) => void;
  onDelete?: (section: T) => void;
  onMove: (section: T, direction: -1 | 1) => void;
  onDragEnd: (event: SortableDragEndEvent) => void;
  /** Which sections may be removed. Defaults to the landing page's custom sections. */
  canDelete?: (section: T) => boolean;
  /** The type badge. Defaults to the landing page's section type labels. */
  typeLabel?: (section: T) => string;
  /**
   * A row above the list that is always there and always shown — a sub page's sheet
   * header. It can be selected for editing but not moved, hidden or removed.
   */
  pinned?: { slug: string; title: string; label: string };
}

/** A pinned row: selectable only. */
function PinnedRow({
  slug,
  title,
  label,
  selected,
  onSelect,
}: {
  slug: string;
  title: string;
  label: string;
  selected: boolean;
  onSelect: (slug: string) => void;
}) {
  return (
    <div
      data-section-row={slug}
      className={`rounded-lg border ${selected ? "border-primary bg-primary/5" : "bg-card"}`}
    >
      <div className="flex items-center gap-1 px-2 py-1.5 max-md:gap-2 max-md:px-1 max-md:py-1">
        <span className="inline-flex min-h-8 min-w-6 items-center justify-center text-muted-foreground/40 max-md:size-11" aria-hidden="true">
          <GripVertical className="h-4 w-4" />
        </span>
        <button
          onClick={() => onSelect(slug)}
          aria-current={selected ? "true" : undefined}
          className="min-w-0 flex-1 truncate px-1 text-left text-sm font-medium max-md:min-h-11 max-md:rounded-md max-md:py-1 max-md:transition-colors max-md:active:bg-press"
        >
          <span className="max-md:block max-md:truncate">{title}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground md:hidden">{label}</span>
        </button>
        <Badge variant="outline" className="shrink-0 text-[10px] max-md:hidden">
          {label}
        </Badge>
      </div>
    </div>
  );
}

/** Ordered list of sections — the builder's left pane. */
export function SectionTree<T extends TreeSection>({
  sections,
  selectedSlug,
  onSelect,
  onToggleVisibility,
  onDelete,
  onMove,
  onDragEnd,
  canDelete,
  typeLabel,
  pinned,
}: SectionTreeProps<T>) {
  const deletable = canDelete ?? (onDelete ? isCustomLandingSection : () => false);
  const label = typeLabel ?? landingTypeLabel;
  const pinnedRow = pinned ? (
    <PinnedRow {...pinned} selected={selectedSlug === pinned.slug} onSelect={onSelect} />
  ) : null;

  if (sections.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No sections yet. Add one to get started.
      </div>
    );
  }

  return (
    <DragDropProvider onDragEnd={onDragEnd}>
      <div className="space-y-1.5 max-md:space-y-2">
        {pinnedRow}
        {sections.map((section, index) => (
          <SectionRow
            key={section.id}
            section={section}
            index={index}
            total={sections.length}
            selected={selectedSlug === section.slug}
            onSelect={onSelect}
            onToggleVisibility={onToggleVisibility}
            onDelete={onDelete ?? (() => {})}
            onMove={onMove}
            canDelete={deletable}
            typeLabel={label}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
