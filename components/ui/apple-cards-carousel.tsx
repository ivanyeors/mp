"use client"

import Image from "next/image"
import { IconArrowNarrowLeft, IconArrowNarrowRight } from "@tabler/icons-react"
import { motion } from "motion/react"
import React, { createContext, useEffect, useState } from "react"
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
      <img src={iconSrc} alt="" className="mx-auto h-auto w-full max-w-[150px] object-contain" />
      <div className="min-w-0">
        <div className="text-lg font-semibold leading-tight">{title}</div>
        <div className="mt-2 text-base leading-relaxed text-muted-foreground">{description}</div>
      </div>
    </div>
  )
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
