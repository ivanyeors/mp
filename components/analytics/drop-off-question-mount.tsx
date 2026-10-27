"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { dropOffStepForPath } from "@/lib/analytics/drop-off/reasons";

const DropOffQuestion = dynamic(() => import("./drop-off-question").then((m) => m.DropOffQuestion), { ssr: false });

/**
 * Loads the *What stopped you today?* card (PRD-crm-retention-loop slice 10)
 * only on the pages that ask it, the configurators and checkout, so no other
 * page carries its code. Leaving those pages unmounts it, which closes it.
 */
export function DropOffQuestionMount() {
  const pathname = usePathname() ?? "/";
  return dropOffStepForPath(pathname) ? <DropOffQuestion /> : null;
}
