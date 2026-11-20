"use client";

import { usePathname, useRouter } from "next/navigation";

import { Select, SelectContent, SelectGroupLabel, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SLIDE_IN_PAGE_KEYS, SLIDE_IN_PAGES } from "@/lib/slide-in-pages/pages";

export const LANDING_PAGE_KEY = "landing";

export function PagePicker({
  value,
  confirmLeave,
}: {
  value: string;
  confirmLeave?: () => boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next === value) return;
        if (confirmLeave && !confirmLeave()) return;
        router.push(next === LANDING_PAGE_KEY ? pathname : `${pathname}?page=${next}`, { scroll: false });
      }}
    >
      <SelectTrigger className="h-9 min-w-[13rem]" aria-label="Page to edit" data-page-builder-picker="">
        <SelectValue placeholder="Choose a page" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={LANDING_PAGE_KEY}>Landing page</SelectItem>
        <SelectGroupLabel>Sub pages</SelectGroupLabel>
        {SLIDE_IN_PAGE_KEYS.map((key) => (
          <SelectItem key={key} value={key}>
            {SLIDE_IN_PAGES[key].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
