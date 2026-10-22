// ============================================================
// Campaign emails Staff write: Admin Panel → Email campaigns
// ============================================================
//
// PRD-email-marketing. Staff write the subject, an inbox preview line, the
// body and one optional button; this renders it in the branded shell with the
// footer's unsubscribe link. It is campaign mail: the sender
// (lib/email-campaigns/sender.ts) sends it through the campaign transport
// only, with `List-Unsubscribe`.
//
// The body is plain text, never HTML, so nothing Staff type can inject markup:
//
//   a blank line         starts a new paragraph
//   a line "- item"      is a bullet (a run of them is one list)
//   a line "## Heading"  is a heading
//   https://…            becomes a link, in a paragraph, shown without the https://
//
// The renderer is pure: the sender resolves the button's link per recipient.

import { renderEmailShell } from "./base";
import { bulletList, heading, link, paragraphHtml } from "./components";
import { escapeHtml } from "./html";
import type { RenderedEmail } from "./types";

/** Why they get it: the footer's note on every composed campaign. */
export const COMPOSED_CAMPAIGN_NOTE = "You're getting this because you agreed to receive emails from Mpillow.";

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
const URL_IN_TEXT = /https:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'’”]/g;

/** How a link reads in the email: `mpillow.com/faq`, never a raw `https://` (the email contract). */
export function linkLabel(url: string): string {
  return url.replace(/^https:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

/** One line of text, escaped, with its https links as links. */
function lineHtml(text: string): string {
  let out = "";
  let at = 0;
  for (const m of text.matchAll(URL_IN_TEXT)) {
    out += escapeHtml(text.slice(at, m.index));
    out += link({ href: m[0], label: linkLabel(m[0]) });
    at = m.index! + m[0].length;
  }
  return out + escapeHtml(text.slice(at));
}

export interface ComposedCampaignContent {
  subject: string;
  /** The inbox preview line; null uses the start of the body. */
  preheader: string | null;
  body: string;
  /** Open with "Hi <first name>,". */
  greeting: boolean;
}

export interface ComposedCampaignEmailData extends ComposedCampaignContent {
  firstName: string | null;
  /** The button, resolved for this recipient; null for none. */
  button: { label: string; href: string } | null;
  /** The Customer's unsubscribe confirm page. */
  unsubscribeUrl: string;
}

const greet = (firstName: string | null) => {
  const name = firstName?.replace(/\s+/g, " ").trim();
  return name ? `Hi ${name},` : "Hi,";
};

export function renderComposedCampaignEmail(p: ComposedCampaignEmailData): RenderedEmail {
  const subject = p.subject.replace(/\s+/g, " ").trim();
  const blocks = parseCampaignBody(p.body);
  const greeting = p.greeting ? greet(p.firstName) : null;

  const html: string[] = [];
  const text: string[] = [];
  if (greeting) {
    html.push(paragraphHtml(escapeHtml(greeting)));
    text.push(greeting, "");
  }
  blocks.forEach((b, i) => {
    if (b.kind === "heading") {
      html.push(heading(b.text, 2, { top: i === 0 && !greeting ? 0 : 12 }));
      text.push(b.text, "");
    } else if (b.kind === "bullets") {
      html.push(bulletList(b.items));
      text.push(...b.items.map((item) => `- ${item}`), "");
    } else {
      html.push(paragraphHtml(b.lines.map(lineHtml).join("<br />")));
      text.push(...b.lines, "");
    }
  });
  if (p.button) text.push(`${p.button.label}: ${p.button.href}`, "");
  text.push(COMPOSED_CAMPAIGN_NOTE, `Unsubscribe: ${p.unsubscribeUrl}`);

  const preheader = p.preheader?.replace(/\s+/g, " ").trim();
  return {
    subject,
    html: renderEmailShell({
      title: subject,
      ...(preheader ? { preheader } : {}),
      bodyHtml: html.join("\n"),
      ...(p.button ? { cta: { href: p.button.href, label: p.button.label } } : {}),
      footer: COMPOSED_CAMPAIGN_NOTE,
      unsubscribeUrl: p.unsubscribeUrl,
    }),
    text: text.join("\n"),
  };
}
