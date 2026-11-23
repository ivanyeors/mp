"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "cn"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-[linear-gradient(#001736_0%,#0e3466_100%),linear-gradient(90deg,#073778_0%,#073778_100%)] shadow-[inset_1px_1px_1.8px_0px_rgba(54,140,255,0.5),inset_-4px_13px_28.4px_0px_rgba(6,38,82,0.5)]",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 rounded-full bg-[linear-gradient(90deg,#00041a_0%,#1298ff_75.481%,#a5d8ff_100%)] shadow-[inset_1px_1px_1.8px_0px_rgba(194,220,255,0.5),inset_-4px_13px_28.4px_0px_rgba(102,167,255,0.25)] transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
