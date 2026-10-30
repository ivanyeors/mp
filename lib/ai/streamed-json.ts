/**
 * A JSON object read as Claude writes it (PRD-campaign-email-editor slice 09):
 * structured output streams as text, and an editor wants each block the
 * moment it is whole, not the whole answer at the end. Pure.
 *
 * Feed it the text as it arrives; it hands back each element of the object's
 * top-level arrays as soon as that element has closed (`item`), and each
 * top-level value once it has closed (`value`, arrays included, after their
 * items). It reads only the outline (strings, escapes and nesting), so a
 * piece is parsed once, whole, by `JSON.parse`. Anything it can't parse is
 * left out: the caller checks the finished text again.
 */

export type JsonPiece =
  /** One element of the top-level array under `key`, the `index`th. */
  | { kind: "item"; key: string; index: number; value: unknown }
  /** The whole value under a top-level `key`. */
  | { kind: "value"; key: string; value: unknown };

export interface StreamedJson {
  /** Adds the next text; returns the pieces it completed, in order. */
  push(chunk: string): JsonPiece[];
  /** Everything pushed so far. */
  text(): string;
}

const SPACE = /\s/;

export function streamedJson(): StreamedJson {
  let text = "";
  let at = 0;
  /** Open `{` and `[`, outermost first. */
  const open: string[] = [];
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  /** In the top-level object: the next string is a key. */
  let expectKey = true;
  let key = "";
  /** Where the current top-level value began, or -1. */
  let valueStart = -1;
  /** Where the current element of a top-level array began, or -1. */
  let itemStart = -1;
  let itemIndex = 0;

  const parsed = (from: number, to: number): { ok: true; value: unknown } | { ok: false } => {
    try {
      return { ok: true, value: JSON.parse(text.slice(from, to)) };
    } catch {
      return { ok: false };
    }
  };

  return {
    text: () => text,
    push(chunk) {
      text += chunk;
      const out: JsonPiece[] = [];
      const item = (to: number) => {
        const p = parsed(itemStart, to);
        if (p.ok) out.push({ kind: "item", key, index: itemIndex, value: p.value });
        itemIndex += 1;
        itemStart = -1;
      };
      const value = (to: number) => {
        const p = parsed(valueStart, to);
        if (p.ok) out.push({ kind: "value", key, value: p.value });
        valueStart = -1;
      };
      // Inside a top-level array, reading its elements.
      const inArray = () => open.length === 2 && open[1] === "[";

      for (; at < text.length; at++) {
        const c = text[at];
        if (inString) {
          if (escaped) escaped = false;
          else if (c === "\\") escaped = true;
          else if (c === '"') {
            inString = false;
            if (open.length === 1 && expectKey) {
              const k = parsed(stringStart, at + 1);
              key = k.ok && typeof k.value === "string" ? k.value : "";
              expectKey = false;
            } else if (open.length === 1 && valueStart === stringStart) value(at + 1);
            else if (inArray() && itemStart === stringStart) item(at + 1);
          }
          continue;
        }
        if (SPACE.test(c)) continue;
        // A value starting: in the top-level object, after its key; in a top-level array, an element.
        if (open.length === 1 && !expectKey && valueStart === -1 && c !== ":" && c !== "," && c !== "}") {
          valueStart = at;
          if (c === "[") itemIndex = 0;
        } else if (inArray() && itemStart === -1 && c !== "," && c !== "]") {
          itemStart = at;
        }
        switch (c) {
          case '"':
            inString = true;
            stringStart = at;
            break;
          case "{":
          case "[":
            open.push(c);
            break;
          case "}":
          case "]":
            // A number, true, false or null ends where its container does.
            if (inArray() && itemStart !== -1 && c === "]") item(at);
            else if (open.length === 1 && valueStart !== -1 && c === "}") value(at);
            open.pop();
            if (open.length === 1 && valueStart !== -1) {
              value(at + 1);
            } else if (inArray() && itemStart !== -1) {
              item(at + 1);
            }
            break;
          case ",":
            if (open.length === 1) {
              if (valueStart !== -1) value(at);
              expectKey = true;
            } else if (inArray() && itemStart !== -1) item(at);
            break;
        }
      }
      return out;
    },
  };
}
