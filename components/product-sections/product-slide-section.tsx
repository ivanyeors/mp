import * as React from "react";

import { cn } from "@/lib/utils";

type ProductSlideSectionProps = {
  children: React.ReactNode;
  className?: string;
  borderTop?: boolean;
  sectionData?: Record<`data-${string}`, string>;
};

export function ProductSlideSection({
  children,
  className,
  borderTop,
  sectionData,
}: ProductSlideSectionProps) {
  return (
    <section
      {...sectionData}
      className={cn(
        "px-4 py-6 md:px-6 md:py-8",
        borderTop ? "border-t" : null,
        className,
      )}
    >
      {children}
    </section>
  );
}
