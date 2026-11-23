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
    X,
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
import type { PaletteItem, PaletteItemsTab, PaletteTab } from "@/components/block-editor/types";
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
import { errorsAfterBlockEdit } from "@/lib/email-campaigns/block-errors";
import {
    campaignWordsOf,
    clearAllBlocker,
    clearCampaignWords,
    CLEAR_ALL_BLOCKER_TEXT,
    CLEAR_ALL_UNDO_MS,
    type CampaignButtonChoice,
    type CampaignWords,
} from "@/lib/email-campaigns/clear-all";
import {
    blockLinkList,
    CHINESE,
    CHINESE_EDITOR_TEXT,
    CHINESE_STATUS_TEXT,
    chineseAiDrafted,
    chineseBlock,
    chineseBlockStatus,
    chineseFieldErrors,
    chineseGaps,
    chineseLinesStatus,
    chineseVersionOf,
    hasChineseErrors,
    keepChineseBlock,
    keepChineseLines,
    withChineseBlocks,
    withChineseLines,
    withoutChineseVersion,
    withoutGoneChinese,
} from "@/lib/email-campaigns/chinese-version";
import { CONTENT_LIMITS, contentFromLegacy, contentWords, EMPTY_CAMPAIGN_CONTENT, newBlockId, type CampaignContent, type EmailBlock } from "@/lib/email-campaigns/content";
import {
    CAMPAIGN_AUDIENCE_LABEL,
    CAMPAIGN_AUDIENCES,
    CAMPAIGN_BLOCKER_TEXT,
    CAMPAIGN_LIMITS,
    CAMPAIGN_PLACEHOLDERS,
    MAX_EXCLUDED_SEGMENTS,
    MAX_TEST_RECIPIENTS,
    MAX_WAVE_SIZE,
    variablesInEmail,
    type Campaign,
    type CampaignAudience,
    type CampaignDraft,
    type CampaignDraftInput,
} from "@/lib/email-campaigns/rules";
import { UNENGAGED_WHO } from "@/lib/crm/engagement";
import { emailSaysNothing, STARTERS, startedFrom, starterAudience, wantedAfterStarter, type Starter } from "@/lib/email-campaigns/starters";
import { wantedKey, wantedToCreate, type FoundSegments, type WantedSegment } from "@/lib/email-campaigns/wanted-segment";
import type { SlotBefore } from "@/lib/email-funnel/move";
import { moveFunnelEmail } from "./funnel/arrange-actions";
import { segmentHref, type CustomerSegment } from "@/lib/crm/segment-rules";
import { PREVIEW_AS_LABEL, withSampleValues, type PreviewAs } from "@/lib/email-campaigns/variables";
import type { CampaignStats } from "@/lib/email-campaigns/store";
import type { CampaignResults } from "@/lib/email-campaigns/results";
import type { CampaignReadiness } from "@/lib/email-campaigns/sender";
import { defaultWaveSize, fitSummary, isEmailCheck, languageSummary, nextStepAfterWave, rampUntil, sendSteps, waitingSummary } from "@/lib/email-campaigns/send-flow";
import type { CampaignWaveStats } from "@/lib/customer-migration/campaign-ledger";
import { formatAdminDateMY, formatAdminWeekdayTime } from "@/lib/format/admin-date";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import {
    archiveCampaignAction,
    checkCampaignReadiness,
    duplicateCampaign,
    findWantedSegmentAction,
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
import { ChineseEditingContext, type ChineseEditing } from "./chinese/chinese-context";
import { LanguageBar } from "./chinese/language-bar";
import { useAiTranslate } from "./chinese/use-ai-translate";
import { VariableFallbacks } from "./blocks/fallbacks";
import { campaignVariables } from "./blocks/runs";
import { CampaignVariablesTab } from "./blocks/variables";
import { EmailPreview, type PreviewDevice, type PreviewScheme } from "./email-preview";
import { Field } from "./field";
import { draftOf, keptDraft, keptDraftKey, keptOf, type EditorDraft, type KeptDraft } from "./kept-draft";
import { SendConfirmDialog, sendButtonLabel, type SendConfirmation } from "./send-confirm-dialog";
import { CheckList, StatusIcon } from "./send-parts";
import { StarterThumbnail } from "./starter-thumbnail";
import { WaveTable } from "./wave-table";
import { KeepSendingCard } from "./keep-sending-card";
import { CampaignResultsPanel } from "./results-panel";
import { keepSendingBlocker } from "@/lib/email-campaigns/keep-sending";

export type SegmentOption = { id: string; name: string; customersHref?: string | null };

async function slotInFront(id: string, slot: SlotBefore): Promise<void> {
    const res = await moveFunnelEmail({ campaignId: id, stage: slot.stage, after: slot.after, before: slot.before.id }).catch(
        (err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : "It could not be moved.", moved: [] }),
    );
    if (res.ok) toast(`“${slot.before.name}” now follows this email.`);
    else toast.error(`Saved. “${slot.before.name}” did not move after it: ${res.error}`, { duration: 12_000 });
}

const NOTHING_FOUND: FoundSegments = {};

const CLEAR_ALL_TOAST = "campaign-clear-all";

const PALETTE = [blockPaletteTab(CAMPAIGN_BLOCKS)];

const StartPanel = lazy(() => import("./start-panel").then((m) => ({ default: m.StartPanel })));

const START_PANEL_LOADING = (
    <div aria-busy="true" className="space-y-4 text-left">
        <p className="text-sm font-medium text-foreground">Start the email</p>
        <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
                <div key={i} className="aspect-[3/4] animate-pulse rounded-md border bg-muted/50" />
            ))}
        </div>
    </div>
);

const NO_VARIABLES: readonly RichTextVariable[] = [];

const PREVIEW_AFTER_MS = 400;

const SUBJECT_PHONE = 60;
const PREVIEW_LINE_RANGE = [40, 90] as const;

const AI_OFF: AiWritingAvailability = { on: false, configured: false };

const AI_BUSY = "Claude is writing. Wait for it, or press Stop.";

const editorAi = () => import("./ai/editor-ai");
const GeneratePopover = lazy(() => editorAi().then((m) => ({ default: m.GeneratePopover })));
const DraftBar = lazy(() => editorAi().then((m) => ({ default: m.DraftBar })));
const DraftIdeas = lazy(() => editorAi().then((m) => ({ default: m.DraftIdeas })));
const IdeasPanel = lazy(() => editorAi().then((m) => ({ default: m.IdeasPanel })));

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
    stoppedByStaff: boolean;
    waiting: number;
    errors: string[];
};

const UNREAD_READINESS = (detail: string): CampaignReadiness => ({
    checks: [{ key: "transport", ok: false, detail }],
    advice: [],
    ready: false,
    allowance: null,
    sender: { from: null, replyTo: null },
});

function CharCount({ value, warn, ok, id }: { value: string; warn: string | null; ok?: string; id: string }) {
    return (
        <p id={id} className={cn("text-xs", warn ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")} aria-live="polite">
            {n(value.length)} characters{warn ? `: ${warn}` : ok ? `. ${ok}` : ""}
        </p>
    );
}

export function CampaignEditor({
    campaign,
    draft: initial,
    stats,
    waves = [],
    segments: givenSegments,
    staffEmail,
    pointsLive = false,
    ai = AI_OFF,
    keptToday = 0,
    results = null,
    initialTab,
    found: givenFound = NOTHING_FOUND,
    wanted: initialWanted = null,
    audienceNote: initialNote = null,
    segmentsUnread = false,
    canCreateSegments = false,
    slotBefore = null,
}: {
    campaign: Campaign | null;
    draft: CampaignDraft;
    stats: CampaignStats | null;
    waves?: CampaignWaveStats[];
    segments: SegmentOption[];
    staffEmail: string;
    pointsLive?: boolean;
    ai?: AiWritingAvailability;
    keptToday?: number;
    results?: CampaignResults | null;
    initialTab?: "results";
    found?: FoundSegments;
    wanted?: WantedSegment | null;
    audienceNote?: string | null;
    segmentsUnread?: boolean;
    canCreateSegments?: boolean;
    slotBefore?: SlotBefore | null;
}) {
    const router = useRouter();
    const locale = getLocaleFromPathname(usePathname() ?? "") ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const locked = Boolean(campaign?.lockedAt);
    const [madeSegments, setMadeSegments] = useState<SegmentOption[]>([]);
    const segments = useMemo(() => [...givenSegments, ...madeSegments.filter((m) => !givenSegments.some((g) => g.id === m.id))], [givenSegments, madeSegments]);
    const [madeFound, setMadeFound] = useState<Record<string, string>>({});
    const found = useMemo(() => ({ ...givenFound, ...madeFound }), [givenFound, madeFound]);
    const history = useEditorHistory<EditorDraft>(() => ({
        wanted: initialWanted,
        audienceNote: initialNote,
        ...campaignWordsOf(initial),
        greeting: initial.greeting,
        audience: initial.audience,
        segmentId: initial.segmentId ?? "",
        excludeSegmentIds: initial.excludeSegmentIds ?? [],
        includeUnengaged: initial.includeUnengaged ?? false,
    }));
    const draft = history.value;
    const { name, subject, preheader, body, content, greeting, audience, segmentId, excludeSegmentIds, includeUnengaged } = draft;
    const wanted = draft.wanted ?? null;
    const audienceNote = draft.audienceNote ?? null;
    const { choice: buttonChoice, label: buttonLabel, url: buttonUrl } = draft.button;
    const edit = (patch: Partial<EditorDraft>, burst?: string) => history.set((e) => ({ ...e, ...patch }), { burst });
    const editButton = (patch: Partial<CampaignWords["button"]>, burst?: string) =>
        history.set((e) => ({ ...e, button: { ...e.button, ...patch } }), { burst });
    const editContent = (next: CampaignContent, burst?: string) => history.set((e) => ({ ...e, content: next }), { burst });
    const setBlocks = (blocks: EmailBlock[], burst?: string) => {
        setFieldErrors((errors) => errorsAfterBlockEdit(errors, content?.blocks ?? [], blocks));
        history.set((e) => (e.content ? { ...e, content: withoutGoneChinese(withEditedBlocks(e.content, blocks)) } : e), { burst });
    };
    const setChineseBlocks = (blocks: EmailBlock[], burst?: string) =>
        history.set((e) => (e.content ? { ...e, content: withChineseBlocks(e.content, blocks) } : e), { burst });
    const editChinese = (edit: (c: CampaignContent) => CampaignContent, burst?: string) => history.set((e) => (e.content ? { ...e, content: edit(e.content) } : e), { burst });

    const byHand = { wanted: null, audienceNote: null };
    const setAudience = (v: CampaignAudience) => edit({ audience: v, ...byHand });
    const setSegmentId = (v: string) => edit({ segmentId: v, excludeSegmentIds: excludeSegmentIds.filter((x) => x !== v), ...byHand });
    const leaveOut = (v: string) => edit({ excludeSegmentIds: [...excludeSegmentIds, v].slice(0, MAX_EXCLUDED_SEGMENTS) });
    const keepIn = (v: string) => edit({ excludeSegmentIds: excludeSegmentIds.filter((x) => x !== v) });
    const segmentName = (id: string) => segments.find((s) => s.id === id)?.name ?? "(archived Segment)";
    const leaveOutChoices = segments.filter(
        (s) => !excludeSegmentIds.includes(s.id) && !(audience === "segment" && s.id === segmentId),
    );
    const chosenSegmentHref = segments.find((s) => s.id === segmentId)?.customersHref ?? null;
    const words: CampaignWords = useMemo(
        () => ({ name, subject, preheader, body, button: draft.button, content }),
        [name, subject, preheader, body, draft.button, content],
    );

    const input: CampaignDraftInput = useMemo(
        () => ({
            name,
            subject,
            preheader,
            body: content ? "" : body,
            content,
            greeting,
            audience,
            segmentId: audience === "segment" ? segmentId || null : null,
            excludeSegmentIds,
            includeUnengaged,
            button:
                content || buttonChoice === "none"
                    ? null
                    : { target: buttonChoice, label: buttonLabel, url: buttonChoice === "url" ? buttonUrl : null },
        }),
        [name, subject, preheader, body, content, greeting, audience, segmentId, excludeSegmentIds, includeUnengaged, buttonChoice, buttonLabel, buttonUrl],
    );
    const inputKey = JSON.stringify(input);
    const [savedKey, setSavedKey] = useState(inputKey);
    const changed = inputKey !== savedKey;
    const dirty = changed || !campaign;

    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [saves, setSaves] = useState(0);
    const [savedContent, setSavedContent] = useState<CampaignContent | null>(campaign?.content ?? null);
    const [paletteTab, setPaletteTab] = useState("blocks");
    const [emailLanguage, setEmailLanguage] = useState<Locale>(DEFAULT_LOCALE);
    const version = chineseVersionOf(content);
    const inChinese = Boolean(content) && emailLanguage === CHINESE;

    const undoRef = useRef<{ words: CampaignWords; wanted?: WantedSegment | null; step: number | null } | null>(null);
    const latest = useRef(history);
    useEffect(() => {
        latest.current = history;
        if (undoRef.current && undoRef.current.step === null) undoRef.current.step = history.step;
    });
    useEffect(() => () => void toast.dismiss(CLEAR_ALL_TOAST), []);

    const createdId = useRef<string | null>(null);
    const save = useCallback(async (): Promise<string | null> => {
        setSaving(true);
        setSaveError(null);
        try {
            const res = await saveCampaign(campaign?.id ?? createdId.current, input);
            if (!res.ok) {
                setSaveError(res.error);
                setFieldErrors(res.fieldErrors ?? {});
                if (Object.keys(res.fieldErrors ?? {}).some((k) => k.startsWith("content.fallbacks."))) setPaletteTab("variables");
                if (hasChineseErrors(res.fieldErrors ?? {})) setEmailLanguage(CHINESE);
                return null;
            }
            setFieldErrors({});
            setSavedKey(JSON.stringify(input));
            setSavedContent(input.content ?? null);
            setSaves((s) => s + 1);
            undoRef.current = null;
            toast.dismiss(CLEAR_ALL_TOAST);
            if (!campaign) {
                const first = createdId.current === null;
                createdId.current = res.id;
                if (first && slotBefore) await slotInFront(res.id, slotBefore);
                router.replace(withLocale(`/settings/campaigns/${res.id}`, locale));
            } else router.refresh();
            return res.id;
        } finally {
            setSaving(false);
        }
    }, [campaign, input, locale, router, slotBefore]);

    const [tab, setTab] = useState<"write" | "send" | "results">(initialTab === "results" && locked ? "results" : "write");
    const [selected, setSelected] = useState<string | null>(null);
    const [pane, setPane] = useState<"write" | "preview">("write");
    const [addOpen, setAddOpen] = useState(false);
    const editorArea = useRef<HTMLDivElement>(null);
    const goToBlock = (id: string, language: Locale = DEFAULT_LOCALE) => {
        setTab("write");
        setPane("write");
        setEmailLanguage(language);
        setSelected(id);
        requestAnimationFrame(() => {
            const card = editorArea.current?.querySelector<HTMLElement>(`li[data-block-id="${id}"]`);
            card?.scrollIntoView?.({ block: "center" });
            card?.focus({ preventScroll: true });
        });
    };

    const variables = useMemo(() => campaignVariables({ pointsLive }), [pointsLive]);
    const lineVariables = content ? variables : NO_VARIABLES;
    const subjectShown = inChinese ? (version?.subject ?? "") : subject;
    const preheaderShown = inChinese ? (version?.preheader ?? "") : preheader;
    const subjectValue = useMemo(() => richTextFromWords(subjectShown, lineVariables), [subjectShown, lineVariables]);
    const preheaderValue = useMemo(() => richTextFromWords(preheaderShown, lineVariables), [preheaderShown, lineVariables]);
    const editLine = (field: "subject" | "preheader", words: string, burst?: string) =>
        inChinese ? editChinese((c) => withChineseLines(c, { [field]: words }, { subject, preheader }), burst && `${burst}-zh`) : edit({ [field]: words }, burst);
    const usedVariables = useMemo(() => variablesInEmail({ subject, preheader, content, greeting }), [subject, preheader, content, greeting]);

    const [device, setDevice] = useState<PreviewDevice>("desktop");
    const [scheme, setScheme] = useState<PreviewScheme>("light");
    const [previewAs, setPreviewAs] = useState<PreviewAs>("customer");
    const [preview, setPreview] = useState<{ subject: string; html: string; from: string | null } | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    useEffect(() => {
        let live = true;
        const timer = setTimeout(async () => {
            const res = await previewCampaign(input, { forceDark: scheme === "dark", previewAs, ...(inChinese ? { language: CHINESE } : {}) }).catch((e: unknown) => ({
                ok: false as const,
                error: String(e),
            }));
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
    }, [input, scheme, previewAs, inChinese]);

    const campaignId = campaign?.id;
    const [readiness, setReadiness] = useState<CampaignReadiness | null>(null);
    const checks = readiness?.checks ?? null;
    const allowance = readiness?.allowance ?? null;
    const [checking, setChecking] = useState(false);
    const readChecks = useCallback(
        (fresh = false) => checkCampaignReadiness(campaignId, { fresh }).catch((e: unknown) => UNREAD_READINESS(String(e))),
        [campaignId],
    );
    const runChecks = async () => {
        setChecking(true);
        setReadiness(await readChecks(true));
        setChecking(false);
    };
    useEffect(() => {
        if (!campaignId) return;
        let live = true;
        void readChecks().then((r) => live && setReadiness(r));
        return () => {
            live = false;
        };
    }, [campaignId, readChecks, saves]);
    const pauseFailing = checks?.some((c) => c.key === "pause" && !c.ok) ?? false;
    const [plan, setPlan] = useState<Extract<WaveAnswer, { ok: true }> | null>(null);
    const advice = useMemo(() => [...(readiness?.advice ?? []), ...(plan?.fit ?? [])], [readiness, plan]);

    const blockWarnings = useMemo(() => {
        const out: Record<string, string[]> = {};
        if (!readiness || !content) return out;
        const language = inChinese ? CHINESE : DEFAULT_LOCALE;
        const asSaved = (c: CampaignContent | null) =>
            new Map((c?.blocks ?? []).map((b) => [b.id, JSON.stringify(inChinese ? [b, chineseVersionOf(c)?.blocks[b.id] ?? null] : b)]));
        const saved = asSaved(savedContent);
        const now = asSaved(content);
        const marked = new Set(inChinese ? chineseAiDrafted(content) : (content.aiDrafted ?? []));
        for (const c of [...readiness.checks.filter(isEmailCheck).filter((c) => !c.ok && c.key !== "chinese"), ...advice]) {
            for (const i of c.issues) {
                if ((i.language ?? DEFAULT_LOCALE) !== language || (c.key === "ai_drafted" && !marked.has(i.blockId ?? ""))) continue;
                if (i.blockId && saved.has(i.blockId) && saved.get(i.blockId) === now.get(i.blockId)) (out[i.blockId] ??= []).push(i.what);
            }
        }
        return out;
    }, [readiness, advice, content, savedContent, inChinese]);

    const [testTo, setTestTo] = useState(staffEmail);
    const [testLanguage, setTestLanguage] = useState<Locale>(DEFAULT_LOCALE);
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
            const res = await sendCampaignTestAction(campaign.id, addresses, ...(version && testLanguage === CHINESE ? [{ language: CHINESE }] : []));
            if (!res.ok) setTestResult({ ok: false, text: res.error });
            else if (res.failed.length) setTestResult({ ok: false, text: `Sent ${res.sent}. Couldn't send to ${res.failed.map((f) => `${f.to} (${f.error})`).join(", ")}.` });
            else setTestResult({ ok: true, text: `Test sent to ${res.sent} address${res.sent === 1 ? "" : "es"}. Check the inbox, and the spam folder.` });
            if (res.ok && res.sent > 0) {
                setLastTest({ sent: res.sent, at: new Date().toISOString() });
                void readChecks().then(setReadiness);
            }
        } finally {
            setTesting(false);
        }
    };

    const firstWave = !campaign?.lockedAt;
    const [sizeInput, setSizeInput] = useState<number | null>(null);
    const room = allowance?.remaining ?? null;
    const maxSize = room && room > 0 ? Math.min(MAX_WAVE_SIZE, room) : MAX_WAVE_SIZE;
    const size = Math.min(sizeInput ?? defaultWaveSize(allowance, firstWave, MAX_WAVE_SIZE), maxSize);
    const [retryFailed, setRetryFailed] = useState(false);
    const [resume, setResume] = useState(false);
    const [planError, setPlanError] = useState<string | null>(null);
    const [planning, setPlanning] = useState(false);
    const [progress, setProgress] = useState<WaveProgress | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const stopRef = useRef(false);
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

    const planned = plan ? plan.plan.eligible - plan.waiting : 0;
    const languageLine = plan && !plan.fit.some((c) => c.key === "fit_chinese")
        ? languageSummary({
              eligible: plan.plan.eligible,
              eligibleChinese: plan.plan.eligibleChinese,
              selected: planned,
              selectedChinese: plan.plan.selectedChinese,
              hasChinese: Boolean(chineseVersionOf(campaign?.content)),
          })
        : null;
    const audienceWords =
        CAMPAIGN_AUDIENCE_LABEL[audience] +
        (audience === "segment" ? `: ${segments.find((x) => x.id === segmentId)?.name ?? "a segment"}` : "") +
        (excludeSegmentIds.length ? `, leaving out ${excludeSegmentIds.map((x) => `“${segmentName(x)}”`).join(", ")}` : "") +
        (includeUnengaged ? ", the Unengaged included" : "");
    const confirmation: SendConfirmation | null = plan
        ? {
              count: planned,
              wave: plan.wave,
              subject,
              from: plan.readiness.sender.from,
              replyTo: plan.readiness.sender.replyTo,
              audience: audienceWords,
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

    const [busy, setBusy] = useState(false);
    const archive = async () => {
        if (!campaign || !window.confirm(`Archive "${campaign.name}"? It leaves the list; what was sent stays recorded.`)) return;
        setBusy(true);
        const res = await archiveCampaignAction(campaign.id);
        setBusy(false);
        if (res.ok) router.push(to("/settings/campaigns"));
        else setSaveError(res.error);
    };
    const copyOf = async (id: string) => {
        if (!guard.confirmLeave()) return;
        setBusy(true);
        const res = await duplicateCampaign(id);
        setBusy(false);
        if (res.ok) router.push(to(`/settings/campaigns/${res.id}`));
        else setSaveError(res.error);
    };
    const duplicate = () => (campaign ? copyOf(campaign.id) : undefined);

    const sending = progress?.running ?? false;
    const ready = checks?.every((c) => c.ok || (c.key === "pause" && resume)) ?? false;
    const editable = !locked && !sending;

    const aiDraft = useAiDraft({ history, campaignId: campaign?.id ?? null });
    const refine = useAiRefine({ history, campaignId: campaign?.id ?? null });
    const translate = useAiTranslate({ history, campaignId: campaign?.id ?? null, onTranslated: () => setEmailLanguage(CHINESE) });
    const aiBusy = aiDraft.working || refine.working !== null || translate.working !== null;
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
                          : aiDraft.working || translate.working || (refine.working && !(refine.working === "rewrite" && refine.offer?.blockId === id))
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

    const chineseBlocks = useMemo(() => (content && inChinese ? content.blocks.map((b) => chineseBlock(b, version?.blocks[b.id])) : []), [content, inChinese, version]);
    const chineseStatus = useMemo(() => new Map((content?.blocks ?? []).map((b) => [b.id, chineseBlockStatus(b, version)] as const)), [content, version]);
    const chineseDrafted = useMemo(() => new Set(chineseAiDrafted(content)), [content]);
    const chineseBadges = useMemo(
        () =>
            Object.fromEntries(
                [...chineseStatus].flatMap(([id, status]) =>
                    status && status !== "current" ? [[id, CHINESE_STATUS_TEXT[status]]] : status && chineseDrafted.has(id) ? [[id, DRAFTED_WITH_AI]] : [],
                ),
            ),
        [chineseStatus, chineseDrafted],
    );
    const linesStatus = chineseLinesStatus(version, subject, preheader);
    const translateWorking = translate.working ? CHINESE_EDITOR_TEXT.translating : null;
    const translateReason = !ai.configured ? AI_WRITING_NO_CREDENTIALS : aiBusy ? AI_BUSY : null;
    const chineseEditing: ChineseEditing | null =
        inChinese && content
            ? {
                  status: (id) => chineseStatus.get(id) ?? null,
                  drafted: (id) => chineseDrafted.has(id),
                  links: (id) => {
                      const b = content.blocks.find((x) => x.id === id);
                      return b ? blockLinkList(b) : [];
                  },
                  translate: aiHere ? (id) => translate.start({ kind: "block", id }) : null,
                  reason: translateReason,
                  working: translate.working?.kind === "block" ? { id: translate.working.id, stage: CHINESE_EDITOR_TEXT.translating } : null,
                  stop: translate.stop,
                  keep: (id) => editChinese((c) => keepChineseBlock(c, id)),
              }
            : null;
    const chineseFallbacks = version
        ? { fallbacks: version.fallbacks, onChange: (fallbacks: typeof version.fallbacks, burst?: string) => editChinese((c) => withChineseLines(c, { fallbacks }), burst) }
        : null;
    const chineseChanged = content && version ? chineseGaps(content).length + (linesStatus === "current" ? 0 : 1) : 0;
    const translateBlockerText = content && !subject.trim() && !emailWords.some((w) => w.trim()) ? CHINESE_EDITOR_TEXT.needsWords : null;
    const removeChinese = () => {
        editChinese(withoutChineseVersion);
        setEmailLanguage(DEFAULT_LOCALE);
        toast(CHINESE_EDITOR_TEXT.removed);
    };
    const chineseErrors = useMemo(() => (inChinese && content ? chineseFieldErrors(fieldErrors, content) : {}), [inChinese, content, fieldErrors]);
    const lineError = (field: "subject" | "preheader") => (inChinese ? chineseErrors[field] : fieldErrors[field]);

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

    const [startPutAway, setStartPutAway] = useState(false);
    const offerStart = editable && !startPutAway && emailSaysNothing(words);
    const wantedAfter = (s: Starter, e: EditorDraft): Pick<EditorDraft, "wanted" | "audienceNote"> => ({
        wanted: wantedAfterStarter(s, e.wanted ?? null),
        ...(s.audience ? { audienceNote: null } : {}),
    });
    const sayAudience = (s: Starter) => {
        const goesTo = starterAudience(s, found);
        const now = latest.current.value;
        if (!goesTo.audience || (goesTo.audience === now.audience && (goesTo.segmentId === undefined || goesTo.segmentId === now.segmentId))) return;
        toast(`Send to is now “${CAMPAIGN_AUDIENCE_LABEL[goesTo.audience]}”: ${s.label} is written for them.`);
    };
    const starterItems = STARTERS.map(
        (s): PaletteItem<EmailBlock> => ({
            id: s.id,
            label: s.label,
            description: s.description,
            blocks: () => s.blocks(),
            preview: <StarterThumbnail id={s.id} shape="landscape" className="max-h-36" />,
            apply: (next) => {
                sayAudience(s);
                history.set((e) => ({ ...e, content: { ...(e.content ?? EMPTY_CAMPAIGN_CONTENT), blocks: next }, ...starterAudience(s, found), ...wantedAfter(s, e) }));
            },
        }),
    );
    const startItems = STARTERS.map(
        (s, i): PaletteItem<EmailBlock> => ({
            ...starterItems[i],
            apply: (next) => {
                sayAudience(s);
                history.set((e) => ({ ...startedFrom(e, s, next, found), ...wantedAfter(s, e) }));
            },
        }),
    );
    const startersTab: PaletteItemsTab<EmailBlock> = { value: "starters", label: "Starters", items: starterItems };

    const segmentMissing = !locked && wanted && audience === "segment" && !segmentId && !found[wantedKey(wanted)] ? wanted : null;
    const creatingSegment = useRef(false);
    const [segmentBusy, setSegmentBusy] = useState(false);
    const [segmentFailure, setSegmentFailure] = useState<{ for: WantedSegment; error: string } | null>(null);
    const segmentError = segmentMissing && segmentFailure?.for === segmentMissing ? segmentFailure.error : null;
    const chooseWanted = (w: WantedSegment, row: SegmentOption) => {
        setMadeSegments((made) => [...made, row]);
        setMadeFound((f) => ({ ...f, [wantedKey(w)]: row.id }));
        history.set((e) => ({ ...e, audience: "segment", segmentId: row.id, excludeSegmentIds: e.excludeSegmentIds.filter((x) => x !== row.id) }));
    };
    const createWantedSegment = async () => {
        const w = segmentMissing;
        if (!w || creatingSegment.current) return;
        creatingSegment.current = true;
        setSegmentBusy(true);
        setSegmentFailure(null);
        const setSegmentError = (error: string) => setSegmentFailure({ for: w, error });
        try {
            const res = await fetch("/api/settings/customers/segments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(wantedToCreate(w)),
            });
            const json = (await res.json().catch(() => null)) as { row?: CustomerSegment; error?: string } | null;
            const row = res.ok ? json?.row : undefined;
            if (row) {
                chooseWanted(w, { id: row.id, name: row.name, customersHref: segmentHref(to("/settings/customers"), row.params) });
                toast(`Created the Segment “${row.name}” and chose it.`);
                return;
            }
            if (res.status !== 409) {
                setSegmentError(json?.error ?? "Could not create the Segment. Try again.");
                return;
            }
            const again = await findWantedSegmentAction(w.address);
            if (!again.ok) {
                setSegmentError(`${json?.error ?? "That name is taken."} The Segments could not be read again: reload the page to try again.`);
            } else if (again.segment) {
                const { id, name } = again.segment;
                chooseWanted(w, segments.find((x) => x.id === id) ?? { id, name });
                toast(`The Segment “${name}” has these filters already, so it was chosen.`);
            } else {
                setSegmentError(
                    `${json?.error ?? "That name is taken."} It has other filters, so it was left as it is: rename it on Customers, or choose a Segment above.`,
                );
            }
        } catch {
            setSegmentError("Could not create the Segment. Check your connection and try again.");
        } finally {
            creatingSegment.current = false;
            setSegmentBusy(false);
        }
    };

    const clearBlocker = clearAllBlocker({ locked, sending, words });
    const clearWhy = clearBlocker ? CLEAR_ALL_BLOCKER_TEXT[clearBlocker] : null;
    const [clearTipOpen, setClearTipOpen] = useState(false);
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
                    else h.set((e) => ({ ...e, ...u.words, ...(u.wanted !== undefined ? { wanted: u.wanted } : {}) }));
                },
            },
        });
    const clearAll = () => {
        if (clearBlocker) return;
        const { words: cleared, snapshot } = clearCampaignWords(words);
        undoRef.current = { words: snapshot, wanted, step: null };
        history.set((e) => ({ ...e, ...cleared, wanted: e.wanted?.playbook ? null : e.wanted }));
        setSelected(null);
        setStartPutAway(false);
        undoToast("Cleared the email.");
    };
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

    const subjectRead = content ? withSampleValues(subjectShown) : subject;
    const preheaderRead = content ? withSampleValues(preheaderShown) : preheader;
    const subjectWarn = subjectRead.length > SUBJECT_PHONE ? "may be cut off on phones" : null;
    const preheaderWarn =
        preheaderRead && (preheaderRead.length < PREVIEW_LINE_RANGE[0] || preheaderRead.length > PREVIEW_LINE_RANGE[1])
            ? `${PREVIEW_LINE_RANGE[0]} to ${PREVIEW_LINE_RANGE[1]} reads best`
            : null;
    const palette = Boolean(content) && editable && !inChinese;
    const asideTabs: PaletteTab<EmailBlock>[] = [
        ...PALETTE,
        startersTab,
        {
            value: "variables",
            label: "Variables",
            content: (
                <CampaignVariablesTab>
                    {content ? <VariableFallbacks used={usedVariables} content={content} onChange={editContent} disabled={!editable} errors={fieldErrors} chinese={chineseFallbacks} /> : null}
                </CampaignVariablesTab>
            ),
        },
    ];
    const sheetTabs: PaletteTab<EmailBlock>[] = [
        ...PALETTE,
        startersTab,
        { value: "variables", label: "Variables", content: <CampaignVariablesTab draggable={false} onInserted={() => setAddOpen(false)} /> },
    ];
    const saveLabel = campaign ? "Save changes" : "Save draft";

    const startPanel = (
        <Suspense fallback={START_PANEL_LOADING}>
            <StartPanel
                starters={startItems}
                onBlank={() => setStartPutAway(true)}
                ai={
                    aiHere
                        ? { disabledReason: !ai.configured ? AI_WRITING_NO_CREDENTIALS : aiBusy ? AI_BUSY : titleBlocker, onClick: () => setGenerateOpen(true) }
                        : null
                }
                onPastCampaign={(id) => void copyOf(id)}
                busy={busy}
            />
        </Suspense>
    );
    const sendBar = Boolean(campaign && (sending || (plan && planned > 0)) && (tab === "send" || sending));
    const writeBar = !sendBar && tab === "write" && !sending;

    const saveButton = (className?: string) => (
        <Button onClick={() => void save()} disabled={saveDisabled} className={className}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {saveLabel}
        </Button>
    );

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
                                                <Link
                                                    href={chosenSegmentHref}
                                                    className="relative font-medium text-foreground underline-offset-4 hover:underline active:opacity-60 max-md:after:absolute max-md:after:-inset-y-2 max-md:after:inset-x-0 max-md:after:content-['']"
                                                >
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
                {segmentMissing ? (
                    <div role="status" aria-labelledby="c-playbook-segment" className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
                        {segmentsUnread ? (
                            <p id="c-playbook-segment">
                                {segmentMissing.who} sends to the Segment “{segmentMissing.name}”, but the Segments could not be read, so it isn&apos;t
                                known whether it exists. Reload the page to try again.
                            </p>
                        ) : (
                            <>
                                <p id="c-playbook-segment">
                                    {segmentMissing.who} sends to the Segment “{segmentMissing.name}”, which doesn&apos;t exist yet.
                                </p>
                                {segmentMissing.note ? <p>{segmentMissing.note}</p> : null}
                                {canCreateSegments ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button type="button" size="sm" onClick={() => void createWantedSegment()} disabled={segmentBusy} aria-busy={segmentBusy}>
                                            {segmentBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                                            Create the Segment
                                        </Button>
                                        <span className="text-muted-foreground">Saved with its filters, then chosen here.</span>
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground">
                                        Ask an Owner, or someone whose role can make changes on Customers, to create it. Then choose it here.
                                    </p>
                                )}
                            </>
                        )}
                        {segmentError ? (
                            <p role="alert" className="text-destructive">
                                {segmentError}
                            </p>
                        ) : null}
                    </div>
                ) : null}
                {audienceNote && !locked ? (
                    <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">
                        {audienceNote}
                    </p>
                ) : null}
                <Field
                    label="Leave out people in…"
                    htmlFor="c-leave-out"
                    error={fieldErrors.excludeSegmentIds}
                    hint={
                        segments.length
                            ? `Up to ${MAX_EXCLUDED_SEGMENTS} Segments, read again at every wave: someone in one is not sent this campaign.`
                            : "No segments yet. Save one from the filters on the Customers list."
                    }
                >
                    <div className="space-y-2">
                        {excludeSegmentIds.length ? (
                            <ul className="flex flex-wrap gap-2" aria-label="Segments left out">
                                {excludeSegmentIds.map((x) => (
                                    <li key={x}>
                                        <Badge variant="secondary" className="max-w-full gap-1 py-0.5 pr-0.5 font-normal">
                                            <span className="truncate">{segmentName(x)}</span>
                                            {locked ? null : (
                                                <button
                                                    type="button"
                                                    aria-label={`Stop leaving out ${segmentName(x)}`}
                                                    onClick={() => keepIn(x)}
                                                    className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors after:absolute after:-inset-3 after:content-[''] hover:bg-muted-foreground/20 active:bg-press"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            )}
                                        </Badge>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                        {locked || excludeSegmentIds.length >= MAX_EXCLUDED_SEGMENTS ? null : (
                            <Select key={excludeSegmentIds.join(",")} value="" onValueChange={leaveOut}>
                                <SelectTrigger id="c-leave-out" className="w-full justify-between sm:w-1/2" disabled={!leaveOutChoices.length}>
                                    <SelectValue placeholder={excludeSegmentIds.length ? "Leave out another Segment" : "Nobody: choose a Segment"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {leaveOutChoices.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {locked && !excludeSegmentIds.length ? <p className="text-sm text-muted-foreground">Nobody.</p> : null}
                    </div>
                </Field>
                <div className="space-y-1">
                    <label className="flex items-center gap-2 text-sm max-md:min-h-11 max-md:active:opacity-60">
                        <Checkbox
                            checked={includeUnengaged}
                            onCheckedChange={(v) => edit({ includeUnengaged: v === true })}
                            disabled={locked}
                            aria-describedby="c-include-unengaged-hint"
                        />
                        Include unengaged
                    </label>
                    <p id="c-include-unengaged-hint" className="text-xs text-muted-foreground">
                        Off, it leaves out people who {UNENGAGED_WHO}. Tick it for a win-back to At risk · Lapsed.
                    </p>
                </div>
                <p className="text-sm">
                    <span className="font-medium">From</span>{" "}
                    <span className="break-words text-muted-foreground">
                        {preview ? (preview.from ?? "Not set up yet: the Send tab says what sending needs.") : "…"}
                    </span>
                </p>

                <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label id="c-subject-label">{inChinese ? "Subject in 中文" : "Subject"}</Label>
                        {aiHere && !inChinese ? suggestButton("subject") : null}
                    </div>
                    <RichText
                        key={emailLanguage}
                        id="c-subject"
                        singleLine
                        aria-labelledby="c-subject-label"
                        aria-describedby="c-subject-count"
                        aria-invalid={Boolean(lineError("subject"))}
                        value={subjectValue}
                        variables={lineVariables}
                        placeholder={inChinese ? subject || CAMPAIGN_PLACEHOLDERS.subject : CAMPAIGN_PLACEHOLDERS.subject}
                        readOnly={locked}
                        onChange={(next, how) => editLine("subject", richTextWords(next), how.paste ? undefined : "c-subject")}
                    />
                    {lineError("subject") ? <p className="text-xs text-destructive">{lineError("subject")}</p> : null}
                    <CharCount id="c-subject-count" value={subjectRead} warn={subjectWarn} />
                    {inChinese && version && linesStatus === "changed" && editable ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
                            <span className="min-w-0 flex-1">The English subject or preview line changed since this was translated.</span>
                            {aiHere ? (
                                <AiButton
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    working={translateWorking}
                                    onStop={translate.stop}
                                    disabledReason={translateReason}
                                    onClick={() => translate.start({ kind: "changed" })}
                                >
                                    {CHINESE_EDITOR_TEXT.blockAgain}
                                </AiButton>
                            ) : null}
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => editChinese((c) => keepChineseLines(c, subject, preheader))}>
                                {CHINESE_EDITOR_TEXT.keep}
                            </Button>
                        </div>
                    ) : null}
                    {inChinese ? null : aiHere && refine.ideas.subject ? (
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
                        <Label id="c-preheader-label">{inChinese ? "Preview line in 中文" : "Preview line"}</Label>
                        {aiHere && !inChinese ? suggestButton("preheader") : null}
                    </div>
                    <RichText
                        key={emailLanguage}
                        id="c-preheader"
                        singleLine
                        aria-labelledby="c-preheader-label"
                        aria-describedby="c-preheader-count"
                        aria-invalid={Boolean(lineError("preheader"))}
                        value={preheaderValue}
                        variables={lineVariables}
                        placeholder={inChinese ? preheader || CAMPAIGN_PLACEHOLDERS.preheader : CAMPAIGN_PLACEHOLDERS.preheader}
                        readOnly={locked}
                        onChange={(next, how) => editLine("preheader", richTextWords(next), how.paste ? undefined : "c-preheader")}
                    />
                    {lineError("preheader") ? <p className="text-xs text-destructive">{lineError("preheader")}</p> : null}
                    <CharCount
                        id="c-preheader-count"
                        value={preheaderRead}
                        warn={preheaderWarn}
                        ok={`Shown after the subject in most inboxes. Optional; ${PREVIEW_LINE_RANGE[0]} to ${PREVIEW_LINE_RANGE[1]} reads best.`}
                    />
                    {inChinese ? null : aiHere && refine.ideas.preheader ? (
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
                    <Label htmlFor="c-greeting" className="cursor-pointer max-md:min-h-11 max-md:flex-1 max-md:active:opacity-60">Start with &ldquo;Hi &lt;first name&gt;,&rdquo;</Label>
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
                        {aiDraft.showBar && aiDraft.run && !inChinese ? (
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
                            label={inChinese ? "The email's blocks, in 中文" : "The email's blocks"}
                            empty={
                                inChinese
                                    ? "No blocks yet. Write the email in English first."
                                    : offerStart
                                      ? startPanel
                                      : "No blocks yet. Drag a heading, some text and a button in from Blocks, or add one below."
                            }
                            errors={inChinese ? chineseErrors : fieldErrors}
                            errorPath="content.blocks"
                            warnings={blockWarnings}
                        />
                        <div className={cn(palette && "lg:hidden")}>
                            <VariableFallbacks
                                used={usedVariables}
                                content={content}
                                onChange={editContent}
                                disabled={!editable}
                                errors={fieldErrors}
                                idPrefix="c-email-fallback"
                                chinese={chineseFallbacks}
                            />
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
                {offerStart && !content ? <div className="rounded-lg border border-dashed p-4">{startPanel}</div> : null}

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
                    {aiHere && content && !inChinese ? (
                        ai.configured ? (
                            <Suspense fallback={<AiButton disabledReason={titleBlocker}>Generate</AiButton>}>
                                <GeneratePopover
                                    open={generateOpen}
                                    onOpenChange={setGenerateOpen}
                                    title={draftTitle(subject, name)}
                                    blocker={aiRunScope?.scope === "text" || refine.working || translate.working ? AI_BUSY : titleBlocker}
                                    hasBlocks={content.blocks.length > 0}
                                    working={aiRunScope?.scope === "email" ? aiStage : null}
                                    onStop={aiDraft.stop}
                                    onGenerate={(brief, mode) => {
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

            <Tabs value={tab} onValueChange={(v) => setTab(v as "write" | "send" | "results")}>
                <TabsList>
                    <TabsTrigger value="write">Write</TabsTrigger>
                    <TabsTrigger value="send">Send</TabsTrigger>
                    {locked ? <TabsTrigger value="results">Results</TabsTrigger> : null}
                </TabsList>

                <TabsContent value="write" forceMount className="data-[state=inactive]:hidden">
                    <CampaignAiContext.Provider value={inChinese ? null : campaignAi}>
                        <ChineseEditingContext.Provider value={chineseEditing}>
                        <BlockEditorRoot
                            blocks={inChinese ? chineseBlocks : (content?.blocks ?? [])}
                            catalogue={CAMPAIGN_BLOCKS}
                            onChange={inChinese ? setChineseBlocks : setBlocks}
                            selected={selected}
                            onSelect={setSelected}
                            readOnly={!editable}
                            max={CONTENT_LIMITS.blocks}
                            newId={newBlockId}
                            variables={variables}
                            badges={inChinese ? chineseBadges : badges}
                            layoutLocked={inChinese ? CHINESE_EDITOR_TEXT.layout : null}
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
                                        <div className="sticky top-4 -m-1 max-h-[calc(100vh-2rem)] overflow-y-auto p-1">
                                            <BlockPalette tabs={asideTabs} tab={paletteTab} onTab={setPaletteTab} />
                                        </div>
                                    </aside>
                                ) : null}
                                <section className={cn("min-w-0 space-y-3", pane === "preview" && "max-lg:hidden")} aria-label="The email">
                                    {content ? (
                                        <LanguageBar
                                            language={emailLanguage}
                                            onLanguage={setEmailLanguage}
                                            hasChinese={Boolean(version)}
                                            editable={editable}
                                            translate={
                                                aiHere
                                                    ? {
                                                          reason: translateReason ?? translateBlockerText,
                                                          working: translate.working && translate.working.kind !== "block" ? translateWorking : null,
                                                          onStop: translate.stop,
                                                          start: translate.start,
                                                          changed: chineseChanged,
                                                      }
                                                    : null
                                            }
                                            onRemove={removeChinese}
                                            error={translate.error}
                                            onDismissError={translate.dismissError}
                                        />
                                    ) : null}
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
                        </ChineseEditingContext.Provider>
                    </CampaignAiContext.Provider>
                </TabsContent>

                <TabsContent value="send" forceMount data-own-undo className="flex flex-col gap-6 data-[state=inactive]:hidden">
                    {campaign ? null : (
                        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            Save the draft first. Then you can test it, check what sending needs, and send it.
                        </p>
                    )}
                    {campaign ? (
                        <div className={cn("grid gap-6 lg:grid-cols-2", locked && "max-md:order-2")}>
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
                                    {version ? (
                                        <PresetPicker
                                            label="Language"
                                            value={testLanguage}
                                            options={[
                                                { value: DEFAULT_LOCALE, label: CHINESE_EDITOR_TEXT.english },
                                                { value: CHINESE, label: CHINESE_EDITOR_TEXT.chinese },
                                            ]}
                                            onChange={setTestLanguage}
                                        />
                                    ) : null}
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
                                <CardContent>
                                    {checks ? <CheckList checks={checks} advice={advice} /> : <Loader2 className="h-4 w-4 animate-spin" />}
                                </CardContent>
                            </Card>
                        </div>
                    ) : null}

                    {campaign ? (
                        <Card className={locked ? "max-md:order-1" : undefined}>
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
                                        Sent {n(stats.handed)}, clicked {n(stats.clicked)}, unsubscribed {n(stats.unsubscribed)}, bounced{" "}
                                        {n(stats.bounced)}, marked as spam {n(stats.complained)}, failed {n(stats.failed)}, sign-in link opened{" "}
                                        {n(stats.linkClicks)}
                                    </CardDescription>
                                ) : null}
                            </CardHeader>
                            <CardContent className="flex flex-col gap-5">
                                <ol className="grid gap-3 sm:grid-cols-2" aria-label="Before you send">
                                    {sendSteps({ dirty: dirty && !locked, locked, lastTest, checks, advice, allowance, resume }).map((step) => (
                                        <li key={step.key} className={cn("flex items-start gap-2 text-sm", step.items && "sm:col-span-2")}>
                                            <StatusIcon ok={step.done} advisory={step.advisory} />
                                            <span className="min-w-0">
                                                <span className="block font-medium">{step.label}</span>
                                                <span className="block break-words text-xs text-muted-foreground">{step.detail}</span>
                                                {step.items ? (
                                                    <ul className="mt-1 space-y-0.5 text-xs">
                                                        {step.items.map((item, i) => (
                                                            <li key={`${i}:${item.text}`} className={cn("break-words", item.advisory ? "text-muted-foreground" : "text-destructive")}>
                                                                {item.blockId ? (
                                                                    <button
                                                                        type="button"
                                                                        className="text-left underline underline-offset-2 hover:no-underline"
                                                                        onClick={() => goToBlock(item.blockId!, item.language)}
                                                                    >
                                                                        {item.text}
                                                                    </button>
                                                                ) : (
                                                                    item.text
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : null}
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
                                        <label className="flex items-center gap-2 text-sm max-md:min-h-11 max-md:active:opacity-60">
                                            <Checkbox checked={retryFailed} onCheckedChange={(v) => {
                                                    setRetryFailed(v === true);
                                                    setPlan(null);
                                                }} disabled={sending} />
                                            Retry the {n(stats.failed)} failed send{stats.failed === 1 ? "" : "s"} only
                                        </label>
                                    ) : null}
                                    {pauseFailing ? (
                                        <label className="flex items-center gap-2 text-sm max-md:min-h-11 max-md:active:opacity-60">
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
                                        {plan.plan.heldOut ? (
                                            <p className="text-muted-foreground">
                                                The holdout keeps {n(plan.plan.heldOut)} of this wave back to measure the campaign: they are
                                                recorded and never sent it.
                                            </p>
                                        ) : null}
                                        {Object.keys(plan.plan.excluded).length || plan.leftOutBySegment.length ? (
                                            <ul className="list-inside list-disc text-muted-foreground">
                                                {plan.leftOutBySegment.map((x) => (
                                                    <li key={x.segmentId}>
                                                        {n(x.count)} left out: in “{x.name}”
                                                    </li>
                                                ))}
                                                {Object.entries(plan.plan.excluded).map(([why, count]) => (
                                                    <li key={why}>
                                                        {n(count ?? 0)} left out: {CAMPAIGN_BLOCKER_TEXT[why as keyof typeof CAMPAIGN_BLOCKER_TEXT] ?? why}
                                                        {why === "resting" && plan.plan.restingUntil
                                                            ? `; the first can get it from ${formatAdminDateMY(plan.plan.restingUntil)}`
                                                            : ""}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : null}
                                        {languageLine ? <p>{languageLine}</p> : null}
                                        {plan.fit.length ? (
                                            <p className="text-muted-foreground">
                                                {fitSummary(plan.fit.length)}
                                            </p>
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

                                <WaveTable waves={waves} className={locked ? "max-md:order-first" : undefined} />
                            </CardContent>
                        </Card>
                    ) : null}

                    {campaign && locked ? (
                        <KeepSendingCard
                            campaignId={campaign.id}
                            initial={campaign.keepSending}
                            blocker={keepSendingBlocker(campaign, stats?.handed ?? 0)}
                            audience={audienceWords}
                            today={keptToday}
                            handed={stats?.handed ?? 0}
                            className="max-md:order-1"
                        />
                    ) : null}
                </TabsContent>

                {locked ? (
                    <TabsContent value="results">
                        <CampaignResultsPanel stats={stats} results={results} />
                    </TabsContent>
                ) : null}
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
