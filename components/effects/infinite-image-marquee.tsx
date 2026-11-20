import * as React from "react";
import Image from "next/image";

type InfiniteImageMarqueeProps = {
  src: string;
  alt: string;
  durationSeconds?: number;
  direction?: "left" | "right";
  className?: string;
  imageClassName?: string;
};

export function InfiniteImageMarquee({
  src,
  alt,
  durationSeconds = 24,
  direction = "left",
  className,
  imageClassName,
}: InfiniteImageMarqueeProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className ?? ""}`}>
      <div
        className="mp-marquee-track flex h-full w-max will-change-transform motion-reduce:translate-x-0 motion-reduce:animate-none"
        style={
          {
            ["--mp-marquee-duration" as never]: `${durationSeconds}s`,
            ["--mp-marquee-direction" as never]: direction === "right" ? "reverse" : "normal",
          } as React.CSSProperties
        }
      >
        <Image
          src={src}
          alt={alt}
          width={1150}
          height={443}
          draggable={false}
          className={`h-full w-auto max-w-none select-none ${imageClassName ?? ""}`}
        />
        <Image
          src={src}
          alt=""
          aria-hidden="true"
          width={1150}
          height={443}
          draggable={false}
          className={`h-full w-auto max-w-none select-none ${imageClassName ?? ""}`}
        />
      </div>
    </div>
  );
}

