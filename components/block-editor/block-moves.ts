/**
 * The block editor's edits, as pure functions over a list of blocks
 * (PRD-campaign-email-editor slice 04): each returns a new list, or the same
 * list when nothing changes, and what a screen reader hears about it.
 */
import type { EditorBlock } from "./types";

/** Pure — `added` put in at `at` (0 is the top; past the end is the end), keeping at most `max` blocks. */
export function insertBlocks<B extends EditorBlock>(blocks: readonly B[], at: number, added: readonly B[], max = Infinity): B[] {
  const room = Math.max(0, max - blocks.length);
  if (!room || !added.length) return blocks as B[];
  const i = Math.max(0, Math.min(at, blocks.length));
  return [...blocks.slice(0, i), ...added.slice(0, room), ...blocks.slice(i)];
}

/** Pure — the block at `from` moved to `to` (both positions in the list as it is). */
export function moveBlock<B extends EditorBlock>(blocks: readonly B[], from: number, to: number): B[] {
  if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return blocks as B[];
  const next = [...blocks];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

/** Pure — a copy of the block at `i` right after it, with its own id. */
export function duplicateBlock<B extends EditorBlock>(blocks: readonly B[], i: number, newId: () => string, max = Infinity): B[] {
  const b = blocks[i];
  if (!b) return blocks as B[];
  const copy = { ...(JSON.parse(JSON.stringify(b)) as B), id: newId() };
  return insertBlocks(blocks, i + 1, [copy], max);
}

/** Pure — the list without the block at `i`. */
export function removeBlock<B extends EditorBlock>(blocks: readonly B[], i: number): B[] {
  return i < 0 || i >= blocks.length ? (blocks as B[]) : blocks.filter((_, j) => j !== i);
}

/** Pure — where a drop lands over a block: before it in its top half, after it in its bottom half. */
export function dropIndex(over: number, rect: { top: number; height: number }, y: number): number {
  return y < rect.top + rect.height / 2 ? over : over + 1;
}

/** What a move or an insert says: "Image + text moved to position 2 of 6". */
export const movedText = (label: string, to: number, of: number) => `${label} moved to position ${to + 1} of ${of}.`;
export const addedText = (label: string, at: number, of: number) => `${label} added at position ${at + 1} of ${of}.`;
