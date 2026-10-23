/**
 * Admin Panel → Documentation: a guide is a list of sections, each a heading
 * and plain blocks, so the words can be built from live settings and tested
 * without rendering. `components/settings/doc-article.tsx` draws them.
 */

/** A link to another Admin Panel page or a public page, without the locale. */
export interface DocLink {
  label: string;
  href: string;
}

export type DocBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "note"; text: string }
  | { kind: "links"; items: DocLink[] };

export interface DocSection {
  /** The anchor: lower case and dashes. */
  id: string;
  heading: string;
  blocks: DocBlock[];
}

export interface DocGuide {
  slug: string;
  title: string;
  summary: string;
  /** When its words last changed, as people read a date: "23 October 2026". */
  updated: string;
}
