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
  id: string;
  heading: string;
  blocks: DocBlock[];
}

export interface DocGuide {
  slug: string;
  title: string;
  summary: string;
  updated: string;
}
