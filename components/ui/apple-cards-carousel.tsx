"use client"

import Image from "next/image"
import { IconArrowNarrowLeft, IconArrowNarrowRight, IconX } from "@tabler/icons-react"
import { AnimatePresence, motion } from "motion/react"
import React, { createContext, useContext, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      data-ui="apple-cards-carousel"
      className={cn("bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm", className)}
      {...props}
    />
  )
}

export type MeasureTileProps = {
  iconSrc: string
  title: string
  description: string
}

export function MeasureTile({ iconSrc, title, description }: MeasureTileProps) {
  return (
    <div className="flex flex-col gap-3" data-ui="apple-cards-carousel-measure-tile">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconSrc} alt="" className="mx-auto h-auto w-full max-w-[150px] object-contain" />
      <div className="min-w-0">
        <div className="text-lg font-semibold leading-tight">{title}</div>
        <div className="mt-2 text-base leading-relaxed text-muted-foreground">{description}</div>
      </div>
    </div>
  )
}

function useOnClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T>,
  handler: (event: MouseEvent | TouchEvent) => void,
) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const el = ref.current
      if (!el) return
      const target = event.target as Node | null
      if (!target) return
      if (el.contains(target)) return
      handler(event)
    }

    document.addEventListener("mousedown", listener)
    document.addEventListener("touchstart", listener, { passive: true })

    return () => {
      document.removeEventListener("mousedown", listener)
      document.removeEventListener("touchstart", listener)
    }
  }, [ref, handler])
}

export interface CarouselProps {
  items: React.JSX.Element[]
  initialScroll?: number
  /**
   * Class applied to the inner row that wraps all cards.
   * Use this to remove default padding/max-width for full-bleed layouts.
   */
  itemsContainerClassName?: string
}

export interface AppleCarouselCardData {
  src: string
  title: string
  category: string
  content: React.ReactNode
}

export const CarouselContext = createContext<{
  onCardClose: (index: number) => void
  currentIndex: number
}>({
  onCardClose: () => {
    /* default context value */
  },
  currentIndex: 0,
})

export const Carousel = ({ items, initialScroll = 0, itemsContainerClassName }: CarouselProps) => {
  const carouselRef = React.useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (carouselRef.current) {
      carouselRef.current.scrollLeft = initialScroll
      checkScrollability()
    }
  }, [initialScroll])

  const checkScrollability = () => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current
      setCanScrollLeft(scrollLeft > 0)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth)
    }
  }

  const scrollLeft = () => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: -300, behavior: "smooth" })
    }
  }

  const scrollRight = () => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: 300, behavior: "smooth" })
    }
  }

  const handleCardClose = (index: number) => {
    if (carouselRef.current) {
      const target = carouselRef.current.querySelector<HTMLElement>(
        `[data-ui="apple-cards-carousel-item"][data-index="${index}"]`,
      )

      if (target) {
        carouselRef.current.scrollTo({
          left: target.offsetLeft,
          behavior: "smooth",
        })
      }
      setCurrentIndex(index)
    }
  }

  return (
    <CarouselContext.Provider value={{ onCardClose: handleCardClose, currentIndex }}>
      {/* min-w-0: keep horizontal scroll local so the track cannot widen the document */}
      <div className="relative w-full min-w-0">
        <div
          className="flex w-full snap-x snap-mandatory min-w-0 overflow-x-auto overscroll-x-contain scroll-smooth py-6 [scrollbar-width:none] md:py-10"
          onScroll={checkScrollability}
          ref={carouselRef}
        >
          <div
            className={cn(
              "absolute right-0 z-[1000] h-auto w-[5%] overflow-hidden bg-gradient-to-l",
            )}
          />

          <div
            className={cn(
              "flex flex-row justify-start gap-4",
              itemsContainerClassName ?? "pl-4 mx-auto max-w-7xl", // default layout matches original component
            )}
          >
            {items.map((item, index) => (
              <motion.div
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: {
                    duration: 0.5,
                    delay: 0.2 * index,
                    ease: "easeOut",
                  },
                }}
                className="snap-start rounded-3xl last:pr-0 md:last:pr-[33%]"
                initial={{
                  opacity: 0,
                  y: 20,
                }}
                data-ui="apple-cards-carousel-item"
                data-index={index}
                key={`card${index}`}
              >
                {item}
              </motion.div>
            ))}
          </div>
        </div>
        <div className="mr-10 flex justify-end gap-2 max-md:mr-0">
          <button
            type="button"
            className="relative z-40 flex h-10 w-10 items-center justify-center rounded-full border bg-background/80 text-foreground disabled:opacity-50"
            disabled={!canScrollLeft}
            onClick={scrollLeft}
            aria-label="Scroll left"
          >
            <IconArrowNarrowLeft className="h-6 w-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="relative z-40 flex h-10 w-10 items-center justify-center rounded-full border bg-background/80 text-foreground disabled:opacity-50"
            disabled={!canScrollRight}
            onClick={scrollRight}
            aria-label="Scroll right"
          >
            <IconArrowNarrowRight className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </div>
    </CarouselContext.Provider>
  )
}

export interface CardProps {
  card: AppleCarouselCardData
  index: number
  layout?: boolean
  variant?: "overlay" | "stacked"
}

export const AppleCarouselCard = ({ card, index, layout = false, variant = "overlay" }: CardProps) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { onCardClose } = useContext(CarouselContext)
  const hasCategory = card.category.trim().length > 0

  const handleClose = React.useCallback(() => {
    setOpen(false)
    onCardClose(index)
  }, [index, onCardClose])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleClose()
      }
    }

    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "auto"
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = "auto"
    }
  }, [handleClose, open])

  useOnClickOutside(containerRef as React.RefObject<HTMLElement>, handleClose)

  const handleOpen = () => {
    setOpen(true)
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 h-screen overflow-auto">
            <motion.div
              animate={{ opacity: 1 }}
              className="fixed inset-0 h-full w-full bg-black/80 backdrop-blur-lg"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
            />
            <motion.div
              animate={{ opacity: 1 }}
              className="relative z-[60] mx-auto my-10 h-fit max-w-5xl rounded-3xl bg-white p-4 md:p-10 dark:bg-neutral-900"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              layoutId={layout ? `card-${card.title}` : undefined}
              ref={containerRef}
            >
              <button
                type="button"
                aria-label="Close"
                className="fixed bottom-[calc(1rem+var(--safe-bottom))] right-4 z-[70] flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black md:sticky md:top-4 md:right-0 md:ml-auto md:h-8 md:w-8 md:min-h-0 md:min-w-0 dark:bg-white"
                onClick={handleClose}
              >
                <IconX className="h-6 w-6 text-neutral-100 dark:text-neutral-900" />
              </button>
              <motion.p
                className="text-base font-medium text-black dark:text-white"
                layoutId={layout ? `category-${card.title}` : undefined}
              >
                {card.category}
              </motion.p>
              <motion.p
                className="mt-4 text-2xl font-semibold text-neutral-700 md:text-5xl dark:text-white"
                layoutId={layout ? `title-${card.title}` : undefined}
              >
                {card.title}
              </motion.p>
              <div className="py-10">{card.content}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <motion.button
        className={cn(
          "relative z-10 overflow-hidden rounded-3xl bg-gray-100 text-left dark:bg-neutral-900",
          variant === "overlay"
            ? "flex h-48 w-40 flex-col items-start justify-start md:h-64 md:w-56"
            : "flex h-auto w-60 flex-col md:w-84",
        )}
        layoutId={layout ? `card-${card.title}` : undefined}
        onClick={handleOpen}
      >
        {variant === "overlay" ? (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-full bg-gradient-to-b from-black/50 via-transparent to-transparent" />
            <div className="relative z-40 p-4 md:p-6">
              {hasCategory ? (
                <motion.p
                  className="text-left text-xs font-medium text-white md:text-sm"
                  layoutId={layout ? `category-${card.category}` : undefined}
                >
                  {card.category}
                </motion.p>
              ) : null}
              <motion.p
                className={cn(
                  "max-w-xs text-left text-sm font-semibold [text-wrap:balance] text-white md:text-lg",
                  hasCategory ? "mt-1" : "mt-0",
                )}
                layoutId={layout ? `title-${card.title}` : undefined}
              >
                {card.title}
              </motion.p>
            </div>
            <BlurImage alt={card.title} className="absolute inset-0 z-10 object-cover" src={card.src} />
          </>
        ) : (
          <>
            <div className="relative h-40 w-full md:h-52">
              <BlurImage alt={card.title} className="absolute inset-0 h-full w-full object-cover" src={card.src} />
            </div>
            <div className="relative z-40 border-t border-black/5 p-4 dark:border-white/10 md:p-5">
              {hasCategory ? (
                <motion.p
                  className="text-xs font-medium text-muted-foreground md:text-sm"
                  layoutId={layout ? `category-${card.category}` : undefined}
                >
                  {card.category}
                </motion.p>
              ) : null}
              <motion.p
                className={cn(
                  "text-sm font-semibold leading-snug [text-wrap:balance] text-foreground md:text-base",
                  hasCategory ? "mt-1" : "mt-0",
                )}
                layoutId={layout ? `title-${card.title}` : undefined}
              >
                {card.title}
              </motion.p>
            </div>
          </>
        )}
      </motion.button>
    </>
  )
}

export interface BlurImageProps {
  src: string
  alt?: string
  className?: string
  fill?: boolean
  width?: number
  height?: number
  sizes?: string
}

export const BlurImage = ({
  height,
  width,
  src,
  className,
  alt,
  fill = false,
  sizes,
}: BlurImageProps) => {
  const [isLoading, setLoading] = useState(true)

  const imageClassName = cn(
    "h-full w-full transition duration-300",
    isLoading ? "blur-sm" : "blur-0",
    className,
  )

  if (fill) {
    return (
      <Image
        alt={alt ? alt : "Background of a beautiful view"}
        className={imageClassName}
        decoding="async"
        fill
        loading="lazy"
        onLoad={() => setLoading(false)}
        sizes={sizes ?? "100vw"}
        src={src}
        unoptimized
      />
    )
  }

  return (
    <Image
      alt={alt ? alt : "Background of a beautiful view"}
      className={imageClassName}
      decoding="async"
      height={height ?? 600}
      loading="lazy"
      onLoad={() => setLoading(false)}
      src={src}
      width={width ?? 600}
      sizes={sizes}
      unoptimized
    />
  )
}

// Demo
const demoCards: AppleCarouselCardData[] = [
  {
    src: "https://picsum.photos/seed/1/400/600",
    title: "Forest Adventure",
    category: "Nature",
    content: <p className="text-muted-foreground">Explore the beauty of ancient forests and discover hidden trails.</p>,
  },
  {
    src: "https://picsum.photos/seed/2/400/600",
    title: "Urban Photography",
    category: "City",
    content: <p className="text-muted-foreground">Capture the essence of city life through stunning urban landscapes.</p>,
  },
  {
    src: "https://picsum.photos/seed/3/400/600",
    title: "Ocean Waves",
    category: "Beach",
    content: <p className="text-muted-foreground">Feel the rhythm of the waves and embrace coastal serenity.</p>,
  },
  {
    src: "https://picsum.photos/seed/4/400/600",
    title: "Mountain Peaks",
    category: "Adventure",
    content: <p className="text-muted-foreground">Conquer new heights and witness breathtaking mountain vistas.</p>,
  },
]

export function Demo() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background py-10">
      <Carousel
        items={demoCards.map((card, index) => (
          <AppleCarouselCard key={card.title} card={card} index={index} layout />
        ))}
      />
    </div>
  )
}
