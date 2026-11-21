"use client";

import { useState } from "react";
import { Loader2, Sparkles, Square } from "lucide-react";
import { AiButton } from "@/components/block-editor/ai-button";
import { PresetPicker } from "@/components/block-editor/preset-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DRAFT_ABOUT_PLACEHOLDER, DRAFT_GOAL_LABEL, DRAFT_GOALS, DRAFT_LIMITS, type DraftGoal } from "@/lib/email-campaigns/ai-draft-brief";
import { DRAFT_STAGE_TEXT, type DraftMode } from "@/lib/email-campaigns/ai-drafted";
import { ProductsField } from "../blocks/products-field";
import type { IdeasOffer } from "./refine-state";
import type { AiBrief, AiDraftRun } from "./use-ai-draft";

const ANY = "any";

export function GeneratePopover({
  open,
  onOpenChange,
  title,
  blocker,
  hasBlocks,
  working,
  onStop,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  blocker: string | null;
  hasBlocks: boolean;
  working: string | null;
  onStop: () => void;
  onGenerate: (brief: AiBrief, mode: DraftMode) => void;
}) {
  const [about, setAbout] = useState("");
  const [goal, setGoal] = useState<DraftGoal | typeof ANY>(ANY);
  const [products, setProducts] = useState<string[]>([]);
  const [mode, setMode] = useState<DraftMode>("replace");

  if (working) {
    return (
      <AiButton working={working} onStop={onStop}>
        Generate
      </AiButton>
    );
  }

  const generate = () => {
    onOpenChange(false);
    onGenerate({ about: about.trim(), goal: goal === ANY ? null : goal, products }, hasBlocks ? mode : "replace");
  };

  return (
    <Popover open={open && !blocker} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <AiButton disabledReason={blocker} aria-haspopup="dialog">
          Generate
        </AiButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] space-y-4" data-own-undo aria-label="Write the email with Claude">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Write the email with Claude</p>
          <p className="text-xs text-muted-foreground">
            From the subject: &ldquo;{title}&rdquo;. It writes into the email for you to read and change; nothing is saved or sent.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-about">What&apos;s it about?</Label>
          <Textarea
            id="ai-about"
            rows={3}
            value={about}
            maxLength={DRAFT_LIMITS.about}
            placeholder={DRAFT_ABOUT_PLACEHOLDER}
            aria-describedby="ai-about-hint"
            onChange={(e) => setAbout(e.target.value)}
          />
          <p id="ai-about-hint" className="text-xs text-muted-foreground">
            Optional. {about.length.toLocaleString("en-SG")} of {DRAFT_LIMITS.about} characters. Prices, offers and dates go in only if you write them here.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-goal">Goal</Label>
          <Select value={goal} onValueChange={(v) => setGoal(v as DraftGoal | typeof ANY)}>
            <SelectTrigger id="ai-goal" className="w-full justify-between">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any (optional)</SelectItem>
              {DRAFT_GOALS.map((g) => (
                <SelectItem key={g} value={g}>
                  {DRAFT_GOAL_LABEL[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium leading-none">Products</p>
          <p className="text-xs text-muted-foreground">Optional. Up to {DRAFT_LIMITS.products} from the shop; the email shows the shop&apos;s own prices.</p>
          <ProductsField products={products} layout="rows" onChange={setProducts} readOnly={false} errors={{}} />
        </div>
        {hasBlocks ? (
          <PresetPicker
            label="The email has blocks"
            value={mode}
            options={[
              { value: "replace", label: "Replace the email" },
              { value: "add", label: "Add below" },
            ]}
            onChange={setMode}
          />
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={generate}>
            <Sparkles className="mr-1 h-4 w-4" aria-hidden />
            Write the email
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const SUBJECT_PHONE = 60;

export function DraftBar({
  run,
  onStop,
  onKeep,
  onTryAgain,
  onUndo,
  onDismiss,
}: {
  run: AiDraftRun;
  onStop: () => void;
  onKeep: () => void;
  onTryAgain: () => void;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const one = run.where.scope === "text";
  return (
    <div role="region" aria-label="Claude's draft" className="sticky top-2 z-20 space-y-2 rounded-lg border bg-background p-3 text-sm shadow-sm">
      {run.status === "working" ? (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">{DRAFT_STAGE_TEXT[run.stage]}</span>
          <Button type="button" variant="outline" size="sm" onClick={onStop}>
            <Square className="mr-1 h-3.5 w-3.5" aria-hidden />
            Stop
          </Button>
        </div>
      ) : run.status === "failed" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="min-w-0 flex-1 text-destructive">
            {run.error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onTryAgain}>
            Try again
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p role="status" className="min-w-0 flex-1">
            {run.status === "stopped"
              ? "Stopped. What Claude wrote so far is in the email, marked Drafted with AI."
              : one
                ? "Claude wrote the text. Read it before you send it."
                : "Claude drafted the email. Read every line before you send it."}
          </p>
          <Button type="button" size="sm" onClick={onKeep}>
            Keep
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onTryAgain}>
            Try again
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onUndo}>
            Undo
          </Button>
        </div>
      )}
      {run.notes.length && run.status !== "working" ? (
        <div className="text-xs text-muted-foreground">
          <p className="font-medium">Claude&apos;s notes</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {run.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function DraftIdeas({
  id,
  label,
  ideas,
  onPick,
  onDismiss,
  phoneWarning = false,
  measure = (idea) => idea.length,
  onMore,
  moreReason = null,
}: {
  id: string;
  label: string;
  ideas: readonly string[];
  onPick: (idea: string) => void;
  onDismiss: () => void;
  phoneWarning?: boolean;
  measure?: (idea: string) => number;
  onMore?: () => void;
  moreReason?: string | null;
}) {
  return (
    <div role="group" aria-labelledby={`${id}-label`} className="space-y-1.5 rounded-md border border-dashed p-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p id={`${id}-label`} className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {label} from Claude: pick one to use it
        </p>
        <div className="flex items-center gap-1">
          {onMore ? (
            <AiButton variant="ghost" className="h-7 px-2 text-xs" disabledReason={moreReason} onClick={onMore}>
              More ideas
            </AiButton>
          ) : null}
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onDismiss}>
            No thanks
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ideas.map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => onPick(idea)}
            className="rounded-full border bg-background px-3 py-1 text-left text-sm transition-colors hover:bg-accent max-md:min-h-11"
          >
            {idea}
            <span className="ml-1.5 text-xs text-muted-foreground">
              {measure(idea)}
              {phoneWarning && measure(idea) > SUBJECT_PHONE ? ", may be cut off on phones" : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function IdeasPanel({
  id,
  label,
  offer,
  phoneWarning,
  measure,
  moreReason,
  onPick,
  onMore,
  onDismiss,
}: {
  id: string;
  label: string;
  offer: IdeasOffer;
  phoneWarning?: boolean;
  measure?: (idea: string) => number;
  moreReason: string | null;
  onPick: (idea: string) => void;
  onMore: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="space-y-1.5">
      {offer.status === "failed" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <p role="alert" className="min-w-0 flex-1 text-destructive">
            {offer.error}
          </p>
          {offer.ideas.length ? null : (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      ) : null}
      {offer.ideas.length ? (
        <DraftIdeas
          id={id}
          label={label}
          ideas={offer.ideas}
          phoneWarning={phoneWarning}
          measure={measure}
          onPick={onPick}
          onDismiss={onDismiss}
          onMore={onMore}
          moreReason={moreReason}
        />
      ) : null}
    </div>
  );
}
