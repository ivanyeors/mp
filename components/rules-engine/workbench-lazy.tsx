"use client";

import dynamic from "next/dynamic";

export const RulesEngineWorkbenchLazy = dynamic(
  () => import("./workbench").then((m) => m.RulesEngineWorkbench),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[60vh] w-full animate-pulse rounded-lg bg-muted" />
    ),
  },
);
