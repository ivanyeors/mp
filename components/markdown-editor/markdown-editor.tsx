"use client";

import dynamic from "next/dynamic";

/**
 * A Storefront product's body editor: Markdown in, Markdown out, edited
 * visually by default (markdown-editor-impl.tsx). TipTap loads in the
 * browser only, after the page: until then a box of the same size holds its
 * place.
 */

export interface MarkdownEditorProps {
  /** The Markdown. */
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  /** The words' box: a `<Label htmlFor>` points here. */
  id?: string;
  "aria-labelledby"?: string;
  /** How the footer counts the words: by word, or by character for Chinese. */
  counts?: "words" | "characters";
}

function Placeholder() {
  return (
    <div className="overflow-hidden rounded-md border border-input shadow-xs dark:bg-input/30" aria-busy>
      <div className="h-10 border-b bg-muted/40 max-md:h-[6.5rem]" />
      <div className="min-h-64" />
      <div className="h-[1.875rem] border-t" />
    </div>
  );
}

export const MarkdownEditor = dynamic(() => import("./markdown-editor-impl"), { ssr: false, loading: Placeholder });
