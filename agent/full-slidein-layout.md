### Slide-in “full-page” drawer layout (right side)

Use this pattern when you want an **inline popup experience** that feels like a page, but **slides in from the right** (desktop) and **covers the whole screen on mobile**.

### What we implemented (baseline)
- **Trigger**: a button/link that opens the drawer.
- **Container**: `Sheet` + `SheetContent side="right"` (Radix Dialog under the hood).
- **Sizing**:
  - **Mobile**: `w-full` (100% width)
  - **Desktop**: `md:w-[70vw]` (70% of viewport width)
  - **Important**: override any built-in max-width constraints with `sm:max-w-none max-w-none`.
- **Close**: top-right **X icon** (built into `SheetContent`) must stay above header/iframe (`z-50`).
- **Content fill**: remove inner padding wrappers; let content fill available height using `flex-1`.

### Required component support (already added)
We extended `components/ui/sheet.tsx` with:
- **`disableMobileBottom?: boolean`** on `SheetContent`
  - When `true`, mobile keeps the drawer on the **right** (instead of switching to bottom-sheet).

### Copy/paste template (recommended)
Use this template for any “open drawer from the right” UI.

```tsx
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export function ExampleDrawer() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open</Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        disableMobileBottom
        className="w-full md:w-[70vw] max-w-none sm:max-w-none p-0 overflow-hidden"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur pr-12">
          <SheetTitle>Drawer title</SheetTitle>
        </SheetHeader>

        {/* Content area fills remaining height */}
        <div className="flex-1 overflow-hidden">
          {/* Replace with your content */}
          <div className="h-full w-full">...</div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

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
