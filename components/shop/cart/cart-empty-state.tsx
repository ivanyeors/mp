"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import type { CartMessages } from "./cart-types";

interface CartEmptyStateProps {
  messages: CartMessages;
  shopHref: string;
  onNavigate?: () => void;
}

export function CartEmptyState({ messages, shopHref, onNavigate }: CartEmptyStateProps) {
  return (
    <motion.div
      key="empty"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <div className="rounded-full bg-muted p-6">
        <ShoppingBag className="size-10 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium text-base">{messages.empty}</p>
        <p className="text-sm text-muted-foreground mt-1">{messages.emptyHint}</p>
      </div>
      <Button asChild variant="outline" onClick={onNavigate}>
        <Link href={shopHref}>{messages.continueShopping}</Link>
      </Button>
    </motion.div>
  );
}
