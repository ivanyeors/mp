"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type Drawn = { chart: string; theme: string; svg: string } | { chart: string; theme: string; error: string };

export function Mermaid({ chart, className }: { chart: string; className?: string }) {
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "neutral";
  const box = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<Drawn | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme, fontFamily: "inherit" });
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled) setDrawn({ chart, theme, svg });
      })
      .catch((err: unknown) => {
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setDrawn({ chart, theme, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [chart, id, theme]);

  useEffect(() => {
    if (box.current && drawn && "svg" in drawn) box.current.innerHTML = drawn.svg;
  }, [drawn]);

  const current = drawn && drawn.chart === chart && drawn.theme === theme ? drawn : null;

  if (current && "error" in current) {
    return (
      <figure className={cn("my-4 space-y-2", className)}>
        <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-5">{chart}</pre>
        <figcaption className="text-xs text-muted-foreground">This diagram could not be drawn: {current.error}</figcaption>
      </figure>
    );
  }

  return (
    <div
      ref={box}
      role="img"
      aria-label="Diagram"
      aria-busy={!current}
      className={cn(
        "my-4 flex min-h-24 justify-center overflow-x-auto rounded-xl border bg-card/60 p-4 [&_svg]:h-auto [&_svg]:max-h-[26rem] [&_svg]:max-w-full",
        !current && "animate-pulse bg-muted/40",
        className,
      )}
    />
  );
}
