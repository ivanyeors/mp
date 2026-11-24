"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function Spotlight({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div
      {...rest}
      className={cn("group/spot relative isolate", className)}
      onPointerMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--spot-x", `${e.clientX - box.left}px`);
        e.currentTarget.style.setProperty("--spot-y", `${e.clientY - box.top}px`);
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-300 [background:radial-gradient(380px_circle_at_var(--spot-x,50%)_var(--spot-y,0%),rgb(16_185_129/0.12),transparent_65%)] group-hover/spot:opacity-100 motion-reduce:hidden"
      />
      {children}
    </div>
  );
}

const FOCUS = [
  { value: "all", label: "Everyone" },
  { value: "attention", label: "Needs you" },
  { value: "quiet", label: "Paused or waiting" },
] as const;

type Focus = (typeof FOCUS)[number]["value"];

export function OrgFocus({ counts, head, children }: { counts: Record<Focus, number>; head: ReactNode; children: ReactNode }) {
  const [focus, setFocus] = useState<Focus>("all");
  return (
    <div data-focus={focus} className="group/org space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
      {head}
      <div role="radiogroup" aria-label="Show agents" className="inline-flex rounded-full border bg-muted/50 p-0.5 text-xs">
        {FOCUS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={focus === f.value}
            onClick={() => setFocus(f.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium text-muted-foreground transition",
              focus === f.value ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
            )}
          >
            {f.label}
            <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] tabular-nums">{counts[f.value]}</span>
          </button>
        ))}
      </div>
      </div>
      {children}
    </div>
  );
}

export function AgentSheet({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Sheet open onOpenChange={(open) => (open ? null : router.push(pathname, { scroll: false }))}>
      <SheetContent side="right" mobilePreset="full" className="w-full gap-0 p-0 sm:max-w-3xl">
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <SheetDescription className="sr-only">{description}</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  );
}

export function Peek({ trigger, children, className }: { trigger: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className={cn("w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl p-0", className)}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function SidePanel({ trigger, title, description, children }: { trigger: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" mobilePreset="full" className="w-full gap-0 p-0 sm:max-w-xl">
        <div className="border-b bg-gradient-to-br from-muted/70 to-background px-5 pb-4 pt-6">
          <SheetTitle className="pr-10 text-lg tracking-tight">{title}</SheetTitle>
          <SheetDescription className="mt-1 text-xs">{description}</SheetDescription>
        </div>
        <div className="px-5 py-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

