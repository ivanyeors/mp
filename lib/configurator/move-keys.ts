/**
 * The keyboard map for moving a selected pouch in the x-ray dive (X-ray pillow
 * UX slice 06) — the keyboard twin of the pouch drag (the on-screen move pad
 * was retired 27-9-2026). Pure, like `layerDragDestination`.
 *
 * ← → reorder in the Layer · ↑ ↓ to the front / back sub-section ·
 * [ ] one Layer up / down · Shift + ← → to the neighbouring Section ·
 * Alt + arrows nudge it NUDGE_STEP_MM within its cell, Alt + Shift + arrows
 * FINE_STEP_MM for the last millimetre (`nudgeKeyFor`).
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

/** Every move, with its key: reorder, sub-section, Layer, Section. */
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

/** One Alt + arrow step of the fine nudge (slice 08), mm. */
export const NUDGE_STEP_MM = 5;
/** One Alt + Shift + arrow step: the last millimetre (linked views, 7-11-2026). */
export const FINE_STEP_MM = 1;

/**
 * The fine nudge a keydown asks for — Alt + an arrow moves the selected pouch
 * NUDGE_STEP_MM within its cell (+x right, +y toward the back), Alt + Shift +
 * an arrow FINE_STEP_MM — or null.
 */
export function nudgeKeyFor(e: { key: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): { xMm: number; yMm: number } | null {
  if (!e.altKey || e.ctrlKey || e.metaKey) return null;
  const step = e.shiftKey ? FINE_STEP_MM : NUDGE_STEP_MM;
  switch (e.key) {
    case "ArrowLeft":
      return { xMm: -step, yMm: 0 };
    case "ArrowRight":
      return { xMm: step, yMm: 0 };
    case "ArrowUp":
      return { xMm: 0, yMm: -step };
    case "ArrowDown":
      return { xMm: 0, yMm: step };
    default:
      return null;
  }
}
