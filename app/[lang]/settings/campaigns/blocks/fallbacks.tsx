"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VARIABLE_CHIP } from "@/components/block-editor/rich-text-style";
import { typingBurst } from "@/components/block-editor/use-editor-history";
import { CHINESE, type CampaignContent } from "@/lib/email-campaigns/content";
import { campaignVariable, VARIABLE_MAX, type VariableFallbacks, type VariableKey } from "@/lib/email-campaigns/variables";

/**
 * Each Variable's fallback words, once per campaign (PRD-campaign-email-editor
 * decision 3, slice 13): a field for every Variable the email uses, in its
 * blocks, its subject, its preview line or its greeting, prefilled with the
 * catalogue's default where it has one. Saved in `content.fallbacks`; Save
 * refuses an empty one (`CampaignDraftSchema`). A campaign with a 中文
 * version (slice 17) has its Chinese words beside each, *您* for a first
 * name until Staff change it.
 */
export function VariableFallbacks({
    used,
    content,
    onChange,
    disabled,
    errors,
    idPrefix = "c-fallback",
    chinese = null,
}: {
    /** `variablesInEmail`: the Variables the email uses, in order. */
    used: readonly VariableKey[];
    content: CampaignContent;
    onChange: (next: CampaignContent, burst?: string) => void;
    disabled: boolean;
    errors: Record<string, string>;
    /** Unique to where it is shown: the palette's, or the column's on a phone. */
    idPrefix?: string;
    /** The 中文 version's fallbacks, beside the English (slice 17); null when it has none. */
    chinese?: { fallbacks: VariableFallbacks; onChange: (next: VariableFallbacks, burst?: string) => void } | null;
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
                        {chinese ? <ChineseFallback id={`${id}-zh`} k={key} chinese={chinese} disabled={disabled} error={errors[`content.translations.${CHINESE}.fallbacks.${key}`]} /> : null}
                    </div>
                );
            })}
        </div>
    );
}

/** One Variable's 中文 fallback words, under its English ones. */
function ChineseFallback({
    id,
    k,
    chinese,
    disabled,
    error,
}: {
    id: string;
    k: VariableKey;
    chinese: { fallbacks: VariableFallbacks; onChange: (next: VariableFallbacks, burst?: string) => void };
    disabled: boolean;
    error?: string;
}) {
    const v = campaignVariable(k);
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <Label htmlFor={id} className="shrink-0 text-xs text-muted-foreground">
                    中文
                </Label>
                <Input
                    id={id}
                    lang="zh-CN"
                    value={chinese.fallbacks[k] ?? v.chineseFallback ?? ""}
                    maxLength={VARIABLE_MAX}
                    disabled={disabled}
                    aria-label={`${v.label}: if a customer has none, say in Chinese`}
                    aria-invalid={error ? true : undefined}
                    onChange={(e) => chinese.onChange({ ...chinese.fallbacks, [k]: e.target.value }, typingBurst(e, id))}
                />
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
    );
}
