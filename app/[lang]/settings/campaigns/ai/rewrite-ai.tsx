"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { AiButton } from "@/components/block-editor/ai-button";
import { richTextFromWords } from "@/components/block-editor/rich-text-doc";
import { RichTextView } from "@/components/block-editor/rich-text-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { REFINE_STAGE_TEXT, type RewritableBlock } from "@/lib/email-campaigns/ai-refine-brief";
import { REFINE_LIMITS, REWRITE_ACTION_LABEL, rewriteBlocker, type RewriteAction } from "@/lib/email-campaigns/ai-refine-shape";
import { cn } from "@/lib/utils";
import { richTextOf } from "../blocks/runs";
import { useCampaignVariables } from "../blocks/variables";
import { useCampaignAi } from "./ai-context";
import type { RewriteOffer } from "./refine-state";

const CHOICES: RewriteAction[] = ["shorter", "warmer", "clearer", "fix_grammar"];

export function RewriteMenu({
  id,
  name,
  block,
}: {
  id: string;
  name: string;
  block: RewritableBlock;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const ai = useCampaignAi();
  if (!ai) return null;
  const r = ai.rewrite;
  const working = r.offer?.blockId === block.id && r.offer.status === "working";
  const reason = working ? null : (r.reason(block.id) ?? rewriteBlocker(block));
  const label = `Rewrite with Claude: ${name}`;
  if (working || reason) {
    return (
      <AiButton id={id} variant="ghost" className="h-8 px-2" aria-label={label} working={working ? REFINE_STAGE_TEXT.rewrite : null} onStop={r.stop} disabledReason={reason}>
        Rewrite
      </AiButton>
    );
  }
  const go = (action: RewriteAction, words = "") => {
    setOpen(false);
    r.start(block, action, words);
  };
  const other = `${id}-other`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <AiButton id={id} variant="ghost" className="h-8 px-2" aria-label={label} aria-haspopup="dialog">
          Rewrite
        </AiButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3" data-own-undo aria-label={label}>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Rewrite with Claude</p>
          <p className="text-xs text-muted-foreground">Claude&apos;s words show beside yours. Nothing changes until you press Replace.</p>
        </div>
        <div role="group" aria-label="How to rewrite it" className="grid grid-cols-2 gap-2">
          {CHOICES.map((action) => (
            <Button key={action} type="button" variant="outline" size="sm" onClick={() => go(action)}>
              {REWRITE_ACTION_LABEL[action]}
            </Button>
          ))}
        </div>
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (instruction.trim()) go("other", instruction.trim());
          }}
        >
          <Label htmlFor={other}>{REWRITE_ACTION_LABEL.other}</Label>
          <div className="flex gap-2">
            <Input
              id={other}
              value={instruction}
              maxLength={REFINE_LIMITS.instruction}
              placeholder="e.g. Say the covers are washable"
              aria-describedby={`${other}-hint`}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={!instruction.trim()}>
              Rewrite
            </Button>
          </div>
          <p id={`${other}-hint`} className="text-xs text-muted-foreground">
            In your own words. {instruction.length} of {REFINE_LIMITS.instruction} characters.
          </p>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function BlockWords({ block, labelledBy }: { block: RewritableBlock; labelledBy: string }) {
  const variables = useCampaignVariables();
  const value = useMemo(() => (block.type === "heading" ? richTextFromWords(block.text, variables) : richTextOf(block.paragraphs)), [block, variables]);
  return (
    <RichTextView
      value={value}
      variables={variables}
      singleLine={block.type === "heading"}
      aria-labelledby={labelledBy}
      className={cn("border-transparent bg-transparent px-0 shadow-none", block.type === "heading" && (block.level === 1 ? "text-xl font-semibold" : "text-lg font-semibold"))}
    />
  );
}

export function RewriteOfferView({
  offer,
  idPrefix,
  onReplace,
  onTryAgain,
  onKeepMine,
}: {
  offer: RewriteOffer;
  idPrefix: string;
  onReplace: () => void;
  onTryAgain: () => void;
  onKeepMine: () => void;
}) {
  const replace = useRef<HTMLButtonElement>(null);
  const ready = offer.status === "ready" && Boolean(offer.proposal);
  useEffect(() => {
    if (ready) replace.current?.focus();
  }, [ready]);
  const back = (then: () => void) => () => {
    then();
    requestAnimationFrame(() => document.getElementById(`${idPrefix}-rewrite`)?.focus());
  };
  const p = `${idPrefix}-offer`;
  const asked = offer.action === "other" ? `"${offer.instruction}"` : REWRITE_ACTION_LABEL[offer.action];
  return (
    <div role="group" aria-labelledby={`${p}-label`} className="@container space-y-3 rounded-md border border-dashed p-3">
      <p id={`${p}-label`} className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Claude&apos;s rewrite ({asked}){ready ? ". Nothing changes until you press Replace." : ""}
      </p>
      {ready && offer.proposal ? (
        <div className="grid gap-3 @md:grid-cols-2">
          <div className="min-w-0 space-y-1">
            <p id={`${p}-yours`} className="text-xs font-medium text-muted-foreground">
              Yours
            </p>
            <del className="block text-muted-foreground">
              <BlockWords block={offer.original} labelledBy={`${p}-yours`} />
            </del>
          </div>
          <div className="min-w-0 space-y-1">
            <p id={`${p}-claude`} className="text-xs font-medium">
              Claude&apos;s
            </p>
            <ins className="block no-underline">
              <BlockWords block={offer.proposal} labelledBy={`${p}-claude`} />
            </ins>
          </div>
        </div>
      ) : (
        <p role="alert" className="text-sm text-destructive">
          {offer.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {ready ? (
          <Button ref={replace} type="button" size="sm" onClick={back(onReplace)}>
            Replace
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={onTryAgain}>
          Try again
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={back(onKeepMine)}>
          Keep mine
        </Button>
      </div>
    </div>
  );
}
