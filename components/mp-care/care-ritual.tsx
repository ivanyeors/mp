import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, CalendarRange, Sparkles, Sunrise } from "lucide-react";

import { MpCareWashingVideo } from "@/components/mp-care/washing-video";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Ritual = {
  id: "daily" | "weekly" | "monthly" | "yearly";
  rhythm: string;
  title: string;
  icon: LucideIcon;
  body: ReactNode;
};

function YearlyStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="font-medium text-foreground">{title}</h3>
        {children}
      </div>
    </li>
  );
}

export function MpCareRitual({ readjustHref }: { readjustHref: string }) {
  const rituals: Ritual[] = [
    {
      id: "daily",
      rhythm: "Daily",
      title: "Fluff and reshape",
      icon: Sunrise,
      body: (
        <p>
          Each morning, give your Mpillow a few pats and press it back into its M shape. This keeps
          the fillings from settling flat where your head and shoulders rest.
        </p>
      ),
    },
    {
      id: "weekly",
      rhythm: "Weekly",
      title: "Wash the cover sheets",
      icon: CalendarDays,
      body: (
        <p>
          Slip off the cover sheet and wash it the way you wash your clothes. There is no need to
          wash the whole pillow for this.
        </p>
      ),
    },
    {
      id: "monthly",
      rhythm: "Monthly",
      title: "Wash the pillow case",
      icon: CalendarRange,
      body: (
        <>
          <p>Take off the case and wash it following its care label.</p>
          <div className="rounded-xl border bg-card p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div className="space-y-1">
              <p className="font-medium text-foreground">Does your pillow feel different?</p>
              <p className="text-sm">
                If the height or support no longer feels right, we can re-adjust it for you.
              </p>
            </div>
            <Button asChild variant="outline" className="mt-3 w-full sm:mt-0 sm:w-auto">
              <Link href={readjustHref}>Book a re-adjustment</Link>
            </Button>
          </div>
        </>
      ),
    },
    {
      id: "yearly",
      rhythm: "Yearly",
      title: "Wash the whole pillow",
      icon: Sparkles,
      body: (
        <>
          <p>
            Once a year, take your Mpillow apart and wash every part: the cover sheets, the case, the
            inner protector and the fillings.
          </p>
          <ol className="space-y-6 pt-2">
            <YearlyStep n={1} title="Take it apart and wash it">
              <p>Choose your pillow to see how it is done.</p>
              <MpCareWashingVideo />
            </YearlyStep>
            <YearlyStep n={2} title="Dry the fillings in shade">
              <p>
                Dry them under sheltered sunlight, never in direct sun. Make sure they are completely
                dry before they go back in.
              </p>
            </YearlyStep>
            <YearlyStep n={3} title="Reset the fillings">
              <p>
                Before refilling, loosen and air the fillings so they get back their shape and fluff.
                You can do this between washes too, whenever your pillow starts to feel flat.
              </p>
            </YearlyStep>
          </ol>
        </>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <nav aria-label="Care ritual" className="flex flex-wrap gap-2">
        {rituals.map((ritual) => (
          <a
            key={ritual.id}
            href={`#${ritual.id}`}
            className="shrink-0 rounded-full border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            {ritual.rhythm}
          </a>
        ))}
      </nav>

      <ol className="relative">
        {rituals.map((ritual, i) => {
          const Icon = ritual.icon;
          const last = i === rituals.length - 1;
          return (
            <li
              key={ritual.id}
              id={ritual.id}
              className={cn("relative scroll-mt-24 pl-14 sm:pl-16", !last && "pb-12")}
            >
              {!last && (
                <span aria-hidden="true" className="absolute top-11 bottom-1 left-5 w-px bg-border" />
              )}
              <span
                aria-hidden="true"
                className="absolute top-0 left-0 flex size-10 items-center justify-center rounded-full border bg-background text-foreground"
              >
                <Icon className="size-4" />
              </span>
              <section aria-labelledby={`${ritual.id}-title`} className="space-y-3">
                <div className="space-y-1 pt-1">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {ritual.rhythm}
                  </p>
                  <h2 id={`${ritual.id}-title`} className="text-xl font-semibold tracking-tight">
                    {ritual.title}
                  </h2>
                </div>
                <div className="space-y-4 leading-relaxed text-muted-foreground">{ritual.body}</div>
              </section>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
