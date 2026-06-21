import type { OrderStatus } from "@/lib/types/ecommerce";

/**
 * Presentation helpers shared by the customer-facing order pages
 * (order history list + order detail). Kept free of React so they can be used
 * from server components without a client boundary.
 */

/** Human-friendly label for an order status. */
export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case "payment_failed":
      return "Payment failed";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/**
 * Tailwind classes for a status pill. Tuned for the storefront (light/dark),
 * mirroring the palette used in the admin order views.
 */
export function orderStatusBadgeClass(status: OrderStatus): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800";
    case "confirmed":
      return "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800";
    case "processing":
      return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
    case "shipped":
      return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800";
    case "delivered":
      return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
    case "cancelled":
    case "payment_failed":
    case "disputed":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
    case "refunded":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

/** Currency-aware money formatting consistent across the storefront. */
export function formatOrderPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Compact date for order timestamps. */
export function formatOrderDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dateStr));
}
