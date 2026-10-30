"use client";

import { MoreHorizontal, Trash2, X } from "lucide-react";
import { AiButton } from "@/components/block-editor/ai-button";
import { PresetPicker } from "@/components/block-editor/preset-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CHINESE, CHINESE_EDITOR_TEXT } from "@/lib/email-campaigns/chinese-version";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import type { TranslateScope } from "./run-translate";

/** ✨ Translate as the Language bar offers it: null when AI writing is off, so no ✨ shows. */
export interface LanguageBarTranslate {
  /** Why it can't run now (no credentials, nothing in English yet, another ask running), or null. */
  reason: string | null;
  /** What the button says while the whole email, or what changed, is being translated; null otherwise. */
  working: string | null;
  onStop: () => void;
  start: (scope: TranslateScope) => void;
  /** Blocks (and the subject) out of date or not translated yet: *Translate what changed* has these to do. */
  changed: number;
}

/**
 * The email's Language (PRD-campaign-email-editor slice 17): *English · 中文*
 * above the email, ✨ *Translate to Chinese* beside it, and in its menu
 * *Remove the 中文 version*. The first translation makes the whole 中文
 * version; later ones offer *Translate what changed* or *Translate everything
 * again*. In 中文 the words change and the layout doesn't.
 */
export function LanguageBar({
  language,
  onLanguage,
  hasChinese,
  editable,
  translate,
  onRemove,
  error,
  onDismissError,
}: {
  language: Locale;
  onLanguage: (next: Locale) => void;
  /** The campaign has a 中文 version. */
  hasChinese: boolean;
  /** The email can change: not sending, not started. */
  editable: boolean;
  translate: LanguageBarTranslate | null;
  onRemove: () => void;
  error: string | null;
  onDismissError: () => void;
}) {
  const label = CHINESE_EDITOR_TEXT.translate;
  const button = (props: { onClick?: () => void } = {}) =>
    translate ? (
      <AiButton working={translate.working} onStop={translate.onStop} disabledReason={translate.reason} {...props}>
        {label}
      </AiButton>
    ) : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <PresetPicker
          label={CHINESE_EDITOR_TEXT.language}
          value={language}
          options={[
            { value: DEFAULT_LOCALE, label: CHINESE_EDITOR_TEXT.english },
            { value: CHINESE, label: CHINESE_EDITOR_TEXT.chinese },
          ]}
          onChange={onLanguage}
        />
        {hasChinese && editable ? (
          <DropdownMenu>
            {/* A plain button: the motion Button presses on Enter too, which would shut the menu it opens. */}
            <DropdownMenuTrigger asChild>
              <button type="button" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Language: more">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                <Trash2 className="h-4 w-4" />
                {CHINESE_EDITOR_TEXT.remove}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {!translate || !editable ? null : !hasChinese || translate.working || translate.reason ? (
          button({ onClick: () => translate.start({ kind: "all" }) })
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{button()}</DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem disabled={translate.changed === 0} onSelect={() => translate.start({ kind: "changed" })}>
                <span>
                  <span className="block">{CHINESE_EDITOR_TEXT.changed}</span>
                  <span className="block text-xs text-muted-foreground">
                    {translate.changed ? `${translate.changed} not translated, or changed in English since` : "Nothing changed since it was translated"}
                  </span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => translate.start({ kind: "all" })}>{CHINESE_EDITOR_TEXT.again}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="Dismiss" onClick={onDismissError}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
