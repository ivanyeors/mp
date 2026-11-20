"use client";

import { lazy, Suspense, useSyncExternalStore } from "react";
import type { RichTextValue, RichTextVariable } from "./rich-text-doc";
import type { RichTextMarks } from "./rich-text-schema";
import { RichTextView } from "./rich-text-view";

export type { RichTextMarks } from "./rich-text-schema";
export type { RichTextRun, RichTextValue, RichTextVariable } from "./rich-text-doc";
export { RichTextView } from "./rich-text-view";

export interface RichTextProps {
  value: RichTextValue;
  onChange: (next: RichTextValue, how: { paste: boolean }) => void;
  marks?: RichTextMarks;
  variables?: readonly RichTextVariable[];
  placeholder?: string;
  singleLine?: boolean;
  readOnly?: boolean;
  onSlash?: () => void;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
}

const RichTextEditor = lazy(() => import("./rich-text-editor"));

const noSubscribe = () => () => undefined;

export function RichText(props: RichTextProps) {
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
