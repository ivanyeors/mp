"use client";

import { useMemo } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Settings } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { useBuilder } from "./BuilderProvider";
import {
  formatPrice,
  computeFillingLines,
  computeComponentLines,
  computeAddonPrice,
  computeUpsellTotal,
} from "@/components/shop/customization-steps";

export function BuilderSidebar() {
  const builder = useBuilder();
  const { toggleSidebar } = useSidebar();

  const { recommendation, selectedTemplateId, selectedCover, selectedCase, componentQtyOverrides, selectedUpsells } = builder;

  const fillingLines = useMemo(
    () => computeFillingLines(recommendation, selectedTemplateId),
    [recommendation, selectedTemplateId]
  );

  const componentLines = useMemo(
    () => computeComponentLines(recommendation, selectedCover, selectedCase, componentQtyOverrides),
    [recommendation, selectedCover, selectedCase, componentQtyOverrides]
  );

  const addonPrice = useMemo(
    () => computeAddonPrice(recommendation, componentLines),
    [recommendation, componentLines]
  );

  const upsellTotal = useMemo(
    () => computeUpsellTotal(selectedUpsells),
    [selectedUpsells]
  );

  const basePrice = recommendation?.variant?.price ?? 0;
  const currency = recommendation?.variant?.currency ?? "SGD";
  const totalPrice = basePrice + addonPrice + upsellTotal;

  const stepLabels = ["About You", "Recommendation", "Components", "Review"];

  return (
    <Sidebar side="right" variant="inset" collapsible="icon" className="p-0">
      <SidebarRail />

      <SidebarHeader className="px-3 group-data-[collapsible=icon]:hidden">
        <div className="text-sm font-medium">
          {builder.productType === "bolster" ? "Mbolster Builder" : "Pillow Builder"}
        </div>
      </SidebarHeader>
      <SidebarSeparator className="mx-0 group-data-[collapsible=icon]:hidden" />

      <SidebarContent className="p-3 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center">
        <SidebarGroup className="p-0 group-data-[collapsible=icon]:flex-1">
          <SidebarGroupContent className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center">
            {/* Expanded content */}
            <div className="flex flex-col gap-4 group-data-[collapsible=icon]:hidden">
              {/* Step indicator */}
              <div className="space-y-2">
                {stepLabels.map((label, idx) => (
                  <div key={label} className="flex items-center gap-2 text-sm">
                    <div
                      className={`size-6 rounded-full flex items-center justify-center text-xs font-medium ${
                        idx < builder.stepIndex
                          ? "bg-primary text-primary-foreground"
                          : idx === builder.stepIndex
                          ? "bg-primary/20 text-primary border-2 border-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <span
                      className={
                        idx === builder.stepIndex
                          ? "font-medium"
                          : "text-muted-foreground"
                      }
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              <SidebarSeparator className="mx-0" />

              {/* Product info */}
              {recommendation && (
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      Size {recommendation.pillow_product.size}
                    </div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {builder.productType === "bolster"
                        ? "Mbolster"
                        : `${recommendation.pillow_product.kind} pillow`}
                    </div>
                  </div>

                  {fillingLines.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">Filling</div>
                      <div className="flex flex-wrap gap-1">
                        {fillingLines.map((fl, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs"
                          >
                            {fl.quantity}x {fl.subtype || fl.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <SidebarSeparator className="mx-0" />

              {/* Price summary */}
              {recommendation && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base</span>
                    <span>{formatPrice(basePrice, currency)}</span>
                  </div>
                  {addonPrice > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Add-ons</span>
                      <span className="text-primary">+{formatPrice(addonPrice, currency)}</span>
                    </div>
                  )}
                  {upsellTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Extras</span>
                      <span className="text-primary">+{formatPrice(upsellTotal, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-2">
                    <span>Total</span>
                    <span className="text-primary">{formatPrice(totalPrice, currency)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Collapsed icon */}
            <SidebarMenu className="hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:pt-4 flex-col gap-1 p-0">
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  tooltip="Open panel"
                  onClick={toggleSidebar}
                  className="group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center"
                >
                  <Settings />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
