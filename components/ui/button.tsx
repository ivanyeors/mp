"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { motion, type HTMLMotionProps, type Transition } from "motion/react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative overflow-hidden cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:bg-primary/80 hover:cursor-pointer",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 active:bg-destructive/80 hover:cursor-pointer focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground active:bg-press hover:cursor-pointer dark:bg-input/30 dark:border-input dark:hover:bg-input/50 dark:active:bg-press",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 active:bg-press hover:cursor-pointer",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-press hover:cursor-pointer dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline active:opacity-60 hover:cursor-pointer",
      },
      size: {
        default: "h-9 max-md:min-h-11 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 max-md:min-h-11 rounded-button gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 max-md:min-h-11 rounded-button px-6 has-[>svg]:px-4",
        icon: "size-9 max-md:min-h-11 max-md:min-w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const rippleVariants = cva('absolute rounded-full size-5 pointer-events-none', {
  variants: {
    variant: {
      default: 'bg-primary-foreground',
      destructive: 'bg-destructive',
      outline: 'bg-input',
      secondary: 'bg-secondary',
      ghost: 'bg-accent',
      link: 'bg-primary',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

type Ripple = {
  id: number;
  x: number;
  y: number;
}

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    rippleClassName?: string
    scale?: number
    transition?: Transition
  }

function Button({
  className,
  variant,
  size,
  asChild = false,
  rippleClassName,
  scale = 10,
  transition = { duration: 0.6, ease: 'easeOut' },
  onClick,
  ...props
}: ButtonProps) {
  const [ripples, setRipples] = React.useState<Ripple[]>([])
  const buttonRef = React.useRef<HTMLButtonElement>(null)

  const createRipple = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const button = buttonRef.current
      if (!button) return

      const rect = button.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      const newRipple: Ripple = {
        id: Date.now(),
        x,
        y,
      }

      setRipples((prev) => [...prev, newRipple])

      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== newRipple.id))
      }, 600)
    },
    [],
  )

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      createRipple(event)
      if (onClick) {
        onClick(event)
      }
    },
    [createRipple, onClick],
  )

  if (asChild) {
    const Comp = Slot
    return (
      <Comp
        {...props}
        onClick={handleClick}
        // Slot drops Motion's whileTap, so a link styled as a button presses in CSS.
        className={cn(buttonVariants({ variant, size, className }), "active:scale-[0.97] motion-reduce:active:scale-100")}
      >
        {props.children}
      </Comp>
    )
  }

  return (
    <motion.button
      ref={buttonRef}
      data-slot="button"
      onClick={handleClick}
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.02 }}
      className={cn(buttonVariants({ variant, size, className }))}
      {...(props as HTMLMotionProps<"button">)}
    >
      {props.children}
      {ripples.map((ripple) => (
        <motion.span
          key={ripple.id}
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale, opacity: 0 }}
          transition={transition}
          className={cn(
            rippleVariants({ variant, className: rippleClassName }),
          )}
          style={{
            top: ripple.y - 10,
            left: ripple.x - 10,
          }}
        />
      ))}
    </motion.button>
  )
}

export { Button, buttonVariants }
