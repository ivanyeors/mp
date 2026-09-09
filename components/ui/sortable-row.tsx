"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One row of a `DragDropProvider` list, dragged by a grip handle.
 *
 * `children` is a function so the caller places the grip inside its own layout — the
 * sortable element has to be the whole row (dnd-kit transforms it), but the grip
 * belongs on the row's header line, which is a different depth in every list here.
 *
 * Pair with `sortableMove` in the provider's `onDragEnd`; `index` must be the row's
 * index within the list this provider sorts.
 */
export function SortableRow({
  id,
  index,
  label,
  className,
  children,
}: {
  id: string;
  index: number;
  /** Named in the handle's aria-label, e.g. "Drag Bedok studio to reorder". */
  label: string;
  className?: string;
  children: (grip: ReactNode) => ReactNode;
}) {
  const { ref, isDragging, handleRef } = useSortable({ id, index });
  const grip = (
    <button
      ref={handleRef}
      type="button"
      aria-label={`Drag ${label} to reorder`}
      className="inline-flex min-h-11 min-w-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div ref={ref} className={cn(className, isDragging && "z-50 opacity-70 shadow-lg")}>
      {children(grip)}
    </div>
  );
}
