"use client";

import Image from "next/image";
import Link from "next/link";
import { ShoppingBag, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import type { CartItemClient } from "@/lib/types/ecommerce";
import { QuantitySelector } from "@/components/shop/quantity-selector";
import { PriceDisplay } from "@/components/shop/price-display";
import type { CartMessages, CartVariant } from "./cart-types";

interface CartItemRowProps {
  item: CartItemClient;
  messages: CartMessages;
  productHref: string;
  onRemove: () => void;
  onQuantityChange: (quantity: number) => void;
  onNavigate?: () => void;
  variant?: CartVariant;
  /** Live availability cap for this variant (omitted = no cap, e.g. customized items). */
  maxQuantity?: number;
}

export function CartItemRow({
  item,
  messages,
  productHref,
  onRemove,
  onQuantityChange,
  onNavigate,
  variant = "popover",
  maxQuantity,
}: CartItemRowProps) {
  const isPage = variant === "page";
  const thumbnailSize = isPage ? "w-20 h-20" : "w-16 h-16";
  const removeButtonClass = isPage
    ? "shrink-0 p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
    : "shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors";
  const trashIconClass = isPage ? "size-5" : "size-4";

  const isSoldOut = maxQuantity != null && maxQuantity <= 0;
  const overLimit = maxQuantity != null && item.quantity > maxQuantity;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
      className="flex gap-3 px-4 py-4"
    >
      <div className={`shrink-0 rounded-md overflow-hidden bg-muted border ${thumbnailSize} relative`}>
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.productTitle}
            fill
            className="object-cover"
            sizes={isPage ? "80px" : "64px"}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full">
            <ShoppingBag className={`${isPage ? "size-8" : "size-6"} text-muted-foreground`} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={productHref}
              className={`font-medium leading-tight hover:underline line-clamp-2 ${isPage ? "text-base" : "text-sm"}`}
              onClick={onNavigate}
            >
              {item.productTitle}
            </Link>
            {item.variantTitle && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.variantTitle}</p>
            )}
            {item.customizationSummary && (
              <p className="text-xs text-muted-foreground mt-0.5">{item.customizationSummary}</p>
            )}
          </div>
          <button
            type="button"
            aria-label={`${messages.remove} ${item.productTitle}`}
            onClick={onRemove}
            className={removeButtonClass}
          >
            <Trash2 className={trashIconClass} />
          </button>
        </div>

        {(isSoldOut || overLimit) && (
          <p className="text-xs font-medium text-destructive">
            {isSoldOut
              ? "Out of stock"
              : `Only ${maxQuantity} available`}
          </p>
        )}

        <div className="flex items-center justify-between mt-auto">
          <QuantitySelector
            value={item.quantity}
            onChange={onQuantityChange}
            min={1}
            max={maxQuantity}
            className={isPage ? "h-10" : "h-8"}
          />
          <div className="text-right">
            <PriceDisplay
              price={(item.price + (item.addonPrice ?? 0)) * item.quantity}
              currency={item.currency}
              className={isPage ? "text-base" : "text-sm"}
            />
            {(item.addonPrice ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                +
                <PriceDisplay
                  price={item.addonPrice!}
                  currency={item.currency}
                  className="inline text-xs"
                />{" "}
                {messages.customizationAddon}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
