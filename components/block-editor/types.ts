import type { ComponentType, ReactNode } from "react";

export interface EditorBlock {
  id: string;
  type: string;
}

export interface BlockFormProps<B extends EditorBlock> {
  block: B;
  onChange: (next: B, burst?: string) => void;
  readOnly: boolean;
  layoutLocked?: boolean;
  errors: Record<string, string>;
  idPrefix: string;
  onSlash: () => void;
}

export interface BlockKind<B extends EditorBlock> {
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  create: () => B;
  Form: ComponentType<BlockFormProps<B>>;
  Options?: ComponentType<BlockFormProps<B>>;
  Tools?: ComponentType<BlockFormProps<B> & { name: string }>;
}

export type BlockCatalogue<B extends EditorBlock> = { [T in B["type"]]: BlockKind<Extract<B, { type: T }>> };

export interface PaletteItem<B extends EditorBlock> {
  id: string;
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  blocks: () => B[];
  disabledReason?: string | null;
  preview?: ReactNode;
  apply?: (next: B[]) => void;
}

export interface PaletteItemsTab<B extends EditorBlock> {
  value: string;
  label: string;
  items: PaletteItem<B>[];
  empty?: ReactNode;
}

export interface PaletteContentTab {
  value: string;
  label: string;
  content: ReactNode;
}

export type PaletteTab<B extends EditorBlock> = PaletteItemsTab<B> | PaletteContentTab;
