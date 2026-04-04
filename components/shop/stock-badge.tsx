import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StockBadgeProps {
  available: number;
  lowThreshold?: number;
  className?: string;
}

export function StockBadge({ available, lowThreshold = 10, className }: StockBadgeProps) {
  if (available <= 0) {
    return (
      <Badge variant="destructive" className={cn("text-xs", className)}>
        Out of stock
      </Badge>
    );
  }
  if (available < lowThreshold) {
    return (
      <Badge variant="outline" className={cn("text-xs text-amber-600 border-amber-300", className)}>
        Only {available} left
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn("text-xs text-green-600 border-green-300", className)}>
      Available
    </Badge>
  );
}
