"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VARIABLE_CHIP } from "@/components/block-editor/rich-text-style";
import { typingBurst } from "@/components/block-editor/use-editor-history";
import { CHINESE, type CampaignContent } from "@/lib/email-campaigns/content";
import { campaignVariable, VARIABLE_MAX, type VariableFallbacks, type VariableKey } from "@/lib/email-campaigns/variables";

export function VariableFallbacks({
    used,
    content,
    onChange,
    disabled,
    errors,
    idPrefix = "c-fallback",
    chinese = null,
}: {
    used: readonly VariableKey[];
    content: CampaignContent;
    onChange: (next: CampaignContent, burst?: string) => void;
    disabled: boolean;
    errors: Record<string, string>;
    idPrefix?: string;
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
