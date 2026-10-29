// ============================================================
// Campaign emails built from typed blocks: Admin Panel → Email campaigns
// ============================================================
//
// PRD-campaign-email-editor slice 03 (ADR 0036). Staff build the email from
// Email blocks (lib/email-campaigns/content.ts); this walks them into the
// shared components inside the branded shell, so the logo, fonts, dark mode
// and the footer with its unsubscribe link are those of every email. It is
// campaign mail: the sender sends it through the campaign transport only.
//
// Nothing typed ever becomes markup. The content is checked against its schema
// first, so an unknown block type or field, a tag in the words or a link that
// is not https throws rather than renders; then every word is escaped by the
// components and every link goes through safeUrl. A run's link shows its own
// words, never the URL.
//
// Pure: the sender fills each Variable for the recipient and resolves each
// button's target to its link. As with the legacy renderer, only the editor's
// preview passes `placeholders`, drawn dashed and muted where an empty field's
// words would go; a send never does.
//
// Campaigns written before the blocks keep lib/email/campaigns.ts.

import { renderEmailShell } from "./base";
import { COMPOSED_CAMPAIGN_NOTE } from "./campaigns";
import {
  bulletListHtml,
  button,
  buttonPair,
  divider,
  heading,
  linkHtml,
  paragraphHtml,
  placeholderHint,
  spacer,
  type ButtonOptions,
} from "./components";
import { fillCopy } from "./copy";
import { escapeHtml, stripTags } from "./html";
import { SPACE } from "./theme";
import type { RenderedEmail } from "./types";
import {
  CampaignContentPreviewSchema,
  type BlockButton,
  type CampaignContent,
  type EmailBlock,
  type Run,
  type SpacerSize,
} from "@/lib/email-campaigns/content";
import type { VariableKey } from "@/lib/email-campaigns/variables";

/** What an empty block field shows in the editor's preview. */
export interface CampaignBlocksPlaceholders {
  heading: string;
  text: string;
  buttonLabel: string;
  /** An email with no blocks yet. */
  empty: string;
}

export interface CampaignBlocksEmailData {
  /** May write Variables as `{first_name}`. */
  subject: string;
  /** The inbox preview line, which may write Variables too; null uses the start of the email. */
  preheader: string | null;
  content: CampaignContent;
  /** Open with "Hi <first name>," (or "Hi,"), after the headings the email opens with. */
  greeting: boolean;
  firstName: string | null;
  /** Each Variable's words for this recipient: their own detail, else the campaign's fallback. */
  values: Record<VariableKey, string>;
  /** A button's link for this recipient; null leaves the button out. */
  buttonHref: (b: BlockButton) => string | null;
  /** The Customer's unsubscribe confirm page. */
  unsubscribeUrl: string;
  /** The editor's preview only: drawn in place of an empty field. Never set for a send. */
  placeholders?: CampaignBlocksPlaceholders;
}

const SPACER_PX: Record<SpacerSize, number> = { s: SPACE.md, m: SPACE["3xl"], l: SPACE["3xl"] * 2 };

const greet = (firstName: string | null) => {
  const name = firstName?.replace(/\s+/g, " ").trim();
  return name ? `Hi ${name},` : "Hi,";
};

/** A run's words as they read: a Variable is its value for this recipient. */
const runText = (r: Run, values: Record<VariableKey, string>) => ("var" in r ? values[r.var] : r.text);

/** Consecutive runs that share a link (or have none), so one link is one <a> and one line of text. */
function linkGroups(runs: readonly Run[]): { href: string | null; runs: Run[] }[] {
  const groups: { href: string | null; runs: Run[] }[] = [];
  for (const r of runs) {
    const href = ("href" in r && r.href) || null;
    const last = groups.at(-1);
    if (last && last.href === href) last.runs.push(r);
    else groups.push({ href, runs: [r] });
  }
  return groups;
}

/** Runs as HTML: every word escaped, a line break kept, bold and italic as marks, links through safeUrl. */
function runsHtml(runs: readonly Run[], values: Record<VariableKey, string>): string {
  return linkGroups(runs)
    .map((g) => {
      const inner = g.runs
        .map((r) => {
          let h = escapeHtml(runText(r, values)).replace(/\n/g, "<br />");
          if ("text" in r && r.italic) h = `<em>${h}</em>`;
          if ("text" in r && r.bold) h = `<strong>${h}</strong>`;
          return h;
        })
        .join("");
      return g.href ? linkHtml({ href: g.href, labelHtml: inner }) : inner;
    })
    .join("");
}

/** Runs as plain text, and each link as `words: url` for the lines after them. */
function runsText(runs: readonly Run[], values: Record<VariableKey, string>): { text: string; links: string[] } {
  const groups = linkGroups(runs);
  const words = (g: { runs: Run[] }) => g.runs.map((r) => runText(r, values)).join("");
  return {
    text: groups.map(words).join(""),
    links: groups.filter((g) => g.href).map((g) => `${words(g).replace(/\s+/g, " ").trim()}: ${g.href}`),
  };
}

const hasWords = (runs: readonly Run[]) => runs.some((r) => "var" in r || r.text.trim());

export function renderCampaignBlocksEmail(p: CampaignBlocksEmailData): RenderedEmail {
  // The schema again, whoever called: what does not parse never renders.
  const content = CampaignContentPreviewSchema.parse(p.content);
  const hint = p.placeholders;
  const values = p.values;
  const subject = fillCopy(p.subject, values).replace(/\s+/g, " ").trim();

  const html: string[] = [];
  const text: string[] = [];
  const greeting = p.greeting ? greet(p.firstName) : null;
  // The greeting opens the words: after the headings the email opens with.
  const greetAt = content.blocks.findIndex((b) => b.type !== "heading");
  const greetHere = () => {
    if (!greeting) return;
    html.push(paragraphHtml(escapeHtml(greeting)));
    text.push(greeting, "");
  };

  const render = (b: EmailBlock) => {
    switch (b.type) {
      case "heading": {
        const top = html.length === 0 ? 0 : 12;
        if (b.text) {
          html.push(heading(b.text, b.level, { top }));
          text.push(b.text, "");
        } else if (hint) html.push(placeholderHint(hint.heading, b.level === 1 ? "h1" : "h2"));
        return;
      }
      case "text": {
        const paragraphs = b.paragraphs.filter((x) => (x.kind === "p" ? hasWords(x.runs) : x.items.some(hasWords)));
        if (!paragraphs.length && hint) html.push(placeholderHint(hint.text));
        for (const para of paragraphs) {
          if (para.kind === "p") {
            const t = runsText(para.runs, values);
            html.push(paragraphHtml(runsHtml(para.runs, values)));
            text.push(t.text, ...t.links, "");
          } else {
            const items = para.items.filter(hasWords);
            const read = items.map((item) => runsText(item, values));
            html.push(bulletListHtml(items.map((item) => runsHtml(item, values))));
            text.push(...read.map((t) => `- ${t.text}`), ...read.flatMap((t) => t.links), "");
          }
        }
        return;
      }
      case "buttons": {
        // A button with no words is no button, unless the preview shows its placeholder.
        const shown: (ButtonOptions | "hint")[] = [];
        for (const x of b.buttons) {
          const href = p.buttonHref(x);
          const label = x.label.trim();
          if (!href) continue;
          if (label) shown.push({ href, label, variant: x.style });
          else if (hint) shown.push("hint");
        }
        const live = shown.filter((x): x is ButtonOptions => x !== "hint");
        for (const x of live) text.push(`${x.label}: ${x.href}`);
        if (live.length) text.push("");
        if (live.length === 2) html.push(buttonPair([live[0], live[1]]));
        else for (const x of shown) html.push(x === "hint" ? placeholderHint(hint!.buttonLabel, "button") : button(x));
        return;
      }
      case "divider":
        html.push(divider());
        text.push("---", "");
        return;
      case "spacer":
        html.push(spacer(SPACER_PX[b.size]));
        return;
      default:
        throw new Error(`Unknown email block: ${JSON.stringify((b as { type?: unknown }).type)}`);
    }
  };

  // Where the opening headings end: an inbox shows what follows them, as it
  // shows a legacy campaign's words after its title.
  let opened = 0;
  content.blocks.forEach((b, i) => {
    if (i === greetAt) {
      opened = html.length;
      greetHere();
    }
    render(b);
  });
  if (greetAt === -1) {
    opened = html.length;
    greetHere();
  }
  if (!content.blocks.length && hint) html.push(placeholderHint(hint.empty));
  text.push(COMPOSED_CAMPAIGN_NOTE, `Unsubscribe: ${p.unsubscribeUrl}`);

  const preheader =
    (p.preheader ? fillCopy(p.preheader, values).replace(/\s+/g, " ").trim() : "") || stripTags(html.slice(opened).join("\n")).slice(0, 120);
  return {
    subject,
    html: renderEmailShell({
      // The blocks carry the email's headings: the subject titles the document only.
      ...(subject ? { documentTitle: subject } : {}),
      ...(preheader ? { preheader } : {}),
      bodyHtml: html.join("\n"),
      footer: COMPOSED_CAMPAIGN_NOTE,
      unsubscribeUrl: p.unsubscribeUrl,
    }),
    text: text.join("\n"),
  };
}
