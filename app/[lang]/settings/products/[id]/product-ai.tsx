"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Info, Sparkles } from "lucide-react";
import { AiButton } from "@/components/block-editor/ai-button";
import { PRODUCT_BODY_STYLE } from "@/components/markdown-editor/body-style";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { AI_WRITING_NO_CREDENTIALS, type AiWritingAvailability } from "@/lib/ai/availability";
import {
  BODY_LENGTH,
  DESCRIPTION_LENGTH_LABEL,
  DESCRIPTION_LENGTHS,
  DESCRIPTION_MODE_LABEL,
  DESCRIPTION_MODES,
  DESCRIPTION_PARTS,
  DESCRIPTION_PARTS_LABEL,
  PRODUCT_AI_LIMITS,
  PRODUCT_AI_WORKING,
  descriptionModeBlocker,
  type DescriptionLength,
  type DescriptionMode,
  type DescriptionParts,
  type ProductAiContent,
  type ProductAiRequest,
  type ProductAiResult,
} from "@/lib/ecommerce/ai-product-shape";
import { PRODUCT_SOURCE_LOCALE, productLocale } from "@/lib/ecommerce/product-locales";
import type { Locale } from "@/lib/i18n/locales";
import { PRODUCT_SEO_TARGETS, countWords, displayWidth, fitOf, productPageTitle, type Fit, type Range } from "@/lib/seo/product-seo";
import type { LocalizedProductContent } from "@/lib/types/ecommerce";
import { cn } from "@/lib/utils";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

export type ContentMap = Record<string, LocalizedProductContent>;
type DescriptionResult = Extract<ProductAiResult, { kind: "description" }>;
type SeoResult = Extract<ProductAiResult, { kind: "seo" }>;

export type Offer<R> =
  | { status: "working"; request: ProductAiRequest }
  | { status: "ready"; request: ProductAiRequest; result: R }
  | { status: "failed"; request: ProductAiRequest; error: string };

type Kind = ProductAiRequest["kind"];

export function aiContent(content: ContentMap): Partial<Record<Locale, ProductAiContent>> {
  const out: Partial<Record<Locale, ProductAiContent>> = {};
  for (const [locale, c] of Object.entries(content)) {
    out[locale as Locale] = {
      title: c.title ?? "",
      description: c.description ?? "",
      body: c.body ?? "",
      seo_title: c.seo_title ?? "",
      seo_description: c.seo_description ?? "",
      seo_answer: c.seo_answer ?? "",
    };
  }
  return out;
}

export function useProductAi(productId: string) {
  const [description, setDescription] = useState<Offer<DescriptionResult> | null>(null);
  const [seo, setSeo] = useState<Offer<SeoResult> | null>(null);
  const controllers = useRef<Record<Kind, AbortController | null>>({ description: null, seo: null });

  useEffect(() => {
    const c = controllers.current;
    return () => {
      c.description?.abort();
      c.seo?.abort();
    };
  }, []);

  const setter = (kind: Kind) => (kind === "description" ? setDescription : setSeo) as (o: Offer<ProductAiResult> | null) => void;

  const run = async (request: ProductAiRequest) => {
    const set = setter(request.kind);
    controllers.current[request.kind]?.abort();
    const ac = new AbortController();
    controllers.current[request.kind] = ac;
    set({ status: "working", request });
    try {
      const res = await fetch(`/api/shop/products/${productId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: ac.signal,
      });
      const data = await res.json().catch(() => null);
      if (ac.signal.aborted) return;
      if (!res.ok) set({ status: "failed", request, error: (data as { error?: string } | null)?.error ?? "Claude couldn't answer. Try again." });
      else set({ status: "ready", request, result: data as ProductAiResult });
    } catch {
      if (ac.signal.aborted) return;
      set({ status: "failed", request, error: "Couldn't reach Claude. Check the connection and try again." });
    } finally {
      if (controllers.current[request.kind] === ac) controllers.current[request.kind] = null;
    }
  };

  const clear = (kind: Kind) => {
    controllers.current[kind]?.abort();
    controllers.current[kind] = null;
    setter(kind)(null);
  };

  return { description, seo, run, clear };
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  why,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  why?: Partial<Record<T, string | null>>;
}) {
  const labelId = useId();
  const pick = (v: T) => {
    if (!why?.[v]) onChange(v);
  };
  return (
    <div className="space-y-1.5">
      <p id={labelId} className="text-xs font-medium">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex flex-wrap gap-1 rounded-lg bg-muted p-1"
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          const open = options.filter((o) => !why?.[o.value]);
          const at = open.findIndex((o) => o.value === value);
          const next = open[(at + (e.key === "ArrowRight" ? 1 : -1) + open.length) % open.length];
          if (next) {
            onChange(next.value);
            (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
          }
        }}
      >
        {options.map((o) => {
          const off = why?.[o.value] ?? null;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              data-value={o.value}
              aria-checked={value === o.value}
              aria-disabled={off ? true : undefined}
              tabIndex={value === o.value ? 0 : -1}
              title={off ?? undefined}
              onClick={() => pick(o.value)}
              className="flex-1 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-sm aria-disabled:cursor-not-allowed aria-disabled:opacity-45 max-md:min-h-11"
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const FIT_CLASS: Record<Fit, string> = {
  empty: "text-muted-foreground",
  short: "text-muted-foreground",
  good: "text-emerald-700 dark:text-emerald-400",
  long: "text-amber-700 dark:text-amber-400",
};

export function Meter({ n, range, unit, title }: { n: number; range: Range; unit?: string; title?: string }) {
  const fit = fitOf(n, range);
  return (
    <span className={cn("shrink-0 text-xs tabular-nums", FIT_CLASS[fit])} title={title}>
      {unit ? `${n} ${unit}` : `${n}/${range.max}`}
      <span className="sr-only">
        {fit === "long" ? ", too long" : fit === "short" ? ", short" : fit === "good" ? ", a good length" : ""}
      </span>
    </span>
  );
}

function aiOff(ai: AiWritingAvailability): string | null {
  return ai.configured ? null : AI_WRITING_NO_CREDENTIALS;
}

const hasWords = (s: string | undefined) => Boolean(s?.trim());

function popoverRoom() {
  let bottom = 8;
  if (typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches) {
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--mobile-sticky-action-bar-height"));
    if (Number.isFinite(bar)) bottom += bar;
  }
  return { top: 8, left: 8, right: 8, bottom };
}

const POPOVER_SCROLL = "max-h-(--radix-popover-content-available-height) overflow-y-auto overscroll-contain";

function defaultMode(locale: Locale, content: ContentMap): DescriptionMode {
  const here = content[locale];
  if (hasWords(here?.body) || hasWords(here?.description)) return "improve";
  if (locale !== PRODUCT_SOURCE_LOCALE && descriptionModeBlocker("translate", locale, aiContent(content)) === null) return "translate";
  return "new";
}

export function WriteWithClaude({
  ai,
  locale,
  content,
  offer,
  onRun,
  onStop,
}: {
  ai: AiWritingAvailability;
  locale: Locale;
  content: ContentMap;
  offer: Offer<DescriptionResult> | null;
  onRun: (request: ProductAiRequest) => void;
  onStop: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DescriptionMode>(() => defaultMode(locale, content));
  const [parts, setParts] = useState<DescriptionParts>("both");
  const [length, setLength] = useState<DescriptionLength>("medium");
  const [brief, setBrief] = useState("");
  const briefId = useId();
  const loc = productLocale(locale);
  const sent = aiContent(content);

  const title = content[locale]?.title?.trim() || content[PRODUCT_SOURCE_LOCALE]?.title?.trim();
  const working = offer?.status === "working";
  if (working) {
    const there = offer.request.locale !== locale ? ` (${productLocale(offer.request.locale).label})` : "";
    const text = offer.request.kind === "description" && offer.request.mode === "translate" ? PRODUCT_AI_WORKING.translate : PRODUCT_AI_WORKING.description;
    return (
      <AiButton working={`${text.replace("…", "")}${there}…`} onStop={onStop}>
        Write with Claude
      </AiButton>
    );
  }
  const reason = aiOff(ai) ?? (title ? null : "Give the product a title first.");
  if (reason) return <AiButton disabledReason={reason}>Write with Claude</AiButton>;

  const modes = DESCRIPTION_MODES.filter((m) => m !== "translate" || locale !== PRODUCT_SOURCE_LOCALE);
  const modeWhy = Object.fromEntries(modes.map((m) => [m, descriptionModeBlocker(m, locale, sent, parts)])) as Record<DescriptionMode, string | null>;
  const pickedWhy = modeWhy[mode];
  const showLength = parts !== "description" && mode !== "translate";
  const range = BODY_LENGTH[length][loc.counts];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <AiButton aria-haspopup="dialog">Write with Claude</AiButton>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={open ? popoverRoom() : 8}
        className={cn("w-[22rem] max-w-[calc(100vw-2rem)] space-y-4", POPOVER_SCROLL)}
        aria-label={`Write with Claude, ${loc.label}`}
      >
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4" aria-hidden />
            Write with Claude
            <span className="font-normal text-muted-foreground">· {loc.label}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            From this product&apos;s details and Mpillow&apos;s facts, never a price. Nothing changes until you press Use.
          </p>
        </div>
        <Segmented
          label="Start from"
          value={mode}
          onChange={setMode}
          options={modes.map((m) => ({ value: m, label: m === "translate" ? `From ${productLocale(PRODUCT_SOURCE_LOCALE).label}` : DESCRIPTION_MODE_LABEL[m] }))}
          why={modeWhy}
        />
        <Segmented
          label="Write"
          value={parts}
          onChange={setParts}
          options={DESCRIPTION_PARTS.map((p) => ({ value: p, label: p === "both" ? "Both" : p === "body" ? "Body" : "Short description" }))}
        />
        {showLength ? (
          <div className="space-y-1">
            <Segmented label="Body length" value={length} onChange={setLength} options={DESCRIPTION_LENGTHS.map((l) => ({ value: l, label: DESCRIPTION_LENGTH_LABEL[l] }))} />
            <p className="text-xs text-muted-foreground">
              About {range.min} to {range.max} {loc.counts === "words" ? "words" : "characters"}.
            </p>
          </div>
        ) : null}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (pickedWhy) return;
            setOpen(false);
            onRun({ kind: "description", locale, mode, parts, length, brief: brief.trim(), content: sent });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={briefId} className="text-xs">
              Anything to add? <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id={briefId}
              value={brief}
              rows={3}
              maxLength={PRODUCT_AI_LIMITS.brief}
              placeholder="e.g. Made for side sleepers. The cover zips off and is machine washable."
              onChange={(e) => setBrief(e.target.value)}
              className="text-base md:text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Facts Claude may use. {brief.length} of {PRODUCT_AI_LIMITS.brief} characters.
            </p>
          </div>
          {pickedWhy ? (
            <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
              {pickedWhy}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={Boolean(pickedWhy)}>
            <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
            {mode === "translate" ? "Translate" : "Write"} {DESCRIPTION_PARTS_LABEL[parts].toLowerCase()}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function OfferFrame({ label, notes, children, actions }: { label: ReactNode; notes?: string; children: ReactNode; actions: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-lg border border-dashed border-primary/30 bg-muted/30 p-3 sm:p-4">
      <p id={id} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {label}
      </p>
      {children}
      {notes ? (
        <p className="flex items-start gap-1.5 rounded-md bg-background/60 px-2.5 py-2 text-xs text-muted-foreground">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Claude&apos;s note: </span>
            {notes}
          </span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </section>
  );
}

function Working({ what }: { what: string }) {
  return (
    <div className="space-y-2" aria-hidden>
      <p className="text-sm text-muted-foreground">{what} This takes up to a minute.</p>
      {[92, 100, 76, 88, 54].map((w, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function OfferPart({ label, checked, onChecked, meter, children }: { label: string; checked: boolean; onChecked: (v: boolean) => void; meter?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-2 text-xs font-medium max-md:min-h-11">
          <input id={id} type="checkbox" checked={checked} onChange={(e) => onChecked(e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
          {label}
        </label>
        {meter}
      </div>
      <div className={cn("rounded-md border bg-background px-3 py-2 transition-opacity", !checked && "opacity-50")}>{children}</div>
    </div>
  );
}

export function DescriptionOfferView({
  offer,
  onUse,
  onTryAgain,
  onDiscard,
}: {
  offer: Offer<DescriptionResult>;
  onUse: (r: DescriptionResult, take: { description: boolean; body: boolean }) => void;
  onTryAgain: () => void;
  onDiscard: () => void;
}) {
  const [take, setTake] = useState({ description: true, body: true });
  const primary = useRef<HTMLButtonElement>(null);
  const ready = offer.status === "ready";
  useEffect(() => {
    if (ready) primary.current?.focus();
  }, [ready]);
  const loc = productLocale(offer.request.locale);
  const translating = offer.request.kind === "description" && offer.request.mode === "translate";

  if (offer.status === "working") {
    return (
      <OfferFrame label={`Claude is ${translating ? "translating" : "writing"} the ${loc.label} description`} actions={null}>
        <Working what={translating ? "Translating from English." : "Reading the product's details and writing."} />
      </OfferFrame>
    );
  }
  if (offer.status === "failed") {
    return (
      <OfferFrame
        label="Claude's draft"
        actions={
          <>
            <Button type="button" size="sm" variant="outline" onClick={onTryAgain}>
              Try again
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
              Close
            </Button>
          </>
        }
      >
        <p role="alert" className="text-sm text-destructive">
          {offer.error}
        </p>
      </OfferFrame>
    );
  }
  const r = offer.result;
  const nothing = !(take.description && r.description !== null) && !(take.body && r.body !== null);
  return (
    <OfferFrame
      label={`Claude's draft · ${loc.label}. Nothing changes until you press Use.`}
      notes={r.notes}
      actions={
        <>
          <Button ref={primary} type="button" size="sm" disabled={nothing} onClick={() => onUse(r, take)}>
            Use {r.description !== null && r.body !== null && take.description !== take.body ? "selected" : "it"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onTryAgain}>
            Try again
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
        </>
      }
    >
      {r.description !== null ? (
        <OfferPart
          label="Short description"
          checked={take.description}
          onChecked={(v) => setTake((t) => ({ ...t, description: v }))}
          meter={<Meter n={displayWidth(r.description)} range={PRODUCT_SEO_TARGETS.shortDescription} />}
        >
          <p className="text-sm leading-relaxed">{r.description}</p>
        </OfferPart>
      ) : null}
      {r.body !== null ? (
        <OfferPart
          label="Body"
          checked={take.body}
          onChecked={(v) => setTake((t) => ({ ...t, body: v }))}
          meter={<span className="text-xs text-muted-foreground tabular-nums">{countWords(r.body, loc.counts)} {loc.counts}</span>}
        >
          <div className={cn(PRODUCT_BODY_STYLE, "max-h-96 overflow-y-auto py-1 text-[0.9375rem]")}>
            <ReactMarkdown>{r.body}</ReactMarkdown>
          </div>
        </OfferPart>
      ) : null}
    </OfferFrame>
  );
}

export function GenerateSeo({
  ai,
  locale,
  content,
  offer,
  onRun,
  onStop,
}: {
  ai: AiWritingAvailability;
  locale: Locale;
  content: ContentMap;
  offer: Offer<SeoResult> | null;
  onRun: (request: ProductAiRequest) => void;
  onStop: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyphrase, setKeyphrase] = useState("");
  const id = useId();
  const loc = productLocale(locale);
  const title = content[locale]?.title?.trim() || content[PRODUCT_SOURCE_LOCALE]?.title?.trim();
  if (offer?.status === "working") {
    const there = offer.request.locale !== locale ? ` (${productLocale(offer.request.locale).label})` : "";
    return (
      <AiButton working={`${PRODUCT_AI_WORKING.seo.replace("…", "")}${there}…`} onStop={onStop}>
        Generate SEO
      </AiButton>
    );
  }
  const reason = aiOff(ai) ?? (title ? null : "Give the product a title first.");
  if (reason) return <AiButton disabledReason={reason}>Generate SEO</AiButton>;
  const thin = !hasWords(content[locale]?.body) && !hasWords(content[locale]?.description);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <AiButton aria-haspopup="dialog">Generate SEO</AiButton>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={open ? popoverRoom() : 8}
        className={cn("w-80 max-w-[calc(100vw-2rem)] space-y-3", POPOVER_SCROLL)}
        aria-label={`Generate SEO with Claude, ${loc.label}`}
      >
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4" aria-hidden />
            Generate SEO
            <span className="font-normal text-muted-foreground">· {loc.label}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            An SEO title, answer lede and description, from the product&apos;s details and its {loc.label} words. Nothing changes until you press Use.
          </p>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(false);
            onRun({ kind: "seo", locale, keyphrase: keyphrase.trim(), content: aiContent(content) });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={id} className="text-xs">
              Search phrase to aim at <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={id}
              value={keyphrase}
              maxLength={PRODUCT_AI_LIMITS.keyphrase}
              placeholder={loc.counts === "characters" ? "例如：颈椎枕 新加坡" : "e.g. cervical pillow Singapore"}
              onChange={(e) => setKeyphrase(e.target.value)}
              className="text-base md:text-sm"
            />
            <p className="text-xs text-muted-foreground">What a shopper would type into Google to find this.</p>
          </div>
          {thin ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              This tab has no description or body yet, so Claude has only the product&apos;s details to go on. Write those first for better SEO.
            </p>
          ) : null}
          <Button type="submit" className="w-full">
            <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
            Generate {loc.label} SEO
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

type SeoField = "seoTitle" | "seoAnswer" | "seoDescription";

export function SeoOfferView({
  offer,
  onUse,
  onTryAgain,
  onDiscard,
}: {
  offer: Offer<SeoResult>;
  onUse: (r: SeoResult, take: Record<SeoField, boolean>) => void;
  onTryAgain: () => void;
  onDiscard: () => void;
}) {
  const [take, setTake] = useState<Record<SeoField, boolean>>({ seoTitle: true, seoAnswer: true, seoDescription: true });
  const primary = useRef<HTMLButtonElement>(null);
  const ready = offer.status === "ready";
  useEffect(() => {
    if (ready) primary.current?.focus();
  }, [ready]);
  const loc = productLocale(offer.request.locale);

  if (offer.status === "working") {
    return (
      <OfferFrame label={`Claude is writing the ${loc.label} SEO`} actions={null}>
        <Working what="Reading the product and its words." />
      </OfferFrame>
    );
  }
  if (offer.status === "failed") {
    return (
      <OfferFrame
        label="Claude's SEO"
        actions={
          <>
            <Button type="button" size="sm" variant="outline" onClick={onTryAgain}>
              Try again
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
              Close
            </Button>
          </>
        }
      >
        <p role="alert" className="text-sm text-destructive">
          {offer.error}
        </p>
      </OfferFrame>
    );
  }
  const r = offer.result;
  const set = (f: SeoField) => (v: boolean) => setTake((t) => ({ ...t, [f]: v }));
  const lede = PRODUCT_SEO_TARGETS.lede[loc.counts];
  return (
    <OfferFrame
      label={`Claude's SEO · ${loc.label}. Nothing changes until you press Use.`}
      notes={r.notes}
      actions={
        <>
          <Button ref={primary} type="button" size="sm" disabled={!take.seoTitle && !take.seoAnswer && !take.seoDescription} onClick={() => onUse(r, take)}>
            Use {take.seoTitle && take.seoAnswer && take.seoDescription ? "all" : "selected"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onTryAgain}>
            Try again
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
        </>
      }
    >
      <OfferPart
        label="SEO title"
        checked={take.seoTitle}
        onChecked={set("seoTitle")}
        meter={<Meter n={displayWidth(productPageTitle(r.seoTitle))} range={PRODUCT_SEO_TARGETS.title} title="The whole title in search results, with the brand" />}
      >
        <p className="text-sm">{r.seoTitle}</p>
      </OfferPart>
      <OfferPart
        label="Answer lede"
        checked={take.seoAnswer}
        onChecked={set("seoAnswer")}
        meter={<Meter n={countWords(r.seoAnswer, loc.counts)} range={lede} unit={loc.counts} />}
      >
        <p className="text-sm leading-relaxed">{r.seoAnswer}</p>
      </OfferPart>
      <OfferPart
        label="SEO description"
        checked={take.seoDescription}
        onChecked={set("seoDescription")}
        meter={<Meter n={displayWidth(r.seoDescription)} range={PRODUCT_SEO_TARGETS.description} />}
      >
        <p className="text-sm leading-relaxed">{r.seoDescription}</p>
      </OfferPart>
    </OfferFrame>
  );
}
