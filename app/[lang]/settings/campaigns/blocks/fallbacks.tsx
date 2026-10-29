"use client";

import { Input } from "@/components/ui/input";
import { typingBurst } from "@/components/block-editor/use-editor-history";
import { variablesUsed, type CampaignContent } from "@/lib/email-campaigns/content";
import { CAMPAIGN_VARIABLES, VARIABLE_MAX } from "@/lib/email-campaigns/variables";
import { Field } from "../field";

/**
 * Each Variable's fallback words, once per campaign (PRD-campaign-email-editor
 * decision 3): a field for every Variable the email uses, in its blocks, its
 * subject or its preview line (slice 03). Slice 13 adds the rest.
 */
export function VariableFallbacks({
    content,
    lines,
    onChange,
    disabled,
    errors,
}: {
    content: CampaignContent;
    /** The subject and preview line: their Variables take the same fallbacks. */
    lines: readonly string[];
    onChange: (next: CampaignContent, burst?: string) => void;
    disabled: boolean;
    errors: Record<string, string>;
}) {
    return variablesUsed(content, lines).map((key) => {
        const v = CAMPAIGN_VARIABLES[key];
        const id = `c-fallback-${key}`;
        return (
            <Field
                key={key}
                label={`If a customer has no ${v.label.toLowerCase()}, say`}
                htmlFor={id}
                hint={`Left empty, it says "${v.fallback}".`}
                error={errors[`content.fallbacks.${key}`]}
            >
                <Input
                    id={id}
                    value={content.fallbacks[key] ?? ""}
                    placeholder={`e.g. ${v.fallback}`}
                    maxLength={VARIABLE_MAX}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...content, fallbacks: { ...content.fallbacks, [key]: e.target.value } }, typingBurst(e, id))}
                />
            </Field>
        );
    });
}
