"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { RichTextVariable } from "./rich-text-doc";

/**
 * Where the Variables palette's chips land (PRD-campaign-email-editor slice
 * 13): each `RichText` inside `VariableTargets` that offers Variables marks
 * itself the target when it takes focus, so a chip pressed in the palette goes
 * to the words last written in, at their cursor. Kept apart from the palette
 * so the text input, loaded on its own, carries none of it.
 */

/** A text input a chip can go into. */
export interface VariableTarget {
  /** Its name, as a screen reader hears it: "Subject". */
  readonly name: string;
  /** Puts the Variable in at the input's cursor and focuses it; false when the input does not offer it. */
  insert: (v: RichTextVariable) => boolean;
}

interface Targets {
  /** The input that last had focus. */
  focused: (t: VariableTarget) => void;
  /** An input that is gone is no target. */
  gone: (t: VariableTarget) => void;
  current: () => VariableTarget | null;
}

const TargetsCtx = createContext<Targets | null>(null);

/** Where the palette's chips land: the `RichText` inside it that was last written in. */
export function VariableTargets({ children }: { children: ReactNode }) {
  const last = useRef<VariableTarget | null>(null);
  const targets = useMemo<Targets>(
    () => ({
      focused: (t) => {
        last.current = t;
      },
      gone: (t) => {
        if (last.current === t) last.current = null;
      },
      current: () => last.current,
    }),
    [],
  );
  return <TargetsCtx.Provider value={targets}>{children}</TargetsCtx.Provider>;
}

/** The targets around a `RichText` or a palette, or null outside any. */
export const useVariableTargets = () => useContext(TargetsCtx);
