"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function RecordPayoutToggle({ partnerName, children }: { partnerName: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button
                type="button"
                variant={open ? "ghost" : "outline"}
                className="mt-4 w-full md:hidden"
                aria-expanded={open}
                aria-label={open ? `Close the payout form for ${partnerName}` : `Record a payout for ${partnerName}`}
                onClick={() => setOpen((v) => !v)}
            >
                {open ? "Close" : "Record payout"}
            </Button>
            <div className={open ? undefined : "max-md:hidden"}>{children}</div>
        </>
    );
}
