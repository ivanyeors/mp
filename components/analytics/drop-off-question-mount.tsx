"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { dropOffStepForPath } from "@/lib/analytics/drop-off/reasons";

const DropOffQuestion = dynamic(() => import("./drop-off-question").then((m) => m.DropOffQuestion), { ssr: false });

export function DropOffQuestionMount() {
  const pathname = usePathname() ?? "/";
  return dropOffStepForPath(pathname) ? <DropOffQuestion /> : null;
}
