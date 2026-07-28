"use client";

import Link from "next/link";

import { APPT_TYPES, type ApptType } from "@/lib/appointments/appt-type";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";

// Brand blue dock-panel gradient — same literal as home-header / dock / firmness-scale.
const BLUE_GRADIENT =
  "linear-gradient(rgb(0, 23, 54) 0%, rgb(43, 105, 188) 100%), linear-gradient(90deg, rgb(7, 55, 120) 0%, rgb(7, 55, 120) 100%)";

// Shared pill shape: big, fully-rounded, mono (inherited from body), soft shadow, press feedback.
const PILL_BASE =
  "relative z-0 flex min-h-28 flex-1 items-center justify-center rounded-full px-8 py-6 text-center text-2xl font-normal shadow-md transition-all duration-300 ease-out hover:z-10 hover:shadow-xl focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] md:min-h-36 md:text-3xl md:hover:rotate-0 md:hover:scale-105";
// Customise = blue "Sign in" pill; Readjust = neutral "Support" pill (Image #4 pairing).
const BLUE_PILL = "border-0 text-white";
const NEUTRAL_PILL = "border bg-card text-card-foreground hover:border-foreground/20";
// Creative tilt (Image #8, hero Basic/Premium): opposite rotations + slight overlap on desktop,
// straightened by md:hover:rotate-0 above. Mobile stays flat/stacked (no md: → identity).
const TILT = ["md:-rotate-6", "md:rotate-[12deg] md:-ml-8"] as const;

type Props = {
  /** Locale segment — builds the `?type=…` link when no `onSelect` is given. */
  lang: string;
  /** Overlay usage (slice 05): pick a type without navigating. Omit → pills are links. */
  onSelect?: (type: ApptType) => void;
  className?: string;
};

/**
 * Large rounded-pill type picker (Customise / Readjust), styled after the dock auth pills
 * (Image #4): Customise is the blue-gradient primary, Readjust the neutral card pill.
 * Inline on `/[lang]/appointments` now; hosted in a Dialog overlay in slice 05.
 */
export function BookingPills({ lang, onSelect, className }: Props) {
  const { m } = useI18n();
  const t = m.slides.bookAppointment.flow;
  const label = (type: ApptType) => (type === "customisation" ? t.customisation : t.readjustment);
  const primary = (type: ApptType) => type === "customisation";

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center gap-4 md:flex-row md:justify-center md:gap-0 md:py-4",
        className,
      )}
    >
      {APPT_TYPES.map((type, idx) => {
        const isPrimary = primary(type);
        const cls = cn(PILL_BASE, isPrimary ? BLUE_PILL : NEUTRAL_PILL, TILT[idx] ?? "");
        const style = isPrimary ? { backgroundImage: BLUE_GRADIENT } : undefined;
        return onSelect ? (
          <button key={type} type="button" className={cls} style={style} onClick={() => onSelect(type)}>
            {label(type)}
          </button>
        ) : (
          <Link key={type} href={`/${lang}/appointments?type=${type}`} className={cls} style={style}>
            {label(type)}
          </Link>
        );
      })}
    </div>
  );
}
