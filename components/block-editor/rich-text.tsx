"use client";

import { lazy, Suspense, useSyncExternalStore } from "react";
import type { RichTextValue, RichTextVariable } from "./rich-text-doc";
import type { RichTextMarks } from "./rich-text-schema";
import { RichTextView } from "./rich-text-view";

/**
 * The shared text input (PRD-campaign-email-editor slice 04, ADR 0036):
 * TipTap 3 with only the marks a page allows and the Variables it offers. It
 * emits a flat value of paragraphs and runs (rich-text-doc.ts), which the
 * page maps to its own model; TipTap's JSON never leaves it. A floating
 * toolbar on a selection offers **B**, *I*, Link and • List, and pasting keeps
 * only what the schema allows.
 *
 * TipTap loads in the browser only, and only once an input is on screen: the
 * page's first load carries none of it. Until then, and while the input is
 * read-only, the same words show as they read.
 */

export type { RichTextMarks } from "./rich-text-schema";
export type { RichTextRun, RichTextValue, RichTextVariable } from "./rich-text-doc";
export { RichTextView } from "./rich-text-view";

export interface RichTextProps {
  value: RichTextValue;
  /** Each change; `paste` is a paste or a drop, which a page's history keeps as a step of its own. */
  onChange: (next: RichTextValue, how: { paste: boolean }) => void;
  /** Which marks are allowed. None is plain words. */
  marks?: RichTextMarks;
  /** The Variables it offers, as chips. `{key}` typed or pasted becomes one. */
  variables?: readonly RichTextVariable[];
  placeholder?: string;
  /** One line: no paragraphs, line breaks or lists. */
  singleLine?: boolean;
  readOnly?: boolean;
  /** `/` typed in an empty line. */
  onSlash?: () => void;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  /** The words' look: size, weight. */
  className?: string;
}

const RichTextEditor = lazy(() => import("./rich-text-editor"));

const noSubscribe = () => () => undefined;

export function RichText(props: RichTextProps) {
  // False on the server and while hydrating; true in the browser after.
  const client = useSyncExternalStore(noSubscribe, () => true, () => false);
  const view = (
    <RichTextView
      value={props.value}
      variables={props.variables}
      placeholder={props.placeholder}
      singleLine={props.singleLine}
      className={props.className}
      id={props.id}
      readOnly={props.readOnly}
      aria-label={props["aria-label"]}
      aria-labelledby={props["aria-labelledby"]}
      aria-describedby={props["aria-describedby"]}
    />
  );
  if (props.readOnly || !client) return view;
  return (
    <Suspense fallback={view}>
      <RichTextEditor {...props} />
    </Suspense>
  );
}
