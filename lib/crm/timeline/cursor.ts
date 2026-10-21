import { canonicalAt } from "@/lib/crm/timeline/merge";
import type { TimelineCursor } from "@/lib/crm/timeline/types";

/**
 * The timeline's `before=` value: the cursor, opaque to the browser. A value the
 * route did not write decodes to null, so a hand-edited link is a 400, never a
 * query built from typed text.
 */

export function encodeCursor(cursor: TimelineCursor): string {
  return Buffer.from(JSON.stringify([cursor.at, cursor.kind, cursor.refId, cursor.id]), "utf8").toString("base64url");
}

export function decodeCursor(value: string): TimelineCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 4 || !parsed.every((p) => typeof p === "string")) return null;
  const [rawAt, kind, refId, id] = parsed as string[];
  const at = canonicalAt(rawAt!);
  if (at === null || at !== rawAt) return null;
  return { at, kind: kind!, refId: refId!, id: id! };
}
