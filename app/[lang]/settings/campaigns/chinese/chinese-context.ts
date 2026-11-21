"use client";

import { createContext, useContext } from "react";
import type { ChineseStatus } from "@/lib/email-campaigns/chinese-version";

export interface ChineseEditing {
  status: (id: string) => ChineseStatus | null;
  drafted: (id: string) => boolean;
  links: (id: string) => readonly string[];
  translate: ((id: string) => void) | null;
  reason: string | null;
  working: { id: string; stage: string } | null;
  stop: () => void;
  keep: (id: string) => void;
}

export const ChineseEditingContext = createContext<ChineseEditing | null>(null);

export const useChineseEditing = () => useContext(ChineseEditingContext);
