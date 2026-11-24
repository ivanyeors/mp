import { CHINESE, EMAIL_BLOCK_LABEL, type EmailBlock, type EmailBlockType } from "./content";

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

const CHINESE_KEY = `content.translations.${CHINESE}`;
const ANY_BLOCK = /^content\.blocks\.(\d+)(?:\.|$)/;
const CHINESE_BLOCK = new RegExp(`^${CHINESE_KEY.replace(/\./g, "\\.")}\\.blocks\\.([^.]+)(?:\\.|$)`);

const FIELD_LABEL: Readonly<Record<string, string>> = {
  name: "Campaign name",
  subject: "Subject",
  preheader: "Preview line",
  segmentId: "Send to",
  excludeSegmentIds: "Leave out people in",
  body: "Message",
  "button.label": "Button label",
  "button.url": "Button link",
  [`${CHINESE_KEY}.subject`]: "Chinese subject",
  [`${CHINESE_KEY}.preheader`]: "Chinese preview line",
};

const labelOf = (key: string) =>
  FIELD_LABEL[key] ??
  (key.startsWith("content.fallbacks.") || key.startsWith(`${CHINESE_KEY}.fallbacks.`) ? "Variables" : key.startsWith("content") ? "Email" : null);

export interface SaveProblem {
  text: string;
  blockId: string | null;
  chinese: boolean;
  more: number;
}

export function firstSaveProblem(
  fieldErrors: Readonly<Record<string, string>>,
  content: { blocks: readonly { id: string; type: EmailBlockType }[] } | null,
): SaveProblem | null {
  const all = Object.entries(fieldErrors);
  if (!all.length) return null;
  const [key, message] = all[0];
  const more = all.length - 1;
  const blocks = content?.blocks ?? [];
  const english = ANY_BLOCK.exec(key);
  const chineseId = CHINESE_BLOCK.exec(key)?.[1];
  const n = english ? Number(english[1]) : blocks.findIndex((b) => b.id === chineseId);
  const block = n >= 0 ? blocks[n] : undefined;
  if (block) {
    const where = `${chineseId ? "Chinese version, " : ""}Block ${n + 1}, ${EMAIL_BLOCK_LABEL[block.type]}`;
    return { text: `${where}: ${message}`, blockId: block.id, chinese: Boolean(chineseId), more };
  }
  const label = labelOf(key);
  return { text: label ? `${label}: ${message}` : message, blockId: null, chinese: key.startsWith(CHINESE_KEY), more };
}

export function saveRefusalText(verb: string, error: string, problem: SaveProblem | null): string {
  if (!problem) return `${verb}. ${error}`;
  const more = problem.more ? ` ${problem.more} more ${problem.more === 1 ? "thing is" : "things are"} highlighted.` : "";
  return `${verb}. ${problem.text}${more}`;
}
