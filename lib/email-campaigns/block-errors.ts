import type { EmailBlock } from "./content";

const BLOCK_ERROR = /^content\.blocks\.(\d+)\./;

export function errorsAfterBlockEdit(
  errors: Record<string, string>,
  before: readonly EmailBlock[],
  after: readonly EmailBlock[],
): Record<string, string> {
  const moved = before.length !== after.length || before.some((b, i) => b.id !== after[i].id);
  const edited = (i: number) => moved || JSON.stringify(before[i]) !== JSON.stringify(after[i]);
  const kept = Object.entries(errors).filter(([key]) => {
    const at = BLOCK_ERROR.exec(key);
    return !at || !edited(Number(at[1]));
  });
  return kept.length === Object.keys(errors).length ? errors : Object.fromEntries(kept);
}
