import type { EditorBlock } from "./types";

export function insertBlocks<B extends EditorBlock>(blocks: readonly B[], at: number, added: readonly B[], max = Infinity): B[] {
  if (!added.length || added.length > max - blocks.length) return blocks as B[];
  const i = Math.max(0, Math.min(at, blocks.length));
  return [...blocks.slice(0, i), ...added, ...blocks.slice(i)];
}

export function moveBlock<B extends EditorBlock>(blocks: readonly B[], from: number, to: number): B[] {
  if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return blocks as B[];
  const next = [...blocks];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export function duplicateBlock<B extends EditorBlock>(blocks: readonly B[], i: number, newId: () => string, max = Infinity): B[] {
  const b = blocks[i];
  if (!b) return blocks as B[];
  const copy = { ...(JSON.parse(JSON.stringify(b)) as B), id: newId() };
  return insertBlocks(blocks, i + 1, [copy], max);
}

export function removeBlock<B extends EditorBlock>(blocks: readonly B[], i: number): B[] {
  return i < 0 || i >= blocks.length ? (blocks as B[]) : blocks.filter((_, j) => j !== i);
}

export function dropIndex(over: number, rect: { top: number; height: number }, y: number): number {
  return y < rect.top + rect.height / 2 ? over : over + 1;
}

export const movedText = (label: string, to: number, of: number) => `${label} moved to position ${to + 1} of ${of}.`;
export const addedText = (label: string, at: number, of: number) => `${label} added at position ${at + 1} of ${of}.`;
export const noRoomText = (adds: number, room: number, max: number) =>
  `This adds ${adds} blocks, and there is room for ${room} more: at most ${max}.`;
