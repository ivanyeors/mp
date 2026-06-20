"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { useBuilder } from "./BuilderProvider";
import { computeFillingLines } from "@/components/shop/customization-steps";

const PILLOW_PATH =
  "M441.322 14.7728C409.558 27.3692 379.727 35.5927 331.965 35.5927C284.202 35.5927 254.372 27.3692 222.607 14.7728C182.901 -0.972711 120.418 -7.80227 69.7585 31.9038C19.099 71.6098 -2.80784 127.746 1.29974 209.896C5.52474 294.395 33.4738 349.165 83.8767 349.165C134.28 349.165 132.251 315.979 160.907 298.148C183.771 283.922 213.925 285.205 229.723 298.148C251.964 316.368 255.062 333.726 263.277 352.894C269.849 368.229 295.474 372.828 331.271 372.828L332.658 372.828C368.455 372.828 394.08 368.229 400.652 352.894C408.867 333.726 411.966 316.368 434.206 298.148C450.005 285.205 480.158 283.922 503.022 298.148C531.678 315.979 529.65 349.165 580.052 349.165C630.455 349.165 658.404 294.395 662.629 209.896C666.737 127.746 644.83 71.6098 594.171 31.9038C543.511 -7.80226 481.029 -0.972712 441.322 14.7728Z";

export function ProductVisual() {
  const builder = useBuilder();
  const { recommendation, selectedTemplateId, step, isLoadingRecommendation } = builder;

  const fillingLines = useMemo(
    () => computeFillingLines(recommendation, selectedTemplateId),
    [recommendation, selectedTemplateId]
  );

  const size = recommendation?.pillow_product?.size;
  const kind = recommendation?.pillow_product?.kind;

  return (
    <div className="relative flex flex-col items-center justify-center gap-6 p-4">
      {/* Pillow shape with inner shadow */}
      <motion.div
        key={step}
        animate={{ scale: [0.97, 1] }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative"
        style={{
          aspectRatio: "664 / 374",
          width: "min(75vmin, 500px)",
        }}
      >
        {/* White fill with inner shadow */}
        <svg
          className="absolute inset-0 pointer-events-none"
          viewBox="0 0 664 374"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <filter
              id="innerShadow"
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur" />
              <feOffset dx="0" dy="2" result="offsetBlur" />
              <feComposite
                in="offsetBlur"
                in2="SourceAlpha"
                operator="arithmetic"
                k2="-1"
                k3="1"
                result="innerShadow"
              />
              <feColorMatrix
                in="innerShadow"
                type="matrix"
                values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.35 0"
                result="shadowColor"
              />
            </filter>
          </defs>
          <path d={PILLOW_PATH} fill="white" filter="url(#innerShadow)" />
        </svg>

        {/* Stroke outline */}
        <svg
          className="absolute inset-0 pointer-events-none"
          viewBox="0 0 664 374"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
        >
          <path
            d={PILLOW_PATH}
            fill="none"
            stroke="white"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Pulsing skeleton when loading */}
        {isLoadingRecommendation && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-12 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </motion.div>

      {/* Badges below pillow shape */}
      <AnimatePresence mode="wait">
        {recommendation && (
          <motion.div
            key={`badges-${size}-${kind}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center gap-3"
          >
            {/* Size + kind */}
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm px-3 py-1">
                Size {size}
              </Badge>
              {kind && (
                <Badge variant="outline" className="text-xs capitalize">
                  {builder.productType === "bolster" ? "Mbolster" : kind}
                </Badge>
              )}
            </div>

            {/* Filling badges */}
            {fillingLines.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {fillingLines.map((fl, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-full bg-accent text-accent-foreground px-2.5 py-0.5 text-xs font-medium"
                  >
                    {fl.quantity}x {fl.subtype || fl.name}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
