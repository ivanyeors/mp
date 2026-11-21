export type JsonPiece =
  | { kind: "item"; key: string; index: number; value: unknown }
  | { kind: "value"; key: string; value: unknown };

export interface StreamedJson {
  push(chunk: string): JsonPiece[];
  text(): string;
}

const SPACE = /\s/;

export function streamedJson(): StreamedJson {
  let text = "";
  let at = 0;
  const open: string[] = [];
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  let expectKey = true;
  let key = "";
  let valueStart = -1;
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
