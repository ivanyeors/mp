"use client";

import type { ReactNode } from "react";
import { useBlockEditor } from "@/components/block-editor/block-editor";
import { VariablePalette } from "@/components/block-editor/variable-palette";

/**
 * The palette's Variables tab for a campaign (PRD-campaign-email-editor slice
 * 13): the campaign's Variables as chips (`campaignVariables`, handed to the
 * editor, with *Points balance* greyed while points are not live), and under
 * them each used Variable's fallback words.
 */

/** Where a campaign's Variables go: what the tab says above its chips. */
const HINT = "Drag one into a heading, some text, the subject or the preview line, or click where it goes and choose it. Typing { in the words lists them too.";

/** The campaign's Variables, as its block forms offer them: the editor's. */
export const useCampaignVariables = () => useBlockEditor().variables;

export function CampaignVariablesTab({
    draggable = true,
    onInserted,
    children,
}: {
    /** Off in a phone's sheet, where a tap puts one in. */
    draggable?: boolean;
    /** After a chip went in: the sheet closes. */
    onInserted?: () => void;
    /** Under the chips: the fallback words. */
    children?: ReactNode;
}) {
    return (
        <VariablePalette variables={useCampaignVariables()} hint={HINT} draggable={draggable} onInserted={onInserted}>
            {children}
        </VariablePalette>
    );
}
