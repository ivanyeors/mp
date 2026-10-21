"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Archive, CheckCircle2, ChevronLeft, Copy, Loader2, Send, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    CAMPAIGN_AUDIENCE_LABEL,
    CAMPAIGN_AUDIENCES,
    CAMPAIGN_BLOCKER_TEXT,
    CAMPAIGN_LIMITS,
    MAX_TEST_RECIPIENTS,
    MAX_WAVE_SIZE,
    type Campaign,
    type CampaignAudience,
    type CampaignDraft,
    type CampaignDraftInput,
} from "@/lib/email-campaigns/rules";
import type { CampaignStats } from "@/lib/email-campaigns/store";
import type { PreflightCheck } from "@/lib/customer-migration/wave-sender";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
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

export type SegmentOption = { id: string; name: string };

type ButtonChoice = "none" | "sign_in" | "url";

/** Plain-language names for the sender's checks. */
const CHECK_LABEL: Record<string, string> = {
    transport: "Campaign email account (Resend)",
    from: "Sending address",
    reply_to: "Where replies go",
    site: "Links point at the live site",
    unsubscribe_route: "One-click unsubscribe works",
    unsubscribe_secret: "Unsubscribe links are signed correctly",
    pause: "Bounces and spam reports are low",
};

const n = (v: number) => v.toLocaleString("en-SG");

function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: ReactNode; error?: string; children: ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={htmlFor}>{label}</Label>
            {children}
            {error ? (
                <p className="text-xs text-destructive">{error}</p>
            ) : hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}

function CheckList({ checks }: { checks: PreflightCheck[] }) {
    return (
        <ul className="space-y-2">
            {checks.map((c) => (
                <li key={c.key} className="flex items-start gap-2 text-sm">
                    {c.ok ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Passes" />
                    ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Fails" />
                    )}
                    <span className="min-w-0">
                        <span className="font-medium">{CHECK_LABEL[c.key] ?? c.key}</span>
                        <span className="block break-words text-xs text-muted-foreground">{c.detail}</span>
                    </span>
                </li>
            ))}
        </ul>
    );
}

type WaveProgress = {
    wave: string;
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    running: boolean;
    stopped: string | null;
    errors: string[];
};

/**
 * Admin Panel → Email campaigns → one campaign (PRD-email-marketing): write it
 * with a live preview, send a test, check what sending needs, then send in
 * waves. A wave is sent from this page a batch at a time, so it stays open
 * while it sends; closing it stops the wave, and the next one picks up the
 * people still to send to.
 */
export function CampaignEditor({
    campaign,
    draft: initial,
    stats,
    segments,
    staffEmail,
}: {
    /** Null for a new one. */
    campaign: Campaign | null;
    draft: CampaignDraft;
    stats: CampaignStats | null;
    segments: SegmentOption[];
    /** The signed-in Staff email: the test's default address. */
    staffEmail: string;
}) {
    const router = useRouter();
    const locale = getLocaleFromPathname(usePathname() ?? "") ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const locked = Boolean(campaign?.lockedAt);

    // ── The draft ──────────────────────────────────────────────────────────
    const [name, setName] = useState(initial.name);
    const [audience, setAudience] = useState<CampaignAudience>(initial.audience);
    const [segmentId, setSegmentId] = useState(initial.segmentId ?? "");
    const [subject, setSubject] = useState(initial.subject);
    const [preheader, setPreheader] = useState(initial.preheader ?? "");
    const [greeting, setGreeting] = useState(initial.greeting);
    const [body, setBody] = useState(initial.body);
    const [buttonChoice, setButtonChoice] = useState<ButtonChoice>(initial.button?.target ?? "none");
    const [buttonLabel, setButtonLabel] = useState(initial.button?.label ?? "Sign in to your account");
    const [buttonUrl, setButtonUrl] = useState(initial.button?.url ?? "");

    const input: CampaignDraftInput = useMemo(
        () => ({
            name,
            subject,
            preheader,
            body,
            greeting,
            audience,
            segmentId: audience === "segment" ? segmentId || null : null,
            button:
                buttonChoice === "none"
                    ? null
                    : { target: buttonChoice, label: buttonLabel, url: buttonChoice === "url" ? buttonUrl : null },
        }),
        [name, subject, preheader, body, greeting, audience, segmentId, buttonChoice, buttonLabel, buttonUrl],
    );
    const [savedKey, setSavedKey] = useState(() => JSON.stringify(input));
    const dirty = JSON.stringify(input) !== savedKey || !campaign;

    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const save = useCallback(async (): Promise<string | null> => {
        setSaving(true);
        setSaveError(null);
        try {
            const res = await saveCampaign(campaign?.id ?? null, input);
            if (!res.ok) {
                setSaveError(res.error);
                setFieldErrors(res.fieldErrors ?? {});
                return null;
            }
            setFieldErrors({});
            setSavedKey(JSON.stringify(input));
            if (!campaign) router.replace(withLocale(`/settings/campaigns/${res.id}`, locale));
            else router.refresh();
            return res.id;
        } finally {
            setSaving(false);
        }
    }, [campaign, input, locale, router]);

    // ── The preview ────────────────────────────────────────────────────────
    const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    useEffect(() => {
        let live = true;
        const timer = setTimeout(async () => {
            const res = await previewCampaign(input).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
            if (!live) return;
            if (res.ok) {
                setPreview({ subject: res.subject, html: res.html });
                setPreviewError(null);
            } else {
                setPreviewError("fieldErrors" in res && res.fieldErrors ? Object.values(res.fieldErrors)[0] ?? res.error : res.error);
            }
        }, 500);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [input]);

    // ── Readiness ──────────────────────────────────────────────────────────
    const campaignId = campaign?.id;
    const [checks, setChecks] = useState<PreflightCheck[] | null>(null);
    const [checking, setChecking] = useState(false);
    const readChecks = useCallback(
        () =>
            checkCampaignReadiness(campaignId)
                .then((r) => r.checks)
                .catch((e: unknown): PreflightCheck[] => [{ key: "transport", ok: false, detail: String(e) }]),
        [campaignId],
    );
    const runChecks = async () => {
        setChecking(true);
        setChecks(await readChecks());
        setChecking(false);
    };
    useEffect(() => {
        if (!campaignId) return;
        let live = true;
        void readChecks().then((c) => live && setChecks(c));
        return () => {
            live = false;
        };
    }, [campaignId, readChecks]);
    const pauseFailing = checks?.some((c) => c.key === "pause" && !c.ok) ?? false;

    // ── Test ───────────────────────────────────────────────────────────────
    const [testTo, setTestTo] = useState(staffEmail);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
    const sendTest = async () => {
        if (!campaign) return;
        setTesting(true);
        setTestResult(null);
        try {
            if (dirty && !locked && !(await save())) return;
            const addresses = testTo.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
            const res = await sendCampaignTestAction(campaign.id, addresses);
            if (!res.ok) setTestResult({ ok: false, text: res.error });
            else if (res.failed.length) setTestResult({ ok: false, text: `Sent ${res.sent}; failed: ${res.failed.map((f) => `${f.to} (${f.error})`).join(", ")}` });
            else setTestResult({ ok: true, text: `Test sent to ${res.sent} address${res.sent === 1 ? "" : "es"}. Check the inbox, and the spam folder.` });
        } finally {
            setTesting(false);
        }
    };

    // ── Waves ──────────────────────────────────────────────────────────────
    const [size, setSize] = useState(stats && stats.handed > 0 ? 200 : 50);
    const [retryFailed, setRetryFailed] = useState(false);
    const [resume, setResume] = useState(false);
    const [plan, setPlan] = useState<Extract<WaveAnswer, { ok: true }> | null>(null);
    const [planError, setPlanError] = useState<string | null>(null);
    const [planning, setPlanning] = useState(false);
    const [progress, setProgress] = useState<WaveProgress | null>(null);
    const stopRef = useRef(false);

    const checkAudience = async () => {
        if (!campaign) return;
        setPlanning(true);
        setPlanError(null);
        try {
            const res = await planCampaignWave(campaign.id, { size, retryFailed, resume }, false);
            if (res.ok) setPlan(res);
            else setPlanError(res.error);
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

    const startWave = async () => {
        if (!campaign || !plan) return;
        const count = Math.min(size, plan.plan.eligible);
        const first = !campaign.lockedAt;
        const ok = window.confirm(
            `Send "${subject}" to ${n(count)} ${count === 1 ? "person" : "people"} now?` +
                (first ? "\n\nAfter the first wave the email can't be changed (you can duplicate it)." : ""),
        );
        if (!ok) return;
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
        let state: WaveProgress = { wave: started.wave, total: ids.length, sent: 0, failed: 0, skipped: 0, running: true, stopped: null, errors: [] };
        setProgress(state);
        let failuresInARow = 0;
        for (let i = 0; i < ids.length; i += started.batchSize) {
            if (stopRef.current) {
                state = { ...state, stopped: "You stopped the wave." };
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
        setProgress({ ...state, running: false });
        setPlan(null);
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
        if (!campaign) return;
        setBusy(true);
        const res = await duplicateCampaign(campaign.id);
        setBusy(false);
        if (res.ok) router.push(to(`/settings/campaigns/${res.id}`));
        else setSaveError(res.error);
    };

    const sending = progress?.running ?? false;
    const ready = checks?.every((c) => c.ok || (c.key === "pause" && resume)) ?? false;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <Button variant="ghost" size="sm" className="self-start" asChild>
                    <Link href={to("/settings/campaigns")}>
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Email campaigns
                    </Link>
                </Button>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h1 className="truncate text-2xl font-semibold tracking-tight">{campaign ? campaign.name : "New campaign"}</h1>
                    {campaign ? <Badge variant={locked ? "default" : "outline"}>{locked ? "Sending started" : "Draft"}</Badge> : null}
                </div>
                {campaign ? (
                    <div className="flex gap-2 sm:ml-auto">
                        <Button variant="outline" size="sm" onClick={duplicate} disabled={busy || sending}>
                            <Copy className="mr-1 h-4 w-4" />
                            Duplicate
                        </Button>
                        <Button variant="outline" size="sm" onClick={archive} disabled={busy || sending}>
                            <Archive className="mr-1 h-4 w-4" />
                            Archive
                        </Button>
                    </div>
                ) : null}
            </div>

            {locked ? (
                <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    This campaign has started sending, so its email and audience are fixed: everyone gets the same
                    email. To send a changed one, duplicate it. Customers already sent this one won&apos;t get it again.
                </p>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">The email</CardTitle>
                        <CardDescription>Only customers who agreed to marketing email receive it.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Field label="Campaign name" htmlFor="c-name" hint="For you; customers never see it." error={fieldErrors.name}>
                            <Input id="c-name" value={name} maxLength={CAMPAIGN_LIMITS.name} onChange={(e) => setName(e.target.value)} />
                        </Field>

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
                                hint={segments.length ? "Save Segments from the Customers list's filters." : "No Segments yet: save one from the Customers list's filters."}
                            >
                                <Select value={segmentId} onValueChange={setSegmentId}>
                                    <SelectTrigger id="c-segment" className="w-full justify-between" disabled={locked || !segments.length}>
                                        <SelectValue placeholder="Choose a Segment" />
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

                        <Field label="Subject" htmlFor="c-subject" error={fieldErrors.subject}>
                            <Input id="c-subject" value={subject} disabled={locked} maxLength={CAMPAIGN_LIMITS.subject} onChange={(e) => setSubject(e.target.value)} />
                        </Field>
                        <Field label="Preview line" htmlFor="c-preheader" hint="Shown after the subject in most inboxes. Optional." error={fieldErrors.preheader}>
                            <Input id="c-preheader" value={preheader} disabled={locked} maxLength={CAMPAIGN_LIMITS.preheader} onChange={(e) => setPreheader(e.target.value)} />
                        </Field>

                        <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="c-greeting">Start with &ldquo;Hi &lt;first name&gt;,&rdquo;</Label>
                            <Switch id="c-greeting" checked={greeting} disabled={locked} onCheckedChange={setGreeting} />
                        </div>

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
                            <Textarea id="c-body" rows={14} value={body} disabled={locked} maxLength={CAMPAIGN_LIMITS.body} onChange={(e) => setBody(e.target.value)} />
                        </Field>

                        <Field label="Button" htmlFor="c-button">
                            <Select value={buttonChoice} onValueChange={(v) => setButtonChoice(v as ButtonChoice)}>
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
                                    <Input id="c-button-label" value={buttonLabel} disabled={locked} maxLength={CAMPAIGN_LIMITS.buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} />
                                </Field>
                                {buttonChoice === "url" ? (
                                    <Field label="Link" htmlFor="c-button-url" error={fieldErrors["button.url"]}>
                                        <Input id="c-button-url" value={buttonUrl} disabled={locked} placeholder="https://" onChange={(e) => setButtonUrl(e.target.value)} />
                                    </Field>
                                ) : (
                                    <p className="self-end text-xs text-muted-foreground">
                                        Imported customers who haven&apos;t signed in get their own link, with their email already filled in.
                                    </p>
                                )}
                            </div>
                        ) : null}

                        {saveError ? (
                            <p role="alert" className="text-sm text-destructive">
                                {saveError}
                            </p>
                        ) : null}
                        <div className="flex items-center gap-3">
                            <Button onClick={() => void save()} disabled={saving || sending || (!dirty && Boolean(campaign))}>
                                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                                {campaign ? "Save changes" : "Save draft"}
                            </Button>
                            {campaign && !dirty ? <span className="text-xs text-muted-foreground">Saved</span> : null}
                        </div>
                    </CardContent>
                </Card>

                <Card className="min-w-0">
                    <CardHeader>
                        <CardTitle className="text-base">Preview</CardTitle>
                        <CardDescription className="break-words">
                            {preview ? <>Subject: {preview.subject}</> : "The email as a customer will see it."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {previewError ? <p className="mb-2 text-xs text-destructive">{previewError}</p> : null}
                        {preview ? (
                            <iframe
                                title="Email preview"
                                srcDoc={preview.html}
                                sandbox=""
                                className="h-[640px] w-full rounded-md border bg-white"
                            />
                        ) : (
                            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rendering…
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

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
                                    Send to a small group first, wait a day, and look at the bounces and spam reports
                                    before sending to more. A sensible start is 50, then 200, then 500 a day.
                                </p>
                                <p>
                                    Keep this page open while a wave sends: it sends about two emails a second. If it
                                    stops, the next wave carries on with the people not yet sent to.
                                </p>
                            </InfoTip>
                        </div>
                        {stats ? (
                            <CardDescription>
                                Sent {n(stats.handed)} · bounced {n(stats.bounced)} · marked as spam {n(stats.complained)} · failed{" "}
                                {n(stats.failed)} · sign-in link opened {n(stats.linkClicks)}
                            </CardDescription>
                        ) : null}
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {dirty && !locked ? (
                            <p className="text-sm text-muted-foreground">Save your changes before sending.</p>
                        ) : null}
                        <div className="flex flex-wrap items-end gap-4">
                            <Field label="People in this wave" htmlFor="c-size">
                                <Input
                                    id="c-size"
                                    type="number"
                                    min={1}
                                    max={MAX_WAVE_SIZE}
                                    className="w-32"
                                    value={size}
                                    disabled={sending}
                                    onChange={(e) => {
                                        setSize(Math.max(1, Math.min(MAX_WAVE_SIZE, Math.floor(Number(e.target.value) || 1))));
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
                                    audience can get it now ({n(plan.plan.eligibleBuyers)} have ordered before; they go first).
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
                                <Button onClick={startWave} disabled={planning || sending || !ready || plan.plan.eligible === 0}>
                                    {planning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                                    Send to {n(Math.min(size, plan.plan.eligible))} {Math.min(size, plan.plan.eligible) === 1 ? "person" : "people"}
                                </Button>
                                {!ready ? <p className="text-xs text-destructive">A check above fails, so it can&apos;t send yet.</p> : null}
                            </div>
                        ) : null}

                        {progress ? (
                            <div className="space-y-2 rounded-lg border p-4 text-sm" role="status">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium">
                                        Wave {progress.wave}: {progress.running ? "sending" : "finished"}
                                    </span>
                                    {progress.running ? (
                                        <Button variant="outline" size="sm" onClick={() => (stopRef.current = true)}>
                                            Stop
                                        </Button>
                                    ) : null}
                                </div>
                                <Progress value={progress.total ? ((progress.sent + progress.failed + progress.skipped) / progress.total) * 100 : 100} />
                                <p>
                                    Sent {n(progress.sent)} of {n(progress.total)} · failed {n(progress.failed)} · skipped {n(progress.skipped)}
                                </p>
                                {progress.stopped ? <p className="text-destructive">Stopped: {progress.stopped}</p> : null}
                                {progress.errors.length ? (
                                    <ul className="list-inside list-disc text-xs text-muted-foreground">
                                        {progress.errors.map((e, i) => (
                                            <li key={i} className="break-words">
                                                {e}
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}
