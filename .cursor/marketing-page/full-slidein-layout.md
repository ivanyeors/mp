---
trigger: model_decision
description: when required to work on slide-in drawers / layout from the right. When also working on mobile view
---

### Slide-in “full-page” drawer layout (right side)

Use this pattern when you want an **inline popup experience** that feels like a page, but **slides in from the right** (desktop) and **covers the whole screen on mobile**.

### What we implemented (baseline)
- **Trigger**: a button/link that opens the drawer.
- **Container**: `Sheet` + `SheetContent side="right"` (Radix Dialog under the hood).
- **Sizing**:
  - **Mobile**: `w-full` (100% width)
  - **Desktop**: choose one:
    - **Full width**: `w-full` (true full-screen drawer)
    - **Wide drawer**: `md:w-[70vw]` (page-like drawer while preserving context)
  - **Important**: override any built-in max-width constraints with `sm:max-w-none max-w-none`.
- **Close**: for page-like drawers, put the close button **inside the header** using `SheetClose` + an `XIcon` (see template). (Avoid relying on the default `SheetContent` close placement.)
- **Content fill**: remove inner padding wrappers; let content fill available height using `flex-1`.

### Required component support (already added)
We extended `components/ui/sheet.tsx` with:
- **`disableMobileBottom?: boolean`** on `SheetContent`
  - When `true`, mobile keeps the drawer on the **right** (instead of switching to bottom-sheet).
- **`hideClose?: boolean`** on `SheetContent`
  - When `true`, hides the default close button so you can render a header-scoped close action.

### Copy/paste template (recommended)
Use this template for any “open drawer from the right” UI.

### Full-screen “page chrome” requirements (use these defaults)

When this drawer is used as a **page-like flow**, it should include:
- **Full-screen height**: use dynamic viewport height on mobile (`100dvh`) to avoid iOS address-bar issues.
- **Framed shell (outer gutter + inner panel)**:
  - Put **outer padding on the sheet content** (gutter): `p-3 md:p-6 bg-transparent border-0 shadow-none`
  - Render an **inner rounded panel**: `rounded-2xl border bg-background shadow-sm overflow-hidden`
- **Outer padding (content padding)**: apply padding to the *scrollable content area* (not the sheet root) so the header stays flush/sticky.
- **Progress bar**: if the content is a multi-step flow, show progress as a sticky bar under the header.
- **Features block**: show a “features / benefits” list alongside (desktop) or below (mobile) to reinforce context.

```tsx
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Progress } from "@/components/ui/progress"
import { XIcon } from "lucide-react"

export function ExampleDrawer() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open</Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        disableMobileBottom
        hideClose
        className="w-full max-w-none sm:max-w-none p-3 md:p-6 bg-transparent border-0 shadow-none overflow-hidden"
      >
        {/* Framed shell: inner rounded panel */}
        <div className="flex h-[100dvh] flex-col overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
            <SheetHeader className="relative pr-12">
              <SheetTitle>Drawer title</SheetTitle>

              {/* Header-scoped close button (preferred for page-like drawers) */}
              <SheetClose asChild>
                <button
                  type="button"
                  className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
                >
                  <XIcon className="size-4" />
                  <span className="sr-only">Close</span>
                </button>
              </SheetClose>
            </SheetHeader>

            {/* Optional: progress indicator for multi-step flows */}
            <div className="px-4 pb-4 md:px-8 md:pb-5">
              <Progress value={33} className="h-1" />
            </div>
          </div>

          {/* Content area fills remaining height */}
          <div className="flex-1 overflow-y-auto">
            {/* Outer padding: smaller on mobile, larger on desktop */}
            <div className="px-4 py-5 md:px-8 md:py-8">
              {/* Recommended: content + features */}
              <div className="grid gap-8 md:grid-cols-[1fr_320px]">
                <main className="min-w-0">
                  {/* Replace with your main content */}
                  <div className="min-h-[200px]">...</div>
                </main>

                <aside className="space-y-3 md:pt-1">
                  {/* Features / benefits list (keep scannable) */}
                  <div className="text-sm font-medium text-foreground">Features</div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Feature one</li>
                    <li>• Feature two</li>
                    <li>• Feature three</li>
                  </ul>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

### Notes on outer padding / sticky UI

- For page-like drawers, prefer the **framed shell**:
  - SheetContent gutter: `p-3 md:p-6 bg-transparent border-0 shadow-none`
  - Inner panel: `rounded-2xl border bg-background shadow-sm overflow-hidden`
- Put padding on the **scrollable content container** (`px-4 py-5 md:px-8 md:py-8`) so:
  - header/progress stay aligned and sticky
  - content remains readable on large screens
- If you add sticky header + sticky progress, ensure they are **theme-adaptive** (`bg-background/80 backdrop-blur border-b`).
- If you want a **true full-screen drawer**, keep `w-full`. If you want to preserve more of the underlying page, add `md:w-[70vw]`.

### If embedding an external page (iframe)
To make it feel “full-page”, ensure the iframe takes full height of the content area.

```tsx
<div className="flex-1 overflow-hidden">
  <iframe
    src="https://example.com"
    style={{ border: 0 }}
    width="100%"
    height="100%"
    frameBorder="0"
    title="Embedded content"
  />
</div>
```

### Gotchas (things that will bite you)
- **Drawer looks ~30% wide**:
  - Cause: `SheetContent` base styles include `sm:max-w-sm`.
  - Fix: add `sm:max-w-none max-w-none` to your `SheetContent` className.
- **Mobile drawer appears from bottom**:
  - Cause: `SheetContent` auto-converts left/right → bottom on mobile.
  - Fix: pass `disableMobileBottom`.
- **Close (X) disappears**:
  - Cause: sticky headers / iframe layering can cover it.
  - Fix: ensure the close button has a high z-index (we set `z-50` in `SheetContent`).
- **Content feels cramped**:
  - Cause: inner padding wrappers like `p-6`.
  - Fix: remove extra wrappers and use `p-0` on the sheet; add padding only where you truly want it.

### When to choose this layout
- **Use the drawer** when:
  - the content is “page-like” (forms, booking, configuration, previews)
  - you want to preserve context on the underlying page
  - you need a strong “slide-in” interaction that users can dismiss quickly
- **Use a modal** when:
  - the content is short and doesn’t need full-height interaction
  - you want focus/confirmation rather than navigation-like flow
