"use client";

import { cn } from "@/lib/utils";

type FirmnessScaleProps =
  | {
      mode: "point";
      value: number;
      title?: string;
      label?: string;
      min?: number;
      max?: number;
      className?: string;
    }
  | {
      mode: "range";
      value: [number, number];
      title?: string;
      label?: string;
      min?: number;
      max?: number;
      className?: string;
    };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pct(value: number, min: number, max: number) {
  if (max <= min) return 0;
  return ((value - min) / (max - min)) * 100;
}

export function FirmnessScale({ min = 0, max = 100, className, ...props }: FirmnessScaleProps) {
  const title = props.title ?? "Firmness scale";
  const values =
    props.mode === "point"
      ? ([clamp(props.value, min, max)] as [number])
      : (() => {
          const a = clamp(props.value[0], min, max);
          const b = clamp(props.value[1], min, max);
          return (a <= b ? [a, b] : [b, a]) as [number, number];
        })();

  const label =
    props.label ??
    (props.mode === "point" ? `${values[0]}%` : `${(values as [number, number])[0]}–${(values as [number, number])[1]}%`);

  return (
    <div className={cn("space-y-2 rounded-xl border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-sm font-semibold tabular-nums text-foreground">{label}</div>
      </div>

      <div className="space-y-2">
        <div className="relative h-[18px] w-full overflow-hidden rounded-full bg-muted">
          {props.mode === "point" ? (
            <>
              <div
                className="absolute inset-y-0 left-0"
                style={{ width: `${clamp(pct(values[0], min, max), 0, 100)}%` }}
              >
                <div
                  className="absolute inset-0 dark:hidden"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgb(226, 232, 240) 0%, rgb(203, 213, 225) 100%), linear-gradient(90deg, rgb(241, 245, 249) 0%, rgb(241, 245, 249) 100%)",
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none dark:hidden"
                  style={{
                    boxShadow:
                      "inset 1px 1px 1.8px 0px rgba(255, 255, 255, 0.8), inset -4px 13px 28.4px 0px rgba(148, 163, 184, 0.3)",
                  }}
                />
                <div
                  className="absolute inset-0 hidden dark:block"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgb(0, 23, 54) 0%, rgb(43, 105, 188) 100%), linear-gradient(90deg, rgb(7, 55, 120) 0%, rgb(7, 55, 120) 100%)",
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none hidden dark:block"
                  style={{
                    boxShadow:
                      "inset 1px 1px 1.8px 0px rgba(194, 220, 255, 0.5), inset -4px 13px 28.4px 0px rgba(102, 167, 255, 0.5)",
                  }}
                />
              </div>
              <div
                className="absolute top-1/2 h-[26px] w-0.5 -translate-x-1/2 -translate-y-1/2 bg-primary"
                style={{ left: `${clamp(pct(values[0], min, max), 0, 100)}%` }}
              />
            </>
          ) : (
            <>
              <div
                className="absolute inset-y-0"
                style={{
                  left: `${clamp(pct((values as [number, number])[0], min, max), 0, 100)}%`,
                  width: `${clamp(
                    pct((values as [number, number])[1], min, max) - pct((values as [number, number])[0], min, max),
                    0,
                    100
                  )}%`,
                }}
              >
                <div
                  className="absolute inset-0 dark:hidden"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgb(226, 232, 240) 0%, rgb(203, 213, 225) 100%), linear-gradient(90deg, rgb(241, 245, 249) 0%, rgb(241, 245, 249) 100%)",
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none dark:hidden"
                  style={{
                    boxShadow:
                      "inset 1px 1px 1.8px 0px rgba(255, 255, 255, 0.8), inset -4px 13px 28.4px 0px rgba(148, 163, 184, 0.3)",
                  }}
                />
                <div
                  className="absolute inset-0 hidden dark:block"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgb(0, 23, 54) 0%, rgb(43, 105, 188) 100%), linear-gradient(90deg, rgb(7, 55, 120) 0%, rgb(7, 55, 120) 100%)",
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none hidden dark:block"
                  style={{
                    boxShadow:
                      "inset 1px 1px 1.8px 0px rgba(194, 220, 255, 0.5), inset -4px 13px 28.4px 0px rgba(102, 167, 255, 0.5)",
                  }}
                />
              </div>
              <div
                className="absolute top-1/2 h-[26px] w-0.5 -translate-x-1/2 -translate-y-1/2 bg-primary"
                style={{ left: `${clamp(pct((values as [number, number])[0], min, max), 0, 100)}%` }}
              />
              <div
                className="absolute top-1/2 h-[26px] w-0.5 -translate-x-1/2 -translate-y-1/2 bg-primary"
                style={{ left: `${clamp(pct((values as [number, number])[1], min, max), 0, 100)}%` }}
              />
            </>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Very soft</span>
          <span>Very firm</span>
        </div>
      </div>
    </div>
  );
}

