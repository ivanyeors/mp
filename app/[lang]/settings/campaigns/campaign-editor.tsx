"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    AlertTriangle,
    Archive,
    Blocks,
    ChevronLeft,
    Copy,
    Eraser,
    Loader2,
    MoreHorizontal,
    Plus,
    Redo2,
    Send,
    Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { AiButton } from "@/components/block-editor/ai-button";
import { BlockEditor, BlockEditorRoot } from "@/components/block-editor/block-editor";
import { BlockPalette, blockPaletteTab } from "@/components/block-editor/block-palette";
import { PresetPicker } from "@/components/block-editor/preset-picker";
import { RichText } from "@/components/block-editor/rich-text";
import { richTextFromWords, richTextWords, type RichTextVariable } from "@/components/block-editor/rich-text-doc";
import { typingBurst, useEditorHistory, useHistoryKeys } from "@/components/block-editor/use-editor-history";
import { useUnsavedGuard } from "@/components/block-editor/use-unsaved-guard";
import type { PaletteTab } from "@/components/block-editor/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileStickyActionBar, mobileStickyActionBarSpacerClassName } from "@/components/ui/mobile-sticky-action-bar";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AI_WRITING_NO_CREDENTIALS, type AiWritingAvailability } from "@/lib/ai/availability";
import { DRAFT_STAGE_TEXT, draftBlocker, draftTitle, withEditedBlocks } from "@/lib/email-campaigns/ai-drafted";
import { REFINE_BUTTON_LABEL, REFINE_STAGE_TEXT, ideasBlocker } from "@/lib/email-campaigns/ai-refine-brief";
import {
    campaignWordsEmpty,
    campaignWordsOf,
    clearAllBlocker,
    clearCampaignWords,
    CLEAR_ALL_BLOCKER_TEXT,
    CLEAR_ALL_UNDO_MS,
    type CampaignButtonChoice,
    type CampaignWords,
} from "@/lib/email-campaigns/clear-all";
import { CONTENT_LIMITS, contentFromLegacy, contentWords, newBlockId, type CampaignContent, type EmailBlock } from "@/lib/email-campaigns/content";
import {
    CAMPAIGN_AUDIENCE_LABEL,
    CAMPAIGN_AUDIENCES,
    CAMPAIGN_BLOCKER_TEXT,
    CAMPAIGN_LIMITS,
    CAMPAIGN_PLACEHOLDERS,
    FIRST_CAMPAIGN_DRAFT,
    MAX_TEST_RECIPIENTS,
    MAX_WAVE_SIZE,
    variablesInEmail,
    type Campaign,
    type CampaignAudience,
    type CampaignDraft,
    type CampaignDraftInput,
} from "@/lib/email-campaigns/rules";
import { PREVIEW_AS_LABEL, withSampleValues, type PreviewAs } from "@/lib/email-campaigns/variables";
import type { CampaignStats } from "@/lib/email-campaigns/store";
import type { CampaignReadiness } from "@/lib/email-campaigns/sender";
import { defaultWaveSize, nextStepAfterWave, rampUntil, sendSteps, waitingSummary } from "@/lib/email-campaigns/send-flow";
import type { CampaignWaveStats } from "@/lib/customer-migration/campaign-ledger";
import { formatAdminWeekdayTime } from "@/lib/format/admin-date";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import {
    archiveCampaignAction,
    checkCampaignReadiness,
    duplicateCampaign,
    planCampaignWave,
    previewCampaign,
    saveCampaign,
    sendCampaignBatchAction,
    sendCampaignTestAction,
    type WaveAnswer,
} from "./actions";
import { CampaignAiContext, type CampaignAi } from "./ai/ai-context";
import { useAiDraft } from "./ai/use-ai-draft";
import { IDEAS_KIND, type IdeasField } from "./ai/refine-state";
import { useAiRefine } from "./ai/use-ai-refine";
import { CAMPAIGN_BLOCKS } from "./blocks/catalogue";
import { VariableFallbacks } from "./blocks/fallbacks";
import { campaignVariables } from "./blocks/runs";
import { CampaignVariablesTab } from "./blocks/variables";
import { EmailPreview, type PreviewDevice, type PreviewScheme } from "./email-preview";
import { Field } from "./field";
import { draftOf, keptDraft, keptDraftKey, keptOf, type EditorDraft, type KeptDraft } from "./kept-draft";
import { SendConfirmDialog, sendButtonLabel, type SendConfirmation } from "./send-confirm-dialog";
import { CheckList, StatusIcon } from "./send-parts";
import { WaveTable } from "./wave-table";

/** A Segment to send to; `customersHref` opens its list, for Staff holding `customers`. */
export type SegmentOption = { id: string; name: string; customersHref?: string | null };

/** The Clear all toast, one at a time: a second Clear all replaces it, Save dismisses it. Convert to blocks shares it. */
const CLEAR_ALL_TOAST = "campaign-clear-all";

/** The palette's tabs: Blocks now; Starters (slice 08) join it, and Variables (slice 13) follow them, built with the email. */
const PALETTE = [blockPaletteTab(CAMPAIGN_BLOCKS)];

/** A campaign written before blocks has no Variables: its subject and preview line are words alone. */
const NO_VARIABLES: readonly RichTextVariable[] = [];

/** How long typing pauses before the preview renders again. */
const PREVIEW_AFTER_MS = 400;

/** Past this, a subject may be cut off on a phone; a preview line reads best in this range (PRD *Research*). */
const SUBJECT_PHONE = 60;
const PREVIEW_LINE_RANGE = [40, 90] as const;

/** AI writing off, until the page says otherwise. */
const AI_OFF: AiWritingAvailability = { on: false, configured: false };

/** While one draft is written, another can't start. */
const AI_BUSY = "Claude is writing. Wait for it, or press Stop.";

// ✨ Generate's popover, its bar and its ideas load after the page, not with it (slice 09).
const editorAi = () => import("./ai/editor-ai");
const GeneratePopover = lazy(() => editorAi().then((m) => ({ default: m.GeneratePopover })));
const DraftBar = lazy(() => editorAi().then((m) => ({ default: m.DraftBar })));
const DraftIdeas = lazy(() => editorAi().then((m) => ({ default: m.DraftIdeas })));
// ✨ Refine's ideas under the subject and the preview line too (slice 10).
const IdeasPanel = lazy(() => editorAi().then((m) => ({ default: m.IdeasPanel })));

/** What a block's card says while Claude's words in it are unread. */
const DRAFTED_WITH_AI = "Drafted with AI";

const n = (v: number) => v.toLocaleString("en-SG");

type WaveProgress = {
    wave: string;
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    running: boolean;
    stopped: string | null;
    /** Staff pressed Stop. */
    stoppedByStaff: boolean;
    /** Eligible people the wave did not include, when it started. */
    waiting: number;
    errors: string[];
};

const UNREAD_READINESS = (detail: string): CampaignReadiness => ({
    checks: [{ key: "transport", ok: false, detail }],
    ready: false,
    allowance: null,
    sender: { from: null, replyTo: null },
});

/** A field's live count, amber with why once it runs long. */
function CharCount({ value, warn, ok, id }: { value: string; warn: string | null; ok?: string; id: string }) {
    return (
        <p id={id} className={cn("text-xs", warn ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")} aria-live="polite">
            {n(value.length)} characters{warn ? `: ${warn}` : ok ? `. ${ok}` : ""}
        </p>
    );
}

/**
 * Admin Panel → Email campaigns → one campaign (PRD-email-marketing): write it
 * with a live preview, send a test, check what sending needs, then send in
 * waves. A wave is sent from this page a batch at a time, so it stays open
 * while it sends; closing it stops the wave, and the next one picks up the
 * people still to send to.
 *
 * Two tabs (PRD-campaign-email-editor slice 04). **Write** is the shared
 * block editor (components/block-editor/): the palette, the email with its
 * blocks, and the server-rendered preview with its inbox row. Every change,
 * Clear all and Convert to blocks included, is one step of the editor's
 * history (⌘Z, ⇧⌘Z); ⌘S saves; leaving with unsaved changes asks first,
 * and a crashed tab offers them back. **Send** is the send flow as it was
 * (PRD-campaign-send-flow): a test, the checklist, a wave no bigger than
 * today's room, a confirmation that restates the send, and each wave's
 * numbers against the pause lines.
 *
 * Placeholders, not prefilled words (slice 01): an empty field shows its
 * hint, never saved or sent. A campaign written before blocks (slice 03)
 * keeps its message box and button, and an unsent one offers *Convert to
 * blocks*.
 */
export function CampaignEditor({
    campaign,
    draft: initial,
    stats,
    waves = [],
    segments,
    staffEmail,
    pointsLive = false,
    ai = AI_OFF,
}: {
    /** Null for a new one. */
    campaign: Campaign | null;
    draft: CampaignDraft;
    stats: CampaignStats | null;
    /** This campaign's waves, oldest first or in any order. */
    waves?: CampaignWaveStats[];
    segments: SegmentOption[];
    /** The signed-in Staff email: the test's default address. */
    staffEmail: string;
    /** Points are live (`pointsLive`): *Points balance* can be put in (slice 13). */
    pointsLive?: boolean;
    /** AI writing on, and Claude set up (slice 09): off shows no ✨ at all. */
    ai?: AiWritingAvailability;
}) {
    const router = useRouter();
    const locale = getLocaleFromPathname(usePathname() ?? "") ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const locked = Boolean(campaign?.lockedAt);

    // ── The draft ──────────────────────────────────────────────────────────
    // The draft is the history's: the email's words, its blocks and the greeting, and who it goes to.
    const history = useEditorHistory<EditorDraft>(() => ({
        ...campaignWordsOf(initial),
        greeting: initial.greeting,
        audience: initial.audience,
        segmentId: initial.segmentId ?? "",
    }));
    const draft = history.value;
    const { name, subject, preheader, body, content, greeting, audience, segmentId } = draft;
    const { choice: buttonChoice, label: buttonLabel, url: buttonUrl } = draft.button;
    const edit = (patch: Partial<EditorDraft>, burst?: string) => history.set((e) => ({ ...e, ...patch }), { burst });
    const editButton = (patch: Partial<CampaignWords["button"]>, burst?: string) =>
        history.set((e) => ({ ...e, button: { ...e.button, ...patch } }), { burst });
    const editContent = (next: CampaignContent, burst?: string) => history.set((e) => ({ ...e, content: next }), { burst });
    // A block a person changes is no longer *Drafted with AI* (slice 09).
    const setBlocks = (blocks: EmailBlock[], burst?: string) =>
        history.set((e) => (e.content ? { ...e, content: withEditedBlocks(e.content, blocks) } : e), { burst });

    const setAudience = (v: CampaignAudience) => edit({ audience: v });
    const setSegmentId = (v: string) => edit({ segmentId: v });
    // The chosen Segment's Customers list (PRD-crm-retention-loop slice 02).
    const chosenSegmentHref = segments.find((s) => s.id === segmentId)?.customersHref ?? null;
    // What the email says, as Clear all and Undo see it.
    const words: CampaignWords = useMemo(
        () => ({ name, subject, preheader, body, button: draft.button, content }),
        [name, subject, preheader, body, draft.button, content],
    );

    const input: CampaignDraftInput = useMemo(
        () => ({
            name,
            subject,
            preheader,
            // A block campaign is its blocks alone.
            body: content ? "" : body,
            content,
            greeting,
            audience,
            segmentId: audience === "segment" ? segmentId || null : null,
            button:
                content || buttonChoice === "none"
                    ? null
                    : { target: buttonChoice, label: buttonLabel, url: buttonChoice === "url" ? buttonUrl : null },
        }),
        [name, subject, preheader, body, content, greeting, audience, segmentId, buttonChoice, buttonLabel, buttonUrl],
    );
    const inputKey = JSON.stringify(input);
    const [savedKey, setSavedKey] = useState(inputKey);
    const changed = inputKey !== savedKey;
    const dirty = changed || !campaign;

    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    // The palette's open tab on a laptop: Blocks, or Variables (slice 13).
    const [paletteTab, setPaletteTab] = useState("blocks");

    // The step Clear all (or Convert to blocks) made, and the words it took, until Undo puts them back or Save makes them gone.
    const undoRef = useRef<{ words: CampaignWords; step: number | null } | null>(null);
    const latest = useRef(history);
    useEffect(() => {
        latest.current = history;
        // The step a Clear all just made: the toast's Undo is the history's while nothing has changed since.
        if (undoRef.current && undoRef.current.step === null) undoRef.current.step = history.step;
    });
    useEffect(() => () => void toast.dismiss(CLEAR_ALL_TOAST), []);

    // A new campaign's id once its first Save made it: until the page for it opens, a second Save changes it rather than making another.
    const createdId = useRef<string | null>(null);
    const save = useCallback(async (): Promise<string | null> => {
        setSaving(true);
        setSaveError(null);
        try {
            const res = await saveCampaign(campaign?.id ?? createdId.current, input);
            if (!res.ok) {
                setSaveError(res.error);
                setFieldErrors(res.fieldErrors ?? {});
                // A fallback's error shows under the Variables palette's chips (slice 13): open it there.
                if (Object.keys(res.fieldErrors ?? {}).some((k) => k.startsWith("content.fallbacks."))) setPaletteTab("variables");
                return null;
            }
            setFieldErrors({});
            setSavedKey(JSON.stringify(input));
            // After a Save, Clear all's Undo is gone.
            undoRef.current = null;
            toast.dismiss(CLEAR_ALL_TOAST);
            if (!campaign) {
                createdId.current = res.id;
                router.replace(withLocale(`/settings/campaigns/${res.id}`, locale));
            } else router.refresh();
            return res.id;
        } finally {
            setSaving(false);
        }
    }, [campaign, input, locale, router]);

    // ── Write: tabs, selection, panes ──────────────────────────────────────
    const [tab, setTab] = useState<"write" | "send">("write");
    const [selected, setSelected] = useState<string | null>(null);
    const [pane, setPane] = useState<"write" | "preview">("write");
    const [addOpen, setAddOpen] = useState(false);
    // The header and Write: what ⌘Z and ⇧⌘Z reach. The Send tab's fields keep the browser's own undo.
    const editorArea = useRef<HTMLDivElement>(null);

    // ── Variables (slice 13): what every text input offers, and the fallbacks the email needs ──
    const variables = useMemo(() => campaignVariables({ pointsLive }), [pointsLive]);
    const lineVariables = content ? variables : NO_VARIABLES;
    const subjectValue = useMemo(() => richTextFromWords(subject, lineVariables), [subject, lineVariables]);
    const preheaderValue = useMemo(() => richTextFromWords(preheader, lineVariables), [preheader, lineVariables]);
    const usedVariables = useMemo(() => variablesInEmail({ subject, preheader, content, greeting }), [subject, preheader, content, greeting]);

    // ── The preview ────────────────────────────────────────────────────────
    const [device, setDevice] = useState<PreviewDevice>("desktop");
    const [scheme, setScheme] = useState<PreviewScheme>("light");
    // A block campaign's Variables as a sample customer's, or every fallback (slice 13).
    const [previewAs, setPreviewAs] = useState<PreviewAs>("customer");
    const [preview, setPreview] = useState<{ subject: string; html: string; from: string | null } | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    useEffect(() => {
        let live = true;
        const timer = setTimeout(async () => {
            const res = await previewCampaign(input, { forceDark: scheme === "dark", previewAs }).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
            if (!live) return;
            if (res.ok) {
                setPreview({ subject: res.subject, html: res.html, from: res.from ?? null });
                setPreviewError(null);
            } else {
                setPreviewError("fieldErrors" in res && res.fieldErrors ? Object.values(res.fieldErrors)[0] ?? res.error : res.error);
            }
        }, PREVIEW_AFTER_MS);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [input, scheme, previewAs]);

    // ── Readiness ──────────────────────────────────────────────────────────
    const campaignId = campaign?.id;
    const [readiness, setReadiness] = useState<CampaignReadiness | null>(null);
    const checks = readiness?.checks ?? null;
    const allowance = readiness?.allowance ?? null;
    const [checking, setChecking] = useState(false);
    const readChecks = useCallback(
        () => checkCampaignReadiness(campaignId).catch((e: unknown) => UNREAD_READINESS(String(e))),
        [campaignId],
    );
    const runChecks = async () => {
        setChecking(true);
        setReadiness(await readChecks());
        setChecking(false);
    };
    useEffect(() => {
        if (!campaignId) return;
        let live = true;
        void readChecks().then((r) => live && setReadiness(r));
        return () => {
            live = false;
        };
    }, [campaignId, readChecks]);
    const pauseFailing = checks?.some((c) => c.key === "pause" && !c.ok) ?? false;

    // ── Test ───────────────────────────────────────────────────────────────
    const [testTo, setTestTo] = useState(staffEmail);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
    const [lastTest, setLastTest] = useState<{ sent: number; at: string } | null>(null);
    const sendTest = async () => {
        if (!campaign) return;
        setTesting(true);
        setTestResult(null);
        try {
            if (dirty && !locked && !(await save())) return;
            const addresses = testTo.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
            const res = await sendCampaignTestAction(campaign.id, addresses);
            if (!res.ok) setTestResult({ ok: false, text: res.error });
            else if (res.failed.length) setTestResult({ ok: false, text: `Sent ${res.sent}. Couldn't send to ${res.failed.map((f) => `${f.to} (${f.error})`).join(", ")}.` });
            else setTestResult({ ok: true, text: `Test sent to ${res.sent} address${res.sent === 1 ? "" : "es"}. Check the inbox, and the spam folder.` });
            if (res.ok && res.sent > 0) {
                setLastTest({ sent: res.sent, at: new Date().toISOString() });
                // A test uses the plan's room too.
                void readChecks().then(setReadiness);
            }
        } finally {
            setTesting(false);
        }
    };

    // ── Waves ──────────────────────────────────────────────────────────────
    // Until Staff type a size, it follows today's room (and 50 for a first wave).
    const firstWave = !campaign?.lockedAt;
    const [sizeInput, setSizeInput] = useState<number | null>(null);
    const room = allowance?.remaining ?? null;
    const maxSize = room && room > 0 ? Math.min(MAX_WAVE_SIZE, room) : MAX_WAVE_SIZE;
    const size = Math.min(sizeInput ?? defaultWaveSize(allowance, firstWave, MAX_WAVE_SIZE), maxSize);
    const [retryFailed, setRetryFailed] = useState(false);
    const [resume, setResume] = useState(false);
    const [plan, setPlan] = useState<Extract<WaveAnswer, { ok: true }> | null>(null);
    const [planError, setPlanError] = useState<string | null>(null);
    const [planning, setPlanning] = useState(false);
    const [progress, setProgress] = useState<WaveProgress | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const stopRef = useRef(false);
    // Sampled once for the life of the page, as formatAdminRelative's callers do.
    const [nowMs] = useState(() => Date.now());
    const rampEnds = rampUntil(waves, nowMs);

    const checkAudience = async () => {
        if (!campaign) return;
        setPlanning(true);
        setPlanError(null);
        try {
            const res = await planCampaignWave(campaign.id, { size, retryFailed, resume }, false);
            if (res.ok) {
                setPlan(res);
                // The plan's checks are the freshest: show them in Ready to send? too.
                setReadiness(res.readiness);
            } else setPlanError(res.error);
        } finally {
            setPlanning(false);
        }
    };

    useEffect(() => {
        if (!progress?.running) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [progress?.running]);

    /** How many the checked plan sends now: the eligible, less who waits for later waves. */
    const planned = plan ? plan.plan.eligible - plan.waiting : 0;
    const confirmation: SendConfirmation | null = plan
        ? {
              count: planned,
              wave: plan.wave,
              subject,
              from: plan.readiness.sender.from,
              replyTo: plan.readiness.sender.replyTo,
              audience: CAMPAIGN_AUDIENCE_LABEL[audience] + (audience === "segment" ? `: ${segments.find((x) => x.id === segmentId)?.name ?? "a segment"}` : ""),
              firstWave,
          }
        : null;

    const startWave = async () => {
        if (!campaign || !plan) return;
        setConfirmOpen(false);
        setPlanning(true);
        setPlanError(null);
        let started: Extract<WaveAnswer, { ok: true }>;
        try {
            const res = await planCampaignWave(campaign.id, { size, retryFailed, resume }, true);
            if (!res.ok) return setPlanError(res.error);
            if (!res.started) {
                setPlan(res);
                return setPlanError(res.readiness.ready ? "Nobody is left to send to." : "A check fails, so nothing was sent.");
            }
            started = res;
        } finally {
            setPlanning(false);
        }

        stopRef.current = false;
        const ids = started.customerIds;
        let state: WaveProgress = {
            wave: started.wave,
            total: ids.length,
            sent: 0,
            failed: 0,
            skipped: 0,
            running: true,
            stopped: null,
            stoppedByStaff: false,
            waiting: started.waiting,
            errors: [],
        };
        setProgress(state);
        let failuresInARow = 0;
        for (let i = 0; i < ids.length; i += started.batchSize) {
            if (stopRef.current) {
                state = { ...state, stopped: "You stopped the wave.", stoppedByStaff: true };
                break;
            }
            const res = await sendCampaignBatchAction(campaign.id, {
                wave: started.wave,
                customerIds: ids.slice(i, i + started.batchSize),
                retryFailed,
                failuresInARow,
            }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
            if (!res.ok) {
                state = { ...state, stopped: res.error };
                break;
            }
            failuresInARow = res.failuresInARow;
            const skipped = Object.values(res.skipped).reduce((a: number, b) => a + (b ?? 0), 0);
            state = {
                ...state,
                sent: state.sent + res.sent,
                failed: state.failed + res.failed,
                skipped: state.skipped + skipped,
                errors: [...state.errors, ...res.errors].slice(0, 5),
                stopped: res.stopped,
            };
            setProgress(state);
            if (res.stopped) break;
        }
        const unsent = state.total - state.sent - state.failed - state.skipped;
        setProgress({ ...state, running: false, waiting: state.waiting + Math.max(0, unsent) });
        setPlan(null);
        setSizeInput(null);
        router.refresh();
        void runChecks();
    };

    // ── Archive and duplicate ──────────────────────────────────────────────
    const [busy, setBusy] = useState(false);
    const archive = async () => {
        if (!campaign || !window.confirm(`Archive "${campaign.name}"? It leaves the list; what was sent stays recorded.`)) return;
        setBusy(true);
        const res = await archiveCampaignAction(campaign.id);
        setBusy(false);
        if (res.ok) router.push(to("/settings/campaigns"));
        else setSaveError(res.error);
    };
    const duplicate = async () => {
        // The copy is of what is saved: changes not saved yet would be left behind.
        if (!campaign || !guard.confirmLeave()) return;
        setBusy(true);
        const res = await duplicateCampaign(campaign.id);
        setBusy(false);
        if (res.ok) router.push(to(`/settings/campaigns/${res.id}`));
        else setSaveError(res.error);
    };

    const sending = progress?.running ?? false;
    const ready = checks?.every((c) => c.ok || (c.key === "pause" && resume)) ?? false;
    const editable = !locked && !sending;

    // ── ✨ Generate (slice 09): Claude writes into the email, as one change; only Staff save or send ──
    const aiDraft = useAiDraft({ history, campaignId: campaign?.id ?? null });
    // ✨ Refine (slice 10): ideas under the subject and preview line, and a rewrite beside a heading or text block.
    const refine = useAiRefine({ history, campaignId: campaign?.id ?? null });
    // One ask at a time: while Claude writes anything, the other ✨ buttons wait.
    const aiBusy = aiDraft.working || refine.working !== null;
    // The brief's popover, under ✨ Generate; anything on the page may open it (slice 08's *✨ Write with AI*).
    const [generateOpen, setGenerateOpen] = useState(false);
    const aiHere = ai.on && editable && Boolean(content);
    const titleBlocker = draftBlocker(subject, name);
    const aiStage = aiDraft.run ? DRAFT_STAGE_TEXT[aiDraft.run.stage] : "";
    const aiRunScope = aiDraft.working ? aiDraft.run?.where : null;
    const emailWords = useMemo(() => (content ? contentWords(content) : []), [content]);
    const campaignAi: CampaignAi | null = aiHere
        ? {
              writeBlock: (id) => void aiDraft.start({ about: "", goal: null, products: [] }, { scope: "text", target: id }),
              stop: aiDraft.stop,
              reason: !ai.configured ? AI_WRITING_NO_CREDENTIALS : aiBusy ? AI_BUSY : titleBlocker,
              writing: aiRunScope?.scope === "text" ? { id: aiRunScope.target, stage: aiStage } : null,
              rewrite: {
                  reason: (id) =>
                      !ai.configured
                          ? AI_WRITING_NO_CREDENTIALS
                          : aiDraft.working || (refine.working && !(refine.working === "rewrite" && refine.offer?.blockId === id))
                            ? AI_BUSY
                            : null,
                  offer: refine.offer,
                  start: (block, action, instruction) => void refine.rewrite(block, action, instruction),
                  stop: refine.stop,
                  replace: refine.replace,
                  tryAgain: refine.tryAgain,
                  keepMine: refine.keepMine,
              },
          }
        : null;
    /** *✨ Suggest subject lines* or *preview lines*, in the field's label row (slice 10). */
    const suggestButton = (field: IdeasField) => {
        const kind = IDEAS_KIND[field];
        return (
            <AiButton
                variant="ghost"
                className="h-7 px-2 text-xs"
                working={refine.working === kind ? REFINE_STAGE_TEXT[kind] : null}
                onStop={refine.stop}
                disabledReason={!ai.configured ? AI_WRITING_NO_CREDENTIALS : aiBusy ? AI_BUSY : ideasBlocker(kind, { subject, words: emailWords })}
                onClick={() => {
                    aiDraft.dismissIdeas(field);
                    void refine.suggest(field);
                }}
            >
                {REFINE_BUTTON_LABEL[kind]}
            </AiButton>
        );
    };
    const aiDrafted = content?.aiDrafted;
    const badges = useMemo(() => Object.fromEntries((aiDrafted ?? []).map((id) => [id, DRAFTED_WITH_AI])), [aiDrafted]);

    // ── Editing safety (slice 04): one history, ⌘S, the leave guard, the browser's copy ──
    useHistoryKeys(history, { enabled: editable, within: editorArea });
    const saveDisabled = saving || sending || (!dirty && Boolean(campaign));
    const kept: KeptDraft = useMemo(() => keptOf(draft), [draft]);
    const guard = useUnsavedGuard<KeptDraft>({
        dirty: changed,
        onSave: () => {
            if (!saveDisabled) void save();
        },
        keep: locked ? undefined : { key: keptDraftKey(campaign?.id ?? null), base: campaign?.updatedAt ?? "new", value: kept, parse: keptDraft },
    });
    const restoreKept = () => {
        const k = guard.restore();
        if (k) history.set(draftOf(k));
    };

    // ── Clear all (slice 01), one step of the history ──────────────────────
    // Writes nothing: the email is saved, and audited, only by Save.
    const clearBlocker = clearAllBlocker({ locked, sending, words });
    const clearWhy = clearBlocker ? CLEAR_ALL_BLOCKER_TEXT[clearBlocker] : null;
    // Opens only while Clear all is off, to say why; the button stays focusable, so the tree never changes under it.
    const [clearTipOpen, setClearTipOpen] = useState(false);
    /** The toast's Undo: the history's own while nothing has changed since; else the words put back, as a step. */
    const undoToast = (message: string) =>
        toast(message, {
            id: CLEAR_ALL_TOAST,
            duration: CLEAR_ALL_UNDO_MS,
            action: {
                label: "Undo",
                onClick: () => {
                    const u = undoRef.current;
                    undoRef.current = null;
                    if (!u) return;
                    const h = latest.current;
                    if (u.step === h.step) h.undo();
                    else h.set((e) => ({ ...e, ...u.words }));
                },
            },
        });
    const clearAll = () => {
        if (clearBlocker) return;
        const { words: cleared, snapshot } = clearCampaignWords(words);
        undoRef.current = { words: snapshot, step: null };
        history.set((e) => ({ ...e, ...cleared }));
        setSelected(null);
        undoToast("Cleared the email.");
    };
    /**
     * *Use the sign-in invitation*: its words and audience as real words, for
     * whoever wants them; in a block campaign, as blocks. Slice 08 makes it a Starter.
     */
    const fillInvitation = () => {
        const invitation = campaignWordsOf(FIRST_CAMPAIGN_DRAFT);
        history.set((e) => ({
            ...e,
            ...(e.content
                ? { ...invitation, body: "", button: { choice: "none", label: "", url: "" }, content: contentFromLegacy(FIRST_CAMPAIGN_DRAFT) }
                : invitation),
            audience: FIRST_CAMPAIGN_DRAFT.audience,
        }));
    };
    /**
     * *Convert to blocks* (slice 03): the message and its button as blocks
     * that read the same, the subject as the opening heading. Nothing is saved
     * until Save, so the toast offers Undo, as Clear all's does.
     */
    const convertToBlocks = () => {
        if (locked || sending || content) return;
        undoRef.current = { words, step: null };
        history.set((e) => ({
            ...e,
            body: "",
            button: { choice: "none", label: "", url: "" },
            content: contentFromLegacy({
                subject,
                body,
                button: buttonChoice === "none" ? null : { target: buttonChoice, label: buttonLabel, url: buttonChoice === "url" ? buttonUrl : null },
            }),
        }));
        undoToast("Converted the message to blocks. Save to keep them.");
    };

    // Counted as a customer reads them: each Variable as the sample customer's words.
    const subjectRead = content ? withSampleValues(subject) : subject;
    const preheaderRead = content ? withSampleValues(preheader) : preheader;
    const subjectWarn = subjectRead.length > SUBJECT_PHONE ? "may be cut off on phones" : null;
    const preheaderWarn =
        preheaderRead && (preheaderRead.length < PREVIEW_LINE_RANGE[0] || preheaderRead.length > PREVIEW_LINE_RANGE[1])
            ? `${PREVIEW_LINE_RANGE[0]} to ${PREVIEW_LINE_RANGE[1]} reads best`
            : null;
    const palette = Boolean(content) && editable;
    // The palette: Blocks, then Variables (slice 13), whose chips go in at the cursor of the words last written in.
    const asideTabs: PaletteTab<EmailBlock>[] = [
        ...PALETTE,
        {
            value: "variables",
            label: "Variables",
            content: (
                <CampaignVariablesTab>
                    {content ? <VariableFallbacks used={usedVariables} content={content} onChange={editContent} disabled={!editable} errors={fieldErrors} /> : null}
                </CampaignVariablesTab>
            ),
        },
    ];
    // A phone's sheet: a tap puts a Variable in and closes it; the fallbacks are under the blocks.
    const sheetTabs: PaletteTab<EmailBlock>[] = [
        ...PALETTE,
        { value: "variables", label: "Variables", content: <CampaignVariablesTab draggable={false} onInserted={() => setAddOpen(false)} /> },
    ];
    const saveLabel = campaign ? "Save changes" : "Save draft";
    const sendBar = Boolean(campaign && (sending || (plan && planned > 0)) && (tab === "send" || sending));
    const writeBar = !sendBar && tab === "write" && !sending;

    const saveButton = (className?: string) => (
        <Button onClick={() => void save()} disabled={saveDisabled} className={className}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {saveLabel}
        </Button>
    );

    // The email's own column: who it goes to, from whom, its subject and preview line, then its blocks.
    const theEmail = (
        <Card className="min-w-0">
            <CardContent className="space-y-4 pt-6">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Send to" htmlFor="c-audience" error={fieldErrors.segmentId}>
                        <Select value={audience} onValueChange={(v) => setAudience(v as CampaignAudience)}>
                            <SelectTrigger id="c-audience" className="w-full justify-between" disabled={locked}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CAMPAIGN_AUDIENCES.map((a) => (
                                    <SelectItem key={a} value={a}>
                                        {CAMPAIGN_AUDIENCE_LABEL[a]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    {audience === "segment" ? (
                        <Field
                            label="Segment"
                            htmlFor="c-segment"
                            hint={
                                segments.length ? (
                                    <>
                                        Save segments from the filters on the Customers list.
                                        {chosenSegmentHref ? (
                                            <>
                                                {" "}
                                                <Link href={chosenSegmentHref} className="font-medium text-foreground underline-offset-4 hover:underline">
                                                    See who is in it
                                                </Link>
                                            </>
                                        ) : null}
                                    </>
                                ) : (
                                    "No segments yet. Save one from the filters on the Customers list."
                                )
                            }
                        >
                            <Select value={segmentId} onValueChange={setSegmentId}>
                                <SelectTrigger id="c-segment" className="w-full justify-between" disabled={locked || !segments.length}>
                                    <SelectValue placeholder="Choose a segment" />
                                </SelectTrigger>
                                <SelectContent>
                                    {segments.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    ) : null}
                </div>
                <p className="text-sm">
                    <span className="font-medium">From</span>{" "}
                    <span className="break-words text-muted-foreground">
                        {preview ? (preview.from ?? "Not set up yet: the Send tab says what sending needs.") : "…"}
                    </span>
                </p>

                {/* One line each, with Variables as chips in a block campaign (slice 13); saved as words with `{first_name}` in them. */}
                <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label id="c-subject-label">Subject</Label>
                        {aiHere ? suggestButton("subject") : null}
                    </div>
                    <RichText
                        id="c-subject"
                        singleLine
                        aria-labelledby="c-subject-label"
                        aria-describedby="c-subject-count"
                        aria-invalid={Boolean(fieldErrors.subject)}
                        value={subjectValue}
                        variables={lineVariables}
                        placeholder={CAMPAIGN_PLACEHOLDERS.subject}
                        readOnly={locked}
                        onChange={(next, how) => edit({ subject: richTextWords(next) }, how.paste ? undefined : "c-subject")}
                    />
                    {fieldErrors.subject ? <p className="text-xs text-destructive">{fieldErrors.subject}</p> : null}
                    <CharCount id="c-subject-count" value={subjectRead} warn={subjectWarn} />
                    {aiHere && refine.ideas.subject ? (
                        <Suspense fallback={null}>
                            <IdeasPanel
                                id="c-subject-ideas"
                                label="Subject ideas"
                                offer={refine.ideas.subject}
                                phoneWarning
                                measure={(idea) => withSampleValues(idea).length}
                                moreReason={aiBusy ? AI_BUSY : null}
                                onPick={(idea) => refine.pick("subject", idea)}
                                onMore={() => void refine.suggest("subject", { more: true })}
                                onDismiss={() => refine.dismissIdeas("subject")}
                            />
                        </Suspense>
                    ) : aiHere && aiDraft.ideas.subjects.length ? (
                        <Suspense fallback={null}>
                            <DraftIdeas
                                id="c-subject-ideas"
                                label="Subject ideas"
                                ideas={aiDraft.ideas.subjects}
                                phoneWarning
                                onPick={(idea) => aiDraft.pick("subject", idea)}
                                onDismiss={() => aiDraft.dismissIdeas("subject")}
                            />
                        </Suspense>
                    ) : null}
                </div>
                <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label id="c-preheader-label">Preview line</Label>
                        {aiHere ? suggestButton("preheader") : null}
                    </div>
                    <RichText
                        id="c-preheader"
                        singleLine
                        aria-labelledby="c-preheader-label"
                        aria-describedby="c-preheader-count"
                        aria-invalid={Boolean(fieldErrors.preheader)}
                        value={preheaderValue}
                        variables={lineVariables}
                        placeholder={CAMPAIGN_PLACEHOLDERS.preheader}
                        readOnly={locked}
                        onChange={(next, how) => edit({ preheader: richTextWords(next) }, how.paste ? undefined : "c-preheader")}
                    />
                    {fieldErrors.preheader ? <p className="text-xs text-destructive">{fieldErrors.preheader}</p> : null}
                    <CharCount
                        id="c-preheader-count"
                        value={preheaderRead}
                        warn={preheaderWarn}
                        ok={`Shown after the subject in most inboxes. Optional; ${PREVIEW_LINE_RANGE[0]} to ${PREVIEW_LINE_RANGE[1]} reads best.`}
                    />
                    {aiHere && refine.ideas.preheader ? (
                        <Suspense fallback={null}>
                            <IdeasPanel
                                id="c-preheader-ideas"
                                label="Preview line ideas"
                                offer={refine.ideas.preheader}
                                measure={(idea) => withSampleValues(idea).length}
                                moreReason={aiBusy ? AI_BUSY : null}
                                onPick={(idea) => refine.pick("preheader", idea)}
                                onMore={() => void refine.suggest("preheader", { more: true })}
                                onDismiss={() => refine.dismissIdeas("preheader")}
                            />
                        </Suspense>
                    ) : aiHere && aiDraft.ideas.preheaders.length ? (
                        <Suspense fallback={null}>
                            <DraftIdeas
                                id="c-preheader-ideas"
                                label="Preview line ideas"
                                ideas={aiDraft.ideas.preheaders}
                                onPick={(idea) => aiDraft.pick("preheader", idea)}
                                onDismiss={() => aiDraft.dismissIdeas("preheader")}
                            />
                        </Suspense>
                    ) : null}
                </div>

                <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="c-greeting">Start with &ldquo;Hi &lt;first name&gt;,&rdquo;</Label>
                    <Switch id="c-greeting" checked={greeting} disabled={locked} onCheckedChange={(v) => edit({ greeting: v })} />
                </div>

                {content ? (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium leading-none">Blocks</span>
                            {palette ? (
                                <Button type="button" variant="outline" size="sm" className="lg:hidden" onClick={() => setAddOpen(true)}>
                                    <Plus className="mr-1 h-4 w-4" />
                                    Add
                                </Button>
                            ) : null}
                        </div>
                        {aiDraft.showBar && aiDraft.run ? (
                            <Suspense fallback={null}>
                                <DraftBar
                                    run={aiDraft.run}
                                    onStop={aiDraft.stop}
                                    onKeep={aiDraft.keep}
                                    onTryAgain={aiDraft.tryAgain}
                                    onUndo={aiDraft.undo}
                                    onDismiss={aiDraft.dismiss}
                                />
                            </Suspense>
                        ) : null}
                        <BlockEditor
                            label="The email's blocks"
                            empty="No blocks yet. Drag a heading, some text and a button in from Blocks, or add one below."
                            errors={fieldErrors}
                            errorPath="content.blocks"
                        />
                        {/* On a laptop the fallbacks sit under the Variables palette's chips; on a phone, and while the palette is hidden, here. */}
                        <div className={cn(palette && "lg:hidden")}>
                            <VariableFallbacks used={usedVariables} content={content} onChange={editContent} disabled={!editable} errors={fieldErrors} idPrefix="c-email-fallback" />
                        </div>
                    </div>
                ) : (
                    <>
                        <Field
                            label="Message"
                            htmlFor="c-body"
                            error={fieldErrors.body}
                            hint={
                                <>
                                    A blank line starts a new paragraph. Start a line with &ldquo;- &rdquo; for a bullet, or &ldquo;## &rdquo; for a heading.
                                    Links starting https:// become clickable.
                                </>
                            }
                        >
                            <Textarea
                                id="c-body"
                                rows={14}
                                value={body}
                                placeholder={CAMPAIGN_PLACEHOLDERS.body}
                                disabled={locked}
                                maxLength={CAMPAIGN_LIMITS.body}
                                onChange={(e) => edit({ body: e.target.value }, typingBurst(e, "c-body"))}
                            />
                        </Field>
                        <Field label="Button" htmlFor="c-button">
                            <Select value={buttonChoice} onValueChange={(v) => editButton({ choice: v as CampaignButtonChoice })}>
                                <SelectTrigger id="c-button" className="w-full justify-between" disabled={locked}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No button</SelectItem>
                                    <SelectItem value="sign_in">Sign in to their account</SelectItem>
                                    <SelectItem value="url">A link</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        {buttonChoice !== "none" ? (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Button label" htmlFor="c-button-label" error={fieldErrors["button.label"]}>
                                    <Input
                                        id="c-button-label"
                                        value={buttonLabel}
                                        placeholder={CAMPAIGN_PLACEHOLDERS.buttonLabel}
                                        disabled={locked}
                                        maxLength={CAMPAIGN_LIMITS.buttonLabel}
                                        onChange={(e) => editButton({ label: e.target.value }, typingBurst(e, "c-button-label"))}
                                    />
                                </Field>
                                {buttonChoice === "url" ? (
                                    <Field label="Link" htmlFor="c-button-url" error={fieldErrors["button.url"]}>
                                        <Input
                                            id="c-button-url"
                                            value={buttonUrl}
                                            disabled={locked}
                                            placeholder="https://"
                                            onChange={(e) => editButton({ url: e.target.value }, typingBurst(e, "c-button-url"))}
                                        />
                                    </Field>
                                ) : (
                                    <p className="self-end text-xs text-muted-foreground">
                                        Imported customers who haven&apos;t signed in get their own link, with their email already filled in.
                                    </p>
                                )}
                            </div>
                        ) : null}
                        {/* A message written before blocks: an unsent one can become blocks. */}
                        {!locked ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
                                <span className="min-w-0 flex-1">This email is written as plain text. Blocks add headings, bold, links and two buttons.</span>
                                <Button type="button" variant="outline" size="sm" onClick={convertToBlocks} disabled={sending}>
                                    <Blocks className="mr-1 h-4 w-4" />
                                    Convert to blocks
                                </Button>
                            </div>
                        ) : null}
                    </>
                )}
                {/* A start for an empty email; slice 08's Start panel replaces it. */}
                {!locked && campaignWordsEmpty(words) ? (
                    <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={fillInvitation} disabled={sending}>
                        Use the sign-in invitation
                    </Button>
                ) : null}

                {saveError ? (
                    <p role="alert" className="text-sm text-destructive">
                        {saveError}
                    </p>
                ) : null}
            </CardContent>
        </Card>
    );

    return (
        <div ref={editorArea} className={cn("space-y-4", (sendBar || writeBar) && mobileStickyActionBarSpacerClassName)}>
            {/* The header bar: back, the name, the status, then the editor's actions. */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                    <Button variant="ghost" size="sm" className="shrink-0 px-2" asChild>
                        <Link href={to("/settings/campaigns")} aria-label="Email campaigns">
                            <ChevronLeft className="h-4 w-4" />
                            <span className="max-sm:sr-only">Email campaigns</span>
                        </Link>
                    </Button>
                    <h1 className="sr-only">{campaign ? campaign.name : "New campaign"}</h1>
                    <Input
                        id="c-name"
                        aria-label="Campaign name"
                        aria-describedby="c-name-hint"
                        aria-invalid={fieldErrors.name ? true : undefined}
                        value={name}
                        placeholder={CAMPAIGN_PLACEHOLDERS.name}
                        maxLength={CAMPAIGN_LIMITS.name}
                        onChange={(e) => edit({ name: e.target.value }, typingBurst(e, "c-name"))}
                        className="h-9 min-w-0 flex-1 border-transparent px-2 text-lg font-semibold shadow-none hover:border-input md:text-lg"
                    />
                    <span id="c-name-hint" className="sr-only">
                        {fieldErrors.name ?? "Customers never see this."}
                    </span>
                    {campaign ? (
                        <Badge variant={locked ? "default" : "outline"} className="shrink-0">
                            {locked ? "Sending started" : "Draft"}
                        </Badge>
                    ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {editable ? (
                        <>
                            <Button type="button" variant="ghost" size="icon" aria-label="Undo" title="Undo (⌘Z)" disabled={!history.canUndo} onClick={history.undo}>
                                <Undo2 className="h-4 w-4" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!history.canRedo} onClick={history.redo}>
                                <Redo2 className="h-4 w-4" />
                            </Button>
                        </>
                    ) : null}
                    <Tooltip open={clearTipOpen && Boolean(clearWhy)} onOpenChange={setClearTipOpen}>
                        <TooltipTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={clearAll}
                                aria-disabled={clearWhy ? true : undefined}
                                aria-describedby={clearWhy ? "c-clear-why" : undefined}
                                className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                            >
                                <Eraser className="mr-1 h-4 w-4" />
                                Clear all
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{clearWhy}</TooltipContent>
                    </Tooltip>
                    {clearWhy ? (
                        <span id="c-clear-why" className="sr-only">
                            {clearWhy}
                        </span>
                    ) : null}
                    {aiHere && content ? (
                        ai.configured ? (
                            <Suspense fallback={<AiButton disabledReason={titleBlocker}>Generate</AiButton>}>
                                <GeneratePopover
                                    open={generateOpen}
                                    onOpenChange={setGenerateOpen}
                                    title={draftTitle(subject, name)}
                                    blocker={aiRunScope?.scope === "text" || refine.working ? AI_BUSY : titleBlocker}
                                    hasBlocks={content.blocks.length > 0}
                                    working={aiRunScope?.scope === "email" ? aiStage : null}
                                    onStop={aiDraft.stop}
                                    onGenerate={(brief, mode) => {
                                        // A draft brings its own ideas: the last ones asked for go.
                                        refine.dismissIdeas("subject");
                                        refine.dismissIdeas("preheader");
                                        void aiDraft.start(brief, { scope: "email", mode });
                                    }}
                                />
                            </Suspense>
                        ) : (
                            <AiButton disabledReason={AI_WRITING_NO_CREDENTIALS}>Generate</AiButton>
                        )
                    ) : null}
                    {campaign ? (
                        <DropdownMenu>
                            {/* A plain button: the motion Button presses on Enter too, which would shut the menu it opens. */}
                            <DropdownMenuTrigger asChild>
                                <button type="button" className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="More: duplicate or archive" disabled={busy || sending}>
                                    <MoreHorizontal className="h-4 w-4" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => void duplicate()}>
                                    <Copy className="h-4 w-4" />
                                    Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => void archive()}>
                                    <Archive className="h-4 w-4" />
                                    Archive
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                    {saveButton("max-md:hidden")}
                    {campaign && !dirty ? <span className="text-xs text-muted-foreground max-md:hidden">Saved</span> : null}
                </div>
            </div>

            {locked ? (
                <div className="flex flex-wrap items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <p className="min-w-0 flex-1">
                        This campaign has started sending, so its email and audience are fixed: everyone gets the same
                        email. To send a changed one, duplicate it. Customers already sent this one won&apos;t get it again.
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => void duplicate()} disabled={busy || sending}>
                        <Copy className="mr-1 h-4 w-4" />
                        Duplicate to change it
                    </Button>
                </div>
            ) : null}

            {guard.recovered && editable ? (
                <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm" suppressHydrationWarning>
                    <span className="min-w-0 flex-1">Restore your unsaved changes from {formatAdminWeekdayTime(guard.recovered.at)}?</span>
                    <Button type="button" size="sm" onClick={restoreKept}>
                        Restore
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={guard.discard}>
                        Discard
                    </Button>
                </div>
            ) : null}

            <Tabs value={tab} onValueChange={(v) => setTab(v as "write" | "send")}>
                <TabsList>
                    <TabsTrigger value="write">Write</TabsTrigger>
                    <TabsTrigger value="send">Send</TabsTrigger>
                </TabsList>

                {/* Both tabs stay mounted: a wave keeps sending, and the email keeps its history, while the other is open. */}
                <TabsContent value="write" forceMount className="data-[state=inactive]:hidden">
                    <CampaignAiContext.Provider value={campaignAi}>
                        <BlockEditorRoot
                            blocks={content?.blocks ?? []}
                            catalogue={CAMPAIGN_BLOCKS}
                            onChange={setBlocks}
                            selected={selected}
                            onSelect={setSelected}
                            readOnly={!editable}
                            max={CONTENT_LIMITS.blocks}
                            newId={newBlockId}
                            variables={variables}
                            badges={badges}
                        >
                            <div className="mb-3 lg:hidden">
                                <PresetPicker
                                    label="Show"
                                    value={pane}
                                    options={[
                                        { value: "write", label: "Write" },
                                        { value: "preview", label: "Preview" },
                                    ]}
                                    onChange={setPane}
                                />
                            </div>
                            <div className={cn("grid gap-6", palette ? "lg:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)]" : "lg:grid-cols-2")}>
                                {palette ? (
                                    <aside className="max-lg:hidden" aria-label="Palette">
                                        <div className="sticky top-4">
                                            <BlockPalette tabs={asideTabs} tab={paletteTab} onTab={setPaletteTab} />
                                        </div>
                                    </aside>
                                ) : null}
                                <section className={cn("min-w-0", pane === "preview" && "max-lg:hidden")} aria-label="The email">
                                    {theEmail}
                                </section>
                                <section className={cn("min-w-0", pane === "write" && "max-lg:hidden")} aria-label="Preview">
                                    <div className="space-y-3 lg:sticky lg:top-4">
                                        {content ? (
                                            <PresetPicker
                                                label="Preview as"
                                                value={previewAs}
                                                options={(Object.keys(PREVIEW_AS_LABEL) as PreviewAs[]).map((v) => ({ value: v, label: PREVIEW_AS_LABEL[v] }))}
                                                onChange={setPreviewAs}
                                            />
                                        ) : null}
                                        <EmailPreview
                                            html={preview?.html ?? null}
                                            subject={preview?.subject ?? subject}
                                            from={preview?.from ?? null}
                                            error={previewError}
                                            device={device}
                                            onDevice={setDevice}
                                            scheme={scheme}
                                            onScheme={setScheme}
                                            selected={selected}
                                            onSelectBlock={(id) => {
                                                setSelected(id);
                                                setPane("write");
                                                document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)?.scrollIntoView?.({ block: "nearest" });
                                            }}
                                        />
                                    </div>
                                </section>
                            </div>
                            {/* Phones: the palette is a sheet, and a tap adds after the selected block. */}
                            <Sheet open={addOpen} onOpenChange={setAddOpen}>
                                <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
                                    <SheetHeader>
                                        <SheetTitle>Add a block</SheetTitle>
                                    </SheetHeader>
                                    <div className="px-4 pb-6">
                                        <BlockPalette tabs={sheetTabs} draggable={false} onAdded={() => setAddOpen(false)} />
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </BlockEditorRoot>
                    </CampaignAiContext.Provider>
                </TabsContent>

                <TabsContent value="send" forceMount data-own-undo className="space-y-6 data-[state=inactive]:hidden">
                    {campaign ? null : (
                        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            Save the draft first. Then you can test it, check what sending needs, and send it.
                        </p>
                    )}
                    {campaign ? (
                        <div className="grid gap-6 lg:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Send a test</CardTitle>
                                    <CardDescription>
                                        Sends this email to you, with &ldquo;[Test]&rdquo; before the subject. It isn&apos;t counted as sent to anyone.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <Field label="Send to" htmlFor="c-test" hint={`Up to ${MAX_TEST_RECIPIENTS} addresses, separated by commas.`}>
                                        <Input id="c-test" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                                    </Field>
                                    <Button variant="outline" onClick={sendTest} disabled={testing || sending}>
                                        {testing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                                        Send test
                                    </Button>
                                    {testResult ? (
                                        <p role="status" className={testResult.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>
                                            {testResult.text}
                                        </p>
                                    ) : null}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between gap-2">
                                        <CardTitle className="text-base">Ready to send?</CardTitle>
                                        <Button variant="ghost" size="sm" onClick={runChecks} disabled={checking}>
                                            {checking ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                                            Check again
                                        </Button>
                                    </div>
                                    <CardDescription>Nothing is sent, not even a test, until these pass.</CardDescription>
                                </CardHeader>
                                <CardContent>{checks ? <CheckList checks={checks} /> : <Loader2 className="h-4 w-4 animate-spin" />}</CardContent>
                            </Card>
                        </div>
                    ) : null}

                    {campaign ? (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-1.5">
                                    <CardTitle className="text-base">Send</CardTitle>
                                    <InfoTip label="About sending in waves">
                                        <p>
                                            Send to a small group first, wait two days, and look at the bounces and spam reports
                                            before sending to more. Resend&apos;s free plan sends 100 a day, tests included, so a
                                            bigger audience goes over several days: one wave a day, each no bigger than what is left.
                                        </p>
                                        <p>
                                            Keep this page open while a wave sends: it sends about two emails a second. If it
                                            stops, the next wave carries on with the people not yet sent to.
                                        </p>
                                    </InfoTip>
                                </div>
                                {stats ? (
                                    <CardDescription>
                                        Sent {n(stats.handed)}, bounced {n(stats.bounced)}, marked as spam {n(stats.complained)}, failed{" "}
                                        {n(stats.failed)}, sign-in link opened {n(stats.linkClicks)}
                                    </CardDescription>
                                ) : null}
                            </CardHeader>
                            <CardContent className="space-y-5">
                                <ol className="grid gap-3 sm:grid-cols-2" aria-label="Before you send">
                                    {sendSteps({ dirty: dirty && !locked, locked, lastTest, checks, allowance, resume }).map((step) => (
                                        <li key={step.key} className="flex items-start gap-2 text-sm">
                                            <StatusIcon ok={step.done} advisory={step.advisory} />
                                            <span className="min-w-0">
                                                <span className="block font-medium">{step.label}</span>
                                                <span className="block break-words text-xs text-muted-foreground">{step.detail}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ol>

                                {rampEnds && !sending ? (
                                    <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm" suppressHydrationWarning>
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                                        The first wave went out recently. Wait until {formatAdminWeekdayTime(rampEnds)} before the next one,
                                        and look at its bounces and spam reports first.
                                    </p>
                                ) : null}

                                <div className="flex flex-wrap items-end gap-4">
                                    <Field
                                        label="People in this wave"
                                        htmlFor="c-size"
                                        hint={room !== null ? (room > 0 ? `Up to ${n(Math.min(room, MAX_WAVE_SIZE))} now.` : "None can go now.") : undefined}
                                    >
                                        <Input
                                            id="c-size"
                                            type="number"
                                            min={1}
                                            max={maxSize}
                                            className="w-32"
                                            value={size}
                                            disabled={sending}
                                            onChange={(e) => {
                                                setSizeInput(Math.max(1, Math.min(maxSize, Math.floor(Number(e.target.value) || 1))));
                                                setPlan(null);
                                            }}
                                        />
                                    </Field>
                                    {stats && stats.failed > 0 ? (
                                        <label className="flex items-center gap-2 text-sm">
                                            <Checkbox checked={retryFailed} onCheckedChange={(v) => {
                                                    setRetryFailed(v === true);
                                                    setPlan(null);
                                                }} disabled={sending} />
                                            Retry the {n(stats.failed)} failed send{stats.failed === 1 ? "" : "s"} only
                                        </label>
                                    ) : null}
                                    {pauseFailing ? (
                                        <label className="flex items-center gap-2 text-sm">
                                            <Checkbox checked={resume} onCheckedChange={(v) => {
                                                    setResume(v === true);
                                                    setPlan(null);
                                                }} disabled={sending} />
                                            I&apos;ve looked into the bounces or spam reports: send anyway
                                        </label>
                                    ) : null}
                                    <Button variant="outline" onClick={checkAudience} disabled={planning || sending || (dirty && !locked)}>
                                        {planning && !plan ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                                        Check who it goes to
                                    </Button>
                                </div>

                                {planError ? (
                                    <p role="alert" className="text-sm text-destructive">
                                        {planError}
                                    </p>
                                ) : null}

                                {plan ? (
                                    <div className="space-y-3 rounded-lg border p-4 text-sm">
                                        <p>
                                            <span className="font-medium">{n(plan.plan.eligible)}</span> of {n(plan.plan.considered)} customers in this
                                            audience can get it ({n(plan.plan.eligibleBuyers)} have ordered before; they go first).
                                            {plan.plan.alreadySent ? ` ${n(plan.plan.alreadySent)} already have it.` : ""}
                                        </p>
                                        {Object.keys(plan.plan.excluded).length ? (
                                            <ul className="list-inside list-disc text-muted-foreground">
                                                {Object.entries(plan.plan.excluded).map(([why, count]) => (
                                                    <li key={why}>
                                                        {n(count ?? 0)} left out: {CAMPAIGN_BLOCKER_TEXT[why as keyof typeof CAMPAIGN_BLOCKER_TEXT] ?? why}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : null}
                                        {plan.plan.eligible > 0 ? (
                                            <p className="font-medium">
                                                {waitingSummary({
                                                    selected: planned,
                                                    waiting: plan.waiting,
                                                    limitedBy: plan.limitedBy,
                                                    dailyLimit: plan.readiness.allowance?.limits.daily ?? null,
                                                })}
                                            </p>
                                        ) : null}
                                        <Button onClick={() => setConfirmOpen(true)} disabled={planning || sending || !ready || planned === 0}>
                                            {planning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                                            {sendButtonLabel(planned)}
                                        </Button>
                                        {!ready ? <p className="text-xs text-destructive">A step above is not done, so it can&apos;t send yet.</p> : null}
                                    </div>
                                ) : null}

                                {progress ? (
                                    <div className="space-y-2 rounded-lg border p-4 text-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium">
                                                Wave {progress.wave}: {progress.running ? "sending" : progress.stopped ? "stopped" : "finished"}
                                            </span>
                                            {progress.running ? (
                                                <Button variant="outline" size="sm" onClick={() => (stopRef.current = true)}>
                                                    Stop
                                                </Button>
                                            ) : null}
                                        </div>
                                        <Progress
                                            aria-label={`Wave ${progress.wave}`}
                                            value={progress.total ? ((progress.sent + progress.failed + progress.skipped) / progress.total) * 100 : 100}
                                        />
                                        {/* Updated once a batch (about every ten seconds), not once an email. */}
                                        <p role="status" aria-live="polite">
                                            Sent {n(progress.sent)} of {n(progress.total)}, failed {n(progress.failed)}, skipped {n(progress.skipped)}
                                        </p>
                                        {progress.running ? (
                                            <p className="text-xs text-muted-foreground">Keep this page open until it finishes.</p>
                                        ) : null}
                                        {progress.stopped && !progress.stoppedByStaff ? <p className="text-destructive">Stopped: {progress.stopped}</p> : null}
                                        {progress.errors.length ? (
                                            <ul className="list-inside list-disc text-xs text-muted-foreground">
                                                {progress.errors.map((e, i) => (
                                                    <li key={i} className="break-words">
                                                        {e}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : null}
                                        {!progress.running ? (
                                            <p className="rounded-md bg-muted/50 p-2">
                                                <span className="font-medium">Next: </span>
                                                {nextStepAfterWave({
                                                    sent: progress.sent,
                                                    failed: stats?.failed ?? progress.failed,
                                                    stoppedByStaff: progress.stoppedByStaff,
                                                    waiting: progress.waiting,
                                                    allowance,
                                                    rampUntil: rampEnds,
                                                })}
                                            </p>
                                        ) : null}
                                    </div>
                                ) : null}

                                <WaveTable waves={waves} />
                            </CardContent>
                        </Card>
                    ) : null}
                </TabsContent>
            </Tabs>

            <SendConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} details={confirmation} onConfirm={startWave} />

            {sendBar ? (
                <MobileStickyActionBar>
                    {sending ? (
                        <Button variant="outline" className="w-full" onClick={() => (stopRef.current = true)}>
                            Stop the wave
                        </Button>
                    ) : (
                        <Button className="w-full" onClick={() => setConfirmOpen(true)} disabled={planning || !ready}>
                            <Send className="mr-1 h-4 w-4" />
                            {sendButtonLabel(planned)}
                        </Button>
                    )}
                </MobileStickyActionBar>
            ) : writeBar ? (
                <MobileStickyActionBar className="flex items-center gap-3">
                    {campaign && !dirty ? <span className="text-xs text-muted-foreground">Saved</span> : null}
                    {saveButton("flex-1")}
                </MobileStickyActionBar>
            ) : null}
        </div>
    );
}
