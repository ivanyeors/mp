"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { createPortal } from "react-dom";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildPillowSheet, SHEET_ART_BACKGROUND } from "@/lib/customer-pillow/sheet";
import type { OwnPillowView } from "@/lib/customer-pillow/view";
import type { FittingAnswersView } from "@/lib/fitting-import/view";
import { getClientSiteOrigin } from "@/lib/site-url";

const PillowSheetArt = dynamic(() => import("./pillow-sheet-art").then((m) => m.PillowSheetArt), { ssr: false });

export function PillowSheetButton({
    pillow,
    customer,
    fittings,
}: {
    pillow: OwnPillowView;
    customer: { first_name: string | null; last_name: string | null };
    fittings: readonly FittingAnswersView[];
}) {
    const [making, setMaking] = useState(false);

    const make = async () => {
        setMaking(true);
        try {
            const sheet = buildPillowSheet({ pillow, customer, fittings, origin: getClientSiteOrigin(), now: new Date() });
            const { capturePillowArt, downloadPillowSheet } = await import("./pillow-sheet-download");
            const art = await capturePillowArt(SHEET_ART_BACKGROUND);
            await downloadPillowSheet(sheet, art);
        } catch (error) {
            console.error(error);
            toast.error("Could not make the PDF. Try again, or reload the page.");
        } finally {
            setMaking(false);
        }
    };

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => void make()} disabled={making}>
                {making ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <FileDown className="mr-1.5 h-4 w-4" aria-hidden />}
                {making ? "Making PDF…" : "Download PDF"}
            </Button>
            {making && createPortal(<PillowSheetArt pillow={pillow} />, document.body)}
        </>
    );
}
