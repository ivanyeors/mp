"use client";

import { Button } from "@/components/ui/button";
import { openBookAppointmentSheet } from "@/components/slide-in-pages/book-appointment-sheet";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
};

export function BookAppointmentButton({ children, variant = "secondary", className }: Props) {
  return (
    <Button type="button" variant={variant} className={cn(className)} onClick={openBookAppointmentSheet}>
      {children}
    </Button>
  );
}
