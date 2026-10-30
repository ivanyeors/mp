import type { ComponentType, ReactNode } from "react";

/**
 * The shared block editor's contract (PRD-campaign-email-editor decision 1,
 * ADR 0036): a page hands it its own block types, and the editor knows
 * nothing else about them. Nothing in components/block-editor/ imports email
 * code; a test reads the imports.
 */

/** A block the editor can hold: an id stable for its life, so it can follow the block as it moves. */
export interface EditorBlock {
  id: string;
  type: string;
}

/** What a block type's form and options are given. */
export interface BlockFormProps<B extends EditorBlock> {
  block: B;
  /**
   * One change to the block. `burst` names a run of typing in one field, which
   * the editor's history keeps as one step; leave it out for a choice or a paste.
   */
  onChange: (next: B, burst?: string) => void;
  /** Shown as it is, not editable: sending has started. */
  readOnly: boolean;
  /**
   * The words are editable and nothing else is (`BlockEditorRoot`'s
   * `layoutLocked`): a form keeps its word fields and fixes every choice of
   * layout, its targets, pictures and parts. Absent is false.
   */
  layoutLocked?: boolean;
  /** Save's errors for this block, keyed from the block: `text`, `buttons.0.label`. */
  errors: Record<string, string>;
  /** Unique to this block: field ids start with it. */
  idPrefix: string;
  /** Opens the block menu to add a block after this one: `/` typed in an empty text line. */
  onSlash: () => void;
}

/** One block type, as the palette, the menus and the column show it. */
export interface BlockKind<B extends EditorBlock> {
  label: string;
  /** One line: what it is for. */
  description: string;
  icon: ComponentType<{ className?: string }>;
  /** A new block of this type: its words empty, on their placeholders. */
  create: () => B;
  /** The card's body: the block as it will read, editable in place. */
  Form: ComponentType<BlockFormProps<B>>;
  /** Presets under the selected block (alignment, style, size): never a colour, font or size picker. */
  Options?: ComponentType<BlockFormProps<B>>;
  /**
   * Small controls in the card's top row, beside its menu: a page's own
   * actions on the block (the campaign's ✨ Rewrite, PRD-campaign-email-editor
   * slice 10). `name` is the card's, "Heading, block 2 of 5", for their labels.
   */
  Tools?: ComponentType<BlockFormProps<B> & { name: string }>;
}

/**
 * Every block type a page offers, one entry each, in the order the palette
 * lists them. Adding a type is one entry here and its form.
 */
export type BlockCatalogue<B extends EditorBlock> = { [T in B["type"]]: BlockKind<Extract<B, { type: T }>> };

/** Something in the palette that adds blocks: one block type, or a Starter's several. */
export interface PaletteItem<B extends EditorBlock> {
  id: string;
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  /** What it adds, made fresh each time: new ids. */
  blocks: () => B[];
  /** Why it can't be added now; null or absent when it can. */
  disabledReason?: string | null;
  /**
   * A picture of what it adds, above its name (a Starter's thumbnail), which
   * the page draws and loads when it likes. Decorative: the name says it.
   */
  preview?: ReactNode;
  /**
   * Puts it in, for an item that brings more than blocks (a Starter written
   * for one audience): it is given the whole list with its blocks in, and
   * makes that, and the rest, one change. Without it the list is the change.
   */
  apply?: (next: B[]) => void;
}

/** A palette tab of items that add blocks: Blocks, Starters. */
export interface PaletteItemsTab<B extends EditorBlock> {
  value: string;
  label: string;
  items: PaletteItem<B>[];
  /** What an empty tab says. */
  empty?: ReactNode;
}

/** A palette tab with content of its own: Variables, which go into text rather than between blocks. */
export interface PaletteContentTab {
  value: string;
  label: string;
  content: ReactNode;
}

/** A tab of the palette, supplied by the page. */
export type PaletteTab<B extends EditorBlock> = PaletteItemsTab<B> | PaletteContentTab;
