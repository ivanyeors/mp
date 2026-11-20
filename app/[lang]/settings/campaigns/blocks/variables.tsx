"use client";

import type { ReactNode } from "react";
import { useBlockEditor } from "@/components/block-editor/block-editor";
import { VariablePalette } from "@/components/block-editor/variable-palette";

const HINT = "Drag one into a heading, some text, the subject or the preview line, or click where it goes and choose it. Typing { in the words lists them too.";

export const useCampaignVariables = () => useBlockEditor().variables;

export function CampaignVariablesTab({
    draggable = true,
    onInserted,
    children,
}: {
    draggable?: boolean;
    onInserted?: () => void;
    children?: ReactNode;
}) {
    return (
        <VariablePalette variables={useCampaignVariables()} hint={HINT} draggable={draggable} onInserted={onInserted}>
            {children}
        </VariablePalette>
    );
}
