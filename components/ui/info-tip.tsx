"use client"

import * as React from "react"
import { Info } from "lucide-react"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/** (i) button beside a heading; tap or click opens the explanatory copy in a popover. */
function InfoTip({
  children,
  label = "About this",
  className,
}: {
  children: React.ReactNode
  label?: string
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "text-muted-foreground hover:text-foreground focus-visible:ring-ring relative inline-flex after:absolute after:-inset-2.5 after:content-[''] size-6 shrink-0 items-center justify-center rounded-full align-middle outline-none focus-visible:ring-2",
          className
        )}
      >
        <Info className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 text-sm leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  )
}

export { InfoTip }
