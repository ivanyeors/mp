import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, forwardedRef) => {
    const localRef = React.useRef<HTMLInputElement | null>(null)

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        localRef.current = node
        if (typeof forwardedRef === "function") forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef]
    )

    const bumpValue = React.useCallback(
      (delta: number) => {
        const el = localRef.current
        if (!el || el.disabled || el.readOnly) return

        const stepProp = props.step
        const step =
          typeof stepProp === "number"
            ? stepProp
            : typeof stepProp === "string" && stepProp !== "any"
              ? Number(stepProp)
              : 1

        const min =
          props.min === undefined || props.min === ""
            ? undefined
            : typeof props.min === "number"
              ? props.min
              : Number(props.min)
        const max =
          props.max === undefined || props.max === ""
            ? undefined
            : typeof props.max === "number"
              ? props.max
              : Number(props.max)

        const currentRaw = el.value
        const current = currentRaw === "" ? 0 : Number(currentRaw)
        const base = Number.isFinite(current) ? current : 0
        const nextUnclamped = base + delta * (Number.isFinite(step) && step !== 0 ? step : 1)
        const next =
          typeof min === "number" && Number.isFinite(min) && nextUnclamped < min
            ? min
            : typeof max === "number" && Number.isFinite(max) && nextUnclamped > max
              ? max
              : nextUnclamped

        // Trigger React onChange for both controlled and uncontrolled inputs.
        const valueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set
        valueSetter?.call(el, String(next))
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.focus()
      },
      [props.max, props.min, props.step]
    )

    const baseClassName = cn(
      "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
      "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
      "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
      className
    )

    if (type !== "number") {
      return <input ref={setRefs} type={type} data-slot="input" className={baseClassName} {...props} />
    }

    const showControls = !props.disabled && !props.readOnly

    return (
      <div className="group relative w-full">
        <input
          ref={setRefs}
          type="number"
          data-slot="input"
          className={cn(
            baseClassName,
            "pr-18 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          )}
          {...props}
        />

        {showControls && (
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              type="button"
              aria-label="Decrease value"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => bumpValue(-1)}
              className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background/70 shadow-xs backdrop-blur-sm"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            <button
              type="button"
              aria-label="Increase value"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => bumpValue(1)}
              className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background/70 shadow-xs backdrop-blur-sm"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
