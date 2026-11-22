"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"
import { ChevronDown } from "lucide-react"

import { cn } from "cn"

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

/**
 * How a strip looks. `default` is the filled segmented control; `line` is a
 * bare row of labels on a hairline, the active one underlined (page-level
 * sections such as a product's Description / Specifications / Reviews).
 * Each variant has its own complete class strings rather than `line` undoing
 * `default` from a call site: the default trigger's `dark:` active styles
 * outrank any plain `data-[state=active]:` override, which is how the product
 * page's hand-rolled underline turned into a filled box in dark mode.
 */
type TabsVariant = "default" | "line"

/** Set by `TabsList`, read by its triggers, so a call site names it once. */
const TabsVariantContext = React.createContext<TabsVariant>("default")

/**
 * `lg` is for `line` only: the tabs that divide a whole page (a Customer's
 * Journey / Pillow and fittings / Reviews), where the row has to be found at a
 * glance. 48px tall, 16px semibold labels, a 3px underline. `default` ignores
 * it.
 */
type TabsSize = "default" | "lg"

const TabsSizeContext = React.createContext<TabsSize>("default")

const TABS_LIST_ROW_LG = "h-12 max-md:h-12"
const TABS_LIST_SUMMARY_LG = "h-12 text-base font-semibold max-md:h-12"
const TABS_TRIGGER_LG =
  "gap-2 px-5 text-base font-semibold after:h-[3px] [&_svg:not([class*='size-'])]:size-[18px]"

// A tab strip has exactly two legal shapes: one un-clipped row, or — when that
// row cannot fit the width it is given — a single full-width button that opens
// the same tablist as a menu. It never wraps onto a second line and it never
// side-scrolls: both leave triggers half-cut at the container edge, which is
// how a phone ends up showing "…eeds assign" against the screen edge.
//
// `line` draws its hairline as an inset shadow, not a border, so the active
// trigger's 2px underline lies over it instead of stacking above it: a border
// sits outside the row's overflow clip, where no child can reach it.
const TABS_LIST_ROW: Record<TabsVariant, string> = {
  default:
    "bg-muted text-muted-foreground inline-flex h-9 max-md:h-11 w-fit items-center justify-center rounded-lg p-1",
  line: "text-muted-foreground inline-flex h-10 max-md:h-11 w-full items-stretch justify-start shadow-[inset_0_-1px_0_var(--border)]",
}

// Appended last so it beats anything a caller passes: the row must stay a
// single un-scrolled line for the overflow measurement below to mean anything.
const TABS_LIST_ROW_GUARD = "max-w-full flex-nowrap overflow-hidden"

const TABS_LIST_MENU =
  "bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1 flex w-full flex-col items-stretch gap-0.5 rounded-lg border p-1 shadow-md " +
  "[&>[data-slot=tabs-trigger]]:h-10 [&>[data-slot=tabs-trigger]]:w-full [&>[data-slot=tabs-trigger]]:flex-none [&>[data-slot=tabs-trigger]]:justify-start [&>[data-slot=tabs-trigger]]:px-3"

// The collapsed button. `line` collapses too — a half-cut trigger is the bug
// the menu exists to prevent, whatever the strip looks like — but into its own
// look: the active label and a chevron, underlined, on the same hairline. The
// filled `default` button would turn a section bar into a different control
// on exactly the screens too narrow to show the bar.
const TABS_LIST_SUMMARY: Record<TabsVariant, string> = {
  default:
    "bg-muted text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-transparent px-3 text-sm font-medium focus-visible:ring-[3px] active:bg-press max-md:h-11",
  line: "text-foreground focus-visible:ring-ring/50 flex h-10 w-full items-stretch rounded-t-md text-sm font-medium shadow-[inset_0_-1px_0_var(--border)] outline-none focus-visible:ring-[3px] focus-visible:ring-inset active:bg-press max-md:h-11",
}

// `line` only: the label and chevron inside the collapsed button, underlined
// like an active trigger.
const TABS_LIST_SUMMARY_LINE_LABEL =
  "relative flex min-w-0 items-center gap-2 px-4 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary after:content-['']"

function TabsList({
  className: classNameProp,
  collapsible = true,
  variant = "default",
  size = "default",
  onClick,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  /** `lg`: the larger `line` row for page-level sections. */
  size?: TabsSize
  /** Opt out of collapse-to-menu, for a strip that must stay a row. */
  collapsible?: boolean
  /** `line`: underlined labels on a hairline instead of a filled control. */
  variant?: TabsVariant
}) {
  const activeValue = React.useContext(TabsValueContext)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const collapsed = collapsible && overflowing
  const large = variant === "line" && size === "lg"
  // The size joins the caller's classes, ahead of the guard below.
  const className = large ? cn(TABS_LIST_ROW_LG, classNameProp) : classNameProp

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

  const summaryContent = (
    <>
      <span className="min-w-0 truncate text-left">{activeLabel}</span>
      <ChevronDown
        aria-hidden
        className={cn(
          "size-4 shrink-0 opacity-60 transition-transform",
          open && "rotate-180"
        )}
      />
    </>
  )

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
          className={cn(TABS_LIST_SUMMARY[variant], large && TABS_LIST_SUMMARY_LG)}
        >
          {variant === "line" ? (
            <span className={TABS_LIST_SUMMARY_LINE_LABEL}>{summaryContent}</span>
          ) : (
            summaryContent
          )}
        </button>
      )}
      {/* An open menu is the same popover for every variant, so its rows take
          the default trigger look: an underline means nothing in a column. */}
      <TabsVariantContext.Provider value={showAsMenu ? "default" : variant}>
       <TabsSizeContext.Provider value={large && !showAsMenu ? "lg" : "default"}>
        <TabsPrimitive.List
          ref={listRef}
          data-slot="tabs-list"
          // Collapsed-and-closed keeps the row mounted but out of flow and out of
          // the tab order, purely so it stays measurable at the real width.
          className={
            showAsMenu
              ? TABS_LIST_MENU
              : cn(
                  TABS_LIST_ROW[variant],
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
       </TabsSizeContext.Provider>
      </TabsVariantContext.Provider>
    </div>
  )
}

// `default`: the trigger's `after:` grows its hit area over the list's padding.
// `line`: the row has no padding — the trigger is the row's full height (44px
// on a phone) — so `after:` is free to be the underline. Content-width, not
// `flex-1`: an underline stretched to a third of a desktop page reads as a
// divider, not a tab. The focus ring is inset because the row clips (see
// TABS_LIST_ROW_GUARD) and has no padding for an outer ring to show in.
const TABS_TRIGGER: Record<TabsVariant, string> = {
  default:
    "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow,background-color] after:absolute after:inset-x-0 after:-inset-y-[5px] after:content-[''] data-[state=inactive]:active:bg-background/60 focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  line: "text-muted-foreground hover:text-foreground data-[state=active]:text-foreground focus-visible:ring-ring/50 relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-t-md px-4 text-sm font-medium whitespace-nowrap outline-none transition-[color,box-shadow,background-color] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:content-[''] after:transition-colors data-[state=active]:after:bg-primary data-[state=inactive]:hover:after:bg-border data-[state=inactive]:active:bg-press focus-visible:ring-[3px] focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
}

function TabsTrigger({
  className: classNameProp,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsVariantContext)
  const size = React.useContext(TabsSizeContext)
  // The size joins the caller's classes, which still win over it.
  const className = size === "lg" ? cn(TABS_TRIGGER_LG, classNameProp) : classNameProp
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(TABS_TRIGGER[variant], className)}
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
