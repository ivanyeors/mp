import { CHINESE_SAMPLE_CONTENT, CHINESE_SAMPLE_LINES, CHINESE_SAMPLE_WORDS } from "@/lib/email/__fixtures__/samples";
import type { TranslateRequest } from "@/lib/email-campaigns/ai-translate-shape";
import { withoutChineseVersion, type BlockWords } from "@/lib/email-campaigns/chinese-version";

export const ENGLISH = withoutChineseVersion(CHINESE_SAMPLE_CONTENT);

export const TRANSLATE: TranslateRequest = {
  campaignId: null,
  subject: CHINESE_SAMPLE_LINES.subject,
  preheader: CHINESE_SAMPLE_LINES.preheader,
  content: ENGLISH,
  only: null,
  lines: true,
};

function asAnswer(words: BlockWords): Record<string, unknown> {
  const runs = (rs: unknown[]) => rs.map((r) => (r && typeof r === "object" && "link" in r ? { ...r, link: `L${(r as { link: number }).link + 1}` } : r));
  if (!("paragraphs" in words)) return { ...words };
  return { ...words, paragraphs: words.paragraphs.map((p) => (p.kind === "p" ? { kind: "p", runs: runs(p.runs) } : { kind: "bullets", items: p.items.map(runs) })) };
}

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

export const withWords = (id: string, edit: (w: BlockWords) => BlockWords): Record<string, BlockWords> => ({ ...CHINESE_SAMPLE_WORDS, [id]: edit(CHINESE_SAMPLE_WORDS[id]) });
