/**
 * The keyboard map for moving a selected pouch in the x-ray dive (X-ray pillow
 * UX slice 06), and the move pad's actions — one table, so a pad button and a
 * key can never disagree. Pure, like `layerDragDestination`.
 *
 * ← → reorder in the Layer · ↑ ↓ to the front / back sub-section ·
 * [ ] one Layer up / down · Shift + ← → to the neighbouring Section.
 */

export type MoveKind =
  | "left"
  | "right"
  | "front"
  | "back"
  | "layerUp"
  | "layerDown"
  | "sectionLeft"
  | "sectionRight";

export type MoveAction = { kind: MoveKind; label: string; key: string };

/** Pad order: reorder, sub-section, Layer, Section — two per row. */
export const MOVE_ACTIONS: readonly MoveAction[] = [
  { kind: "left", label: "Left in layer", key: "←" },
  { kind: "right", label: "Right in layer", key: "→" },
  { kind: "front", label: "To front", key: "↑" },
  { kind: "back", label: "To back", key: "↓" },
  { kind: "layerUp", label: "Layer up", key: "[" },
  { kind: "layerDown", label: "Layer down", key: "]" },
  { kind: "sectionLeft", label: "Section left", key: "⇧←" },
  { kind: "sectionRight", label: "Section right", key: "⇧→" },
];

/** The move a keydown asks for, or null when the key is not a move key. */
export function moveKeyFor(e: { key: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): MoveKind | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  switch (e.key) {
    case "ArrowLeft":
      return e.shiftKey ? "sectionLeft" : "left";
    case "ArrowRight":
      return e.shiftKey ? "sectionRight" : "right";
    case "ArrowUp":
      return e.shiftKey ? null : "front";
    case "ArrowDown":
      return e.shiftKey ? null : "back";
    case "[":
      return "layerUp";
    case "]":
      return "layerDown";
    default:
      return null;
  }
}

/** True for a keydown that belongs to a text control — the move keys must never steal those. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as { tagName?: unknown }).tagName !== "string") return false;
  const el = target as unknown as { tagName: string; isContentEditable?: boolean };
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable === true;
}
