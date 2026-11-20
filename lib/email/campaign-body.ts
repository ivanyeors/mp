export type CampaignBlock =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "heading"; text: string };

export function parseCampaignBody(body: string): CampaignBlock[] {
  const blocks: CampaignBlock[] = [];
  let open: CampaignBlock | null = null;
  const close = () => {
    if (open) blocks.push(open);
    open = null;
  };

  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      close();
      continue;
    }
    const bullet = /^[-*•](?:\s+(.*))?$/.exec(line);
    const head = /^#{1,3}(?:\s+(.*))?$/.exec(line);
    if (head) {
      close();
      const text = (head[1] ?? "").trim();
      if (text) blocks.push({ kind: "heading", text });
    } else if (bullet) {
      if (open?.kind !== "bullets") {
        close();
        open = { kind: "bullets", items: [] };
      }
      const item = (bullet[1] ?? "").trim();
      if (item) (open as Extract<CampaignBlock, { kind: "bullets" }>).items.push(item);
    } else {
      if (open?.kind !== "paragraph") {
        close();
        open = { kind: "paragraph", lines: [] };
      }
      (open as Extract<CampaignBlock, { kind: "paragraph" }>).lines.push(line);
    }
  }
  close();
  return blocks.filter((b) => b.kind !== "bullets" || b.items.length > 0);
}

export const URL_IN_TEXT = /https:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'’”]/g;

export function linkLabel(url: string): string {
  return url.replace(/^https:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

export function bodyLineParts(text: string): ({ text: string } | { url: string })[] {
  const parts: ({ text: string } | { url: string })[] = [];
  let at = 0;
  for (const m of text.matchAll(URL_IN_TEXT)) {
    if (m.index! > at) parts.push({ text: text.slice(at, m.index) });
    parts.push({ url: m[0] });
    at = m.index! + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}
