"use client"

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

        // Round to step precision to avoid floating point issues
        const stepDecimals = String(step).includes(".") ? String(step).split(".")[1].length : 0
        const rounded = stepDecimals > 0 ? Number(next.toFixed(stepDecimals)) : next

        // Trigger React onChange for both controlled and uncontrolled inputs.
        const valueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set
        valueSetter?.call(el, String(rounded))
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.focus()
      },
      [props.max, props.min, props.step]
    )

    const baseClassName = cn(
      "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 max-md:min-h-11 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
      "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
      "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
      className
    )

    if (type !== "number") {
      return <input ref={setRefs} type={type} data-slot="input" className={baseClassName} {...props} />
    }

    // Render number inputs as type="text" with inputMode to fix decimal typing
    // in controlled React inputs. Browsers strip trailing dots from type="number"
    // value (Safari returns "" for "4."), breaking decimal entry.
    const stepProp = props.step
    const stepNum =
      typeof stepProp === "number"
        ? stepProp
        : typeof stepProp === "string" && stepProp !== "any"
          ? Number(stepProp)
          : 1
    const allowsDecimals = String(stepNum).includes(".") || stepProp === "any"
    const inputMode = allowsDecimals ? "decimal" as const : "numeric" as const

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow: backspace, delete, tab, escape, enter, arrows, home, end
      if (
        ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key) ||
        // Allow Ctrl/Cmd+A, C, V, X
        ((e.ctrlKey || e.metaKey) && ["a", "c", "v", "x"].includes(e.key.toLowerCase()))
      ) {
        // ArrowUp/Down: bump value
        if (e.key === "ArrowUp") { e.preventDefault(); bumpValue(1) }
        if (e.key === "ArrowDown") { e.preventDefault(); bumpValue(-1) }
        props.onKeyDown?.(e)
        return
      }
      // Allow digits
      if (/^[0-9]$/.test(e.key)) { props.onKeyDown?.(e); return }
      // Allow decimal point (only one)
      if ((e.key === "." || e.key === ",") && allowsDecimals && !e.currentTarget.value.includes(".")) {
        props.onKeyDown?.(e)
        return
      }
      // Allow minus sign at start
      if (e.key === "-" && e.currentTarget.selectionStart === 0 && !e.currentTarget.value.includes("-")) {
        props.onKeyDown?.(e)
        return
      }
      // Block everything else
      e.preventDefault()
      props.onKeyDown?.(e)
    }

    const showControls = !props.disabled && !props.readOnly

    const textProps = { ...props };
    delete (textProps as { min?: unknown }).min;
    delete (textProps as { max?: unknown }).max;
    delete (textProps as { step?: unknown }).step;
    delete (textProps as { onKeyDown?: unknown }).onKeyDown;
    delete (textProps as { inputMode?: unknown }).inputMode;

    return (
      <div className="group relative w-full @container">
        <input
          ref={setRefs}
          type="text"
          inputMode={inputMode}
          data-slot="input"
          className={cn(
            baseClassName,
            "@[10rem]:pr-18"
          )}
          onKeyDown={handleKeyDown}
          {...textProps}
        />

        {showControls && (
          <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto @[10rem]:flex">
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
