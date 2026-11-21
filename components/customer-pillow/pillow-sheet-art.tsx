"use client";

import { useMemo, type CSSProperties } from "react";
import { XrayPillow } from "@/components/spatial/xray-pillow";
import { CrossSectionSvg } from "@/components/spatial/xray-cross-section";
import { useItemMaps, usePillowFit } from "@/components/spatial/use-pillow-fit";
import { SHEET_ART_BACKGROUND } from "@/lib/customer-pillow/sheet";
import type { OwnPillowView } from "@/lib/customer-pillow/view";
import { xrayColorVarStyle } from "@/lib/spatial-fillings/color-overrides";
import { rowsToPillowPlacements, SECTIONS } from "@/lib/spatial-fillings/core";
import { pillowDimensions } from "@/lib/spatial-fillings/dimensions";
import { softBodyFromPayload } from "@/lib/spatial-fillings/soft-body-settings";
import { XRAY_VIEW } from "@/lib/spatial-fillings/xray-stage";

const SHEET_ART_THEME = {
    "--xray-shell": "#475569",
    "--xray-interior": "#eef2f7",
    "--xray-veil": "#ffffff",
} as CSSProperties;

export function PillowSheetArt({ pillow }: { pillow: OwnPillowView }) {
    const placements = useMemo(() => rowsToPillowPlacements(pillow.placements), [pillow.placements]);
    const fit = usePillowFit(placements, pillow.size, pillow.items, pillow.dimensionOverrides);
    const { itemSubtypes, itemSizes, itemDims, loftAllowance } = useItemMaps(pillow.items, pillow.dimensionOverrides);
    const softBody = useMemo(() => ({ ...softBodyFromPayload(pillow.dimensionOverrides), animate: false }), [pillow.dimensionOverrides]);
    return (
        <div
            data-pillow-sheet-art
            aria-hidden
            style={{
                position: "fixed",
                left: -20000,
                top: 0,
                width: XRAY_VIEW.width * 2,
                pointerEvents: "none",
                background: SHEET_ART_BACKGROUND,
                ...SHEET_ART_THEME,
                ...xrayColorVarStyle(pillow.colorOverrides),
            }}
        >
            <div data-sheet-art="top" style={{ position: "relative", aspectRatio: `${XRAY_VIEW.width} / ${XRAY_VIEW.height}` }}>
                <XrayPillow
                    placements={placements}
                    itemSubtypes={itemSubtypes}
                    itemSizes={itemSizes}
                    itemDims={itemDims}
                    pillowSize={pillowDimensions(pillow.size).dims.size}
                    loftAllowance={loftAllowance}
                    fit={fit}
                    items={pillow.items}
                    softBody={softBody}
                    className="absolute inset-0"
                />
            </div>
            {SECTIONS.map((section) =>
                fit.sections[section].pieces.length > 0 ? (
                    <div key={section} data-sheet-art={section}>
                        <CrossSectionSvg fit={fit} cut={{ section }} itemSubtypes={itemSubtypes} itemSizes={itemSizes} softBody={softBody} compact />
                    </div>
                ) : null,
            )}
        </div>
    );
}
