"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The active value, mirrored out of Radix. Radix keeps it in a private context,
 * and a collapsed `TabsList` needs it to label its own button.
 */
const TabsValueContext = React.createContext<string | undefined>(undefined)

function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState<
    string | undefined
  >(defaultValue)

  const handleValueChange = React.useCallback(
    (next: string) => {
      setUncontrolledValue(next)
      onValueChange?.(next)
    },
    [onValueChange]
  )

  return (
    <TabsValueContext.Provider value={value ?? uncontrolledValue}>
      <TabsPrimitive.Root
        data-slot="tabs"
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        className={cn("flex flex-col gap-2", className)}
        {...props}
      />
    </TabsValueContext.Provider>
  )
}

// A tab strip has exactly two legal shapes: one un-clipped row, or — when that
// row cannot fit the width it is given — a single full-width button that opens
// the same tablist as a menu. It never wraps onto a second line and it never
// side-scrolls: both leave triggers half-cut at the container edge, which is
// how a phone ends up showing "…eeds assign" against the screen edge.
const TABS_LIST_ROW =
  "bg-muted text-muted-foreground inline-flex h-9 max-md:h-11 w-fit items-center justify-center rounded-lg p-1"

// Appended last so it beats anything a caller passes: the row must stay a
// single un-scrolled line for the overflow measurement below to mean anything.
const TABS_LIST_ROW_GUARD = "max-w-full flex-nowrap overflow-hidden"

const TABS_LIST_MENU =
  "bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1 flex w-full flex-col items-stretch gap-0.5 rounded-lg border p-1 shadow-md " +
  "[&>[data-slot=tabs-trigger]]:h-10 [&>[data-slot=tabs-trigger]]:w-full [&>[data-slot=tabs-trigger]]:flex-none [&>[data-slot=tabs-trigger]]:justify-start [&>[data-slot=tabs-trigger]]:px-3"

function TabsList({
  className,
  collapsible = true,
  onClick,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  /** Opt out of collapse-to-menu (e.g. an underline tab bar that must stay a row). */
  collapsible?: boolean
}) {
  const activeValue = React.useContext(TabsValueContext)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const collapsed = collapsible && overflowing

  const children = props.children

  // Labels come off the triggers' own props, so the button can be rendered
  // without the row being laid out.
  const options = React.useMemo(() => {
    const found: { value: string; label: React.ReactNode }[] = []
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return
      const childProps = child.props as {
        value?: unknown
        children?: React.ReactNode
      }
      if (typeof childProps.value === "string") {
        found.push({ value: childProps.value, label: childProps.children })
      }
    })
    return found
  }, [children])

  const activeLabel =
    options.find((option) => option.value === activeValue)?.label ??
    options[0]?.label

  // While it is a row — expanded, or collapsed-and-closed, where it is parked
  // invisible at the same width — the same comparison decides both directions,
  // so the control cannot oscillate at the breakpoint.
  React.useLayoutEffect(() => {
    // Nothing to measure while it is a column, or when the caller opted out.
    if (!collapsible || open) return

    const measure = () => {
      const list = listRef.current
      if (!list) return
      setOverflowing(list.scrollWidth - list.clientWidth > 1)
    }

    measure()

    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    if (listRef.current) observer.observe(listRef.current)
    if (rootRef.current) observer.observe(rootRef.current)
    return () => observer.disconnect()
  }, [collapsible, open, children])

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const showAsMenu = collapsed && open

  return (
    <div
      ref={rootRef}
      data-slot="tabs-list-container"
      data-collapsed={collapsed ? "" : undefined}
      className="relative w-full min-w-0"
    >
      {collapsed && (
        <button
          type="button"
          data-slot="tabs-list-summary"
          aria-expanded={open}
          onClick={() => setOpen((previous) => !previous)}
          className="bg-muted text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-transparent px-3 text-sm font-medium focus-visible:ring-[3px] max-md:h-11"
        >
          <span className="min-w-0 truncate text-left">{activeLabel}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 opacity-60 transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
      )}
      <TabsPrimitive.List
        ref={listRef}
        data-slot="tabs-list"
        // Collapsed-and-closed keeps the row mounted but out of flow and out of
        // the tab order, purely so it stays measurable at the real width.
        className={
          showAsMenu
            ? TABS_LIST_MENU
            : cn(
                TABS_LIST_ROW,
                className,
                TABS_LIST_ROW_GUARD,
                collapsed && "invisible pointer-events-none absolute top-0 left-0"
              )
        }
        onClick={(event) => {
          onClick?.(event)
          if (
            open &&
            (event.target as HTMLElement).closest('[data-slot="tabs-trigger"]')
          ) {
            setOpen(false)
          }
        }}
        {...props}
      />
    </div>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow,background-color] after:absolute after:inset-x-0 after:-inset-y-[5px] after:content-[''] data-[state=inactive]:active:bg-background/60 focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
