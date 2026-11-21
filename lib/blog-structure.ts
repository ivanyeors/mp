import { markdownToPlainText } from "@/lib/seo/meta-description";

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export type BlogHeading = { id: string; text: string };

export function extractHeadings(body: string): BlogHeading[] {
  const out: BlogHeading[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const text = markdownToPlainText(m[1]);
    if (text) out.push({ id: headingId(text), text });
  }
  return out;
}

const FAQ_HEADING = /^##\s+(frequently asked questions|faqs?|常见问题)\s*$/i;

export function extractFaq(body: string): { question: string; answer: string }[] {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => FAQ_HEADING.test(line.trim()));
  if (start < 0) return [];

  const items: { question: string; answer: string[] }[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const q = line.match(/^###\s+(.+?)\s*#*\s*$/);
    if (q) items.push({ question: markdownToPlainText(q[1]), answer: [] });
    else items.at(-1)?.answer.push(line);
  }
  return items
    .map(({ question, answer }) => ({ question, answer: markdownToPlainText(answer.join("\n")) }))
    .filter((item) => item.question && item.answer);
}
