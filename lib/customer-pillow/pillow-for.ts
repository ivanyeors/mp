export type PillowFor = "self" | "other";

export const PILLOW_FOR_OPTIONS: { value: PillowFor; label: string }[] = [
  { value: "self", label: "For me" },
  { value: "other", label: "For someone else" },
];

export function pillowForOf(data: unknown): PillowFor | null {
  const v = data && typeof data === "object" ? (data as Record<string, unknown>).pillowFor : null;
  return v === "self" || v === "other" ? v : null;
}

export function nameForPillowFor(answer: PillowFor, name: string, ownerName: string): string {
  const typed = name.trim();
  const own = ownerName.trim();
  if (answer === "self") return typed ? name : own;
  return own && typed === own ? "" : name;
}

export function ownBoughtPillows<T extends { resultId: string | null }>(
  bought: readonly T[],
  forOthers: ReadonlySet<string>,
): T[] {
  return bought.filter((b) => b.resultId === null || !forOthers.has(b.resultId));
}
