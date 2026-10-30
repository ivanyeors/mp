import { CHINESE_SAMPLE_CONTENT, CHINESE_SAMPLE_LINES, CHINESE_SAMPLE_WORDS } from "@/lib/email/__fixtures__/samples";
import type { TranslateRequest } from "@/lib/email-campaigns/ai-translate-shape";
import { withoutChineseVersion, type BlockWords } from "@/lib/email-campaigns/chinese-version";

/** ✨ Translate's fixtures (PRD-campaign-email-editor slice 17): an English email, and Claude's answers as JSON. */

/** The sample campaign in English alone: what a first ✨ Translate reads. */
export const ENGLISH = withoutChineseVersion(CHINESE_SAMPLE_CONTENT);

export const TRANSLATE: TranslateRequest = {
  campaignId: null,
  subject: CHINESE_SAMPLE_LINES.subject,
  preheader: CHINESE_SAMPLE_LINES.preheader,
  content: ENGLISH,
  only: null,
  lines: true,
};

/** Some words as Claude writes them back: a link as its key, `L1` for the first. */
function asAnswer(words: BlockWords): Record<string, unknown> {
  const runs = (rs: unknown[]) => rs.map((r) => (r && typeof r === "object" && "link" in r ? { ...r, link: `L${(r as { link: number }).link + 1}` } : r));
  if (!("paragraphs" in words)) return { ...words };
  return { ...words, paragraphs: words.paragraphs.map((p) => (p.kind === "p" ? { kind: "p", runs: runs(p.runs) } : { kind: "bullets", items: p.items.map(runs) })) };
}

/** Claude's answer: the sample's Chinese for every block (or `blocks`), and the lines. */
export function translateAnswer(
  over: { blocks?: Record<string, BlockWords>; subject?: string; previewLine?: string; fallbacks?: Record<string, string>; ids?: string[] } = {},
): string {
  const words = over.blocks ?? CHINESE_SAMPLE_WORDS;
  const ids = over.ids ?? Object.keys(words);
  return JSON.stringify({
    subject: over.subject ?? CHINESE_SAMPLE_LINES.chineseSubject,
    previewLine: over.previewLine ?? CHINESE_SAMPLE_LINES.chinesePreheader,
    blocks: ids.map((id) => ({ id, ...asAnswer(words[id]) })),
    ...(over.fallbacks ? { fallbacks: over.fallbacks } : {}),
  });
}

/** The sample's Chinese for one block, changed by `edit`. */
export const withWords = (id: string, edit: (w: BlockWords) => BlockWords): Record<string, BlockWords> => ({ ...CHINESE_SAMPLE_WORDS, [id]: edit(CHINESE_SAMPLE_WORDS[id]) });
