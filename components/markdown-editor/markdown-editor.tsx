"use client";

import dynamic from "next/dynamic";

export interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  id?: string;
  "aria-labelledby"?: string;
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
