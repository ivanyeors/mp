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

/**
 * ✨ Generate's parts in the campaign editor (PRD-campaign-email-editor slice
 * 09), one module loaded after the page, not with it: the button with the
 * popover under it that takes the brief; the bar above the blocks while
 * Claude writes and after; and the subject and preview line ideas under
 * their fields, a draft's or ✨ Refine's (slice 10).
 */

/** The goal picker's choice for none: a goal is optional. */
const ANY = "any";

/**
 * ✨ Generate's button and the popover under it (PRD-campaign-email-editor
 * slice 09): the brief, all of it optional (what the email is about, its
 * goal, up to three products from the shop) and, when the email has blocks,
 * whether the draft replaces them or goes below. The draft is written from the
 * subject; nothing is saved or sent.
 */
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
  /** The popover is open: the editor's, so another part of the page (slice 08's Start panel) can open it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What Claude writes from: the subject, or the campaign name. */
  title: string;
  /** Why it can't run yet, or null. */
  blocker: string | null;
  hasBlocks: boolean;
  /** While a draft is written, what Claude is doing. */
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

/** Past this, a subject may be cut off on a phone (PRD *Research*). */
const SUBJECT_PHONE = 60;

/**
 * The bar above the blocks: while Claude writes, its stage (*Reading your
 * brief…*, then *Writing the email…*) and Stop; after, *Keep*, *Try again*
 * and *Undo*, with Claude's notes; or why it failed.
 */
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
          {/* The ✨ button announces each stage; this says it where the blocks arrive. */}
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

/** Claude's subject or preview line ideas under their field: pressing one fills the field. */
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
  /** "Subject ideas", "Preview line ideas". */
  label: string;
  ideas: readonly string[];
  onPick: (idea: string) => void;
  onDismiss: () => void;
  /** Mark ideas long enough to be cut off on a phone (subjects). */
  phoneWarning?: boolean;
  /** An idea's length as its field counts it (slice 10: a Variable as the sample customer's words). */
  measure?: (idea: string) => number;
  /** *More ideas* (slice 10): asks again, for others. */
  onMore?: () => void;
  /** Why *More ideas* can't be pressed now, or null. */
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

/** Ideas under a field: Claude's, to pick from, or why there are none. */
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
  /** Why *More ideas* can't run now (this ask or another is running), or null. */
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
      {/* The first ask's progress is the ✨ button's; More ideas keeps the last ones in view meanwhile. */}
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
