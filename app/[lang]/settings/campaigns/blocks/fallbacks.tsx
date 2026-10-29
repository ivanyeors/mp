"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VARIABLE_CHIP } from "@/components/block-editor/rich-text-style";
import { typingBurst } from "@/components/block-editor/use-editor-history";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import { campaignVariable, VARIABLE_MAX, type VariableKey } from "@/lib/email-campaigns/variables";

/**
 * Each Variable's fallback words, once per campaign (PRD-campaign-email-editor
 * decision 3, slice 13): a field for every Variable the email uses, in its
 * blocks, its subject, its preview line or its greeting, prefilled with the
 * catalogue's default where it has one. Saved in `content.fallbacks`; Save
 * refuses an empty one (`CampaignDraftSchema`).
 */
export function VariableFallbacks({
    used,
    content,
    onChange,
    disabled,
    errors,
    idPrefix = "c-fallback",
}: {
    /** `variablesInEmail`: the Variables the email uses, in order. */
    used: readonly VariableKey[];
    content: CampaignContent;
    onChange: (next: CampaignContent, burst?: string) => void;
    disabled: boolean;
    errors: Record<string, string>;
    /** Unique to where it is shown: the palette's, or the column's on a phone. */
    idPrefix?: string;
}) {
    if (!used.length) return null;
    return (
        <div className="space-y-3">
            {used.map((key) => {
                const v = campaignVariable(key);
                const id = `${idPrefix}-${key}`;
                const error = errors[`content.fallbacks.${key}`];
                return (
                    <div key={key} className="space-y-1.5">
                        <Label htmlFor={id} className="flex flex-wrap items-center gap-1 text-xs">
                            <span className={VARIABLE_CHIP}>{v.label}</span> If a customer has none, say:
                        </Label>
                        <Input
                            id={id}
                            // The catalogue's default until Staff change it: a missing one is the default.
                            value={content.fallbacks[key] ?? v.fallback ?? ""}
                            placeholder={v.example ? `e.g. ${v.example}` : undefined}
                            maxLength={VARIABLE_MAX}
                            disabled={disabled}
                            aria-invalid={error ? true : undefined}
                            onChange={(e) => onChange({ ...content, fallbacks: { ...content.fallbacks, [key]: e.target.value } }, typingBurst(e, id))}
                        />
                        {error ? <p className="text-xs text-destructive">{error}</p> : null}
                    </div>
                );
            })}
        </div>
    );
}
