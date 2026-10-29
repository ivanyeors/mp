import * as React from "react"

import { cn } from "@/lib/utils"

// Padding and gap read --card-py / --card-px / --card-gap (default 1.5rem), so a
// surface can tighten every card inside it at once: the Admin Panel shell sets
// 1rem on phones. A caller's own `py-*` / `px-*` / `gap-*` still wins.

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-[var(--card-gap,1.5rem)] rounded-xl border py-[var(--card-py,1.5rem)] shadow-sm",
        className
      )}
      {...props}
    />
  )
}

// With a CardAction the header is one column on a phone (title, description,
// then the action at full width) and two from `sm` (action top-right). The
// phone column is minmax(0,1fr) so a wide action cannot push it past the card
// edge. Don't pin the action to a later row from the caller: that leaves
// column 2 free, and auto-placement puts the description there as a sliver.
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 max-md:grid-rows-none px-[var(--card-px,1.5rem)] has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-[var(--card-px,1.5rem)]", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-[var(--card-px,1.5rem)] [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
