// ============================================================
// A legacy campaign's plain-text body, read into its parts
// ============================================================
//
// PRD-email-marketing: campaigns written before the block editor are plain
// text (lib/email/campaigns.ts renders them). Split out of campaigns.ts, with
// no imports, so the editor's *Convert to blocks* reads a body exactly as the
// renderer does, in the browser, without the email shell
// (PRD-campaign-email-editor slice 03).
//
//   a blank line         starts a new paragraph
//   a line "- item"      is a bullet (a run of them is one list)
//   a line "## Heading"  is a heading
//   https://…            becomes a link, in a paragraph, shown without the https://

export type CampaignBlock =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "heading"; text: string };

/** Pure — the body's blocks, in order. Empty lines and empty items are dropped. */
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

// An https link, up to whitespace; trailing punctuation stays text.
export const URL_IN_TEXT = /https:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'’”]/g;

/** How a link reads in the email: `mpillow.com/faq`, never a raw `https://` (the email contract). */
export function linkLabel(url: string): string {
  return url.replace(/^https:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

/** Pure — one paragraph line as its text and its https links, in order, as the renderer links them. */
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
