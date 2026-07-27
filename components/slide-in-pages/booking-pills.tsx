"use client";

import Link from "next/link";

import { APPT_TYPES, type ApptType } from "@/lib/appointments/appt-type";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";

const PILL_CLASS =
  "flex min-h-28 flex-1 items-center justify-center rounded-full border bg-background px-8 py-6 text-center text-2xl font-normal shadow-md transition-all hover:border-foreground/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] md:text-3xl";

type Props = {
  /** Locale segment — builds the `?type=…` link when no `onSelect` is given. */
  lang: string;
  /** Overlay usage (slice 05): pick a type without navigating. Omit → pills are links. */
  onSelect?: (type: ApptType) => void;
  className?: string;
};

/**
 * Large rounded-pill type picker (Customise / Readjust), styled after the hero tier pills.
 * Inline on `/[lang]/appointments` now; hosted in a Dialog overlay in slice 05.
 */
export function BookingPills({ lang, onSelect, className }: Props) {
  const { m } = useI18n();
  const t = m.slides.bookAppointment.flow;
  const label = (type: ApptType) => (type === "customisation" ? t.customisation : t.readjustment);

  return (
    <div className={cn("flex w-full flex-col gap-4 md:flex-row", className)}>
      {APPT_TYPES.map((type) =>
        onSelect ? (
          <button key={type} type="button" className={PILL_CLASS} onClick={() => onSelect(type)}>
            {label(type)}
          </button>
        ) : (
          <Link key={type} href={`/${lang}/appointments?type=${type}`} className={PILL_CLASS}>
            {label(type)}
          </Link>
        ),
      )}
    </div>
  );
}
