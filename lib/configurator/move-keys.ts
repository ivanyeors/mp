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

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as { tagName?: unknown }).tagName !== "string") return false;
  const el = target as unknown as { tagName: string; isContentEditable?: boolean };
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable === true;
}

export const NUDGE_STEP_MM = 5;
export const FINE_STEP_MM = 1;

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
