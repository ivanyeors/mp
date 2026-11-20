"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { RichTextVariable } from "./rich-text-doc";

export interface VariableTarget {
  readonly name: string;
  insert: (v: RichTextVariable) => boolean;
}

interface Targets {
  focused: (t: VariableTarget) => void;
  gone: (t: VariableTarget) => void;
  current: () => VariableTarget | null;
}

const TargetsCtx = createContext<Targets | null>(null);

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

export const useVariableTargets = () => useContext(TargetsCtx);
