"use client";

import { useState } from "react";
import { Loader2, Pause, Play, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { formatAdminDateTime } from "@/lib/format/admin-date";
import {
    KEEP_SENDING_MAX_CAP,
    KEEP_SENDING_OFF,
    KEEP_SENDING_RESERVE,
    KEEP_SENDING_TIME,
    keepSendingPromise,
    keepSendingStatus,
    type KeepSending,
} from "@/lib/email-campaigns/keep-sending";
import { changeKeepSending, type KeepSendingChange } from "./actions";
import { Field } from "./field";

/**
 * A started campaign's *Keep sending* (PRD-campaign-audiences slice 10): off
 * by default; on, the daily job sends it once a day, up to a cap, to people
 * who join its Audience. Pause stops it until resumed; a resume, like turning
 * it on, approves the Audience's Segments as they are now. The email and the
 * Audience stay as the first wave fixed them.
 */
export function KeepSendingCard({
    campaignId,
    initial,
    blocker,
    audience,
    today,
    className,
}: {
    campaignId: string;
    initial: KeepSending | undefined;
    /** Why it cannot keep sending yet (no first wave); null when it can. */
    blocker: string | null;
    /** Who it goes to, in words. */
    audience: string;
    /** Emails the daily job's Wave sent today. */
    today: number;
    className?: string;
}) {
    const [state, setState] = useState<KeepSending>(initial ?? KEEP_SENDING_OFF);
    const [cap, setCap] = useState(String(state.dailyCap));
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const status = keepSendingStatus(state);

    const change = async (key: string, c: KeepSendingChange) => {
        setBusy(key);
        setError(null);
        try {
            const r = await changeKeepSending(campaignId, c);
            if (r.ok) {
                setState(r.keepSending);
                setCap(String(r.keepSending.dailyCap));
            } else setError(r.error);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(null);
        }
    };
    const spin = (key: string) => (busy === key ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null);
    const capChanged = Number(cap) !== state.dailyCap;

    return (
        <Card className={className}>
            <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">Keep sending</CardTitle>
                    <InfoTip label="About keep sending">
                        <p>
                            Once a day at {KEEP_SENDING_TIME}, a campaign set to keep sending sends one wave by itself to
                            people who have joined its Audience since, and to anyone still waiting for it. Nobody gets it
                            twice.
                        </p>
                        <p>
                            It never sends more than its cap in a day, and leaves {KEEP_SENDING_RESERVE} of Resend&apos;s
                            day for tests and your own waves. The rest period, consent and the pause rule apply as in any
                            wave.
                        </p>
                        <p>
                            The email and the Audience stay as they are. If the Segment it reads changes, it pauses itself
                            until you resume it.
                        </p>
                    </InfoTip>
                    {status ? (
                        <Badge variant={status.tone === "on" ? "default" : "outline"} className={status.tone === "paused" ? "border-amber-500 text-amber-700 dark:text-amber-400" : undefined}>
                            {status.label}
                        </Badge>
                    ) : null}
                </div>
                <CardDescription>
                    {blocker
                        ? `${blocker} Then it can keep sending to people who join its Audience.`
                        : state.on
                          ? `Up to ${state.dailyCap} a day at ${KEEP_SENDING_TIME}, to ${audience.charAt(0).toLowerCase()}${audience.slice(1)}. Today: ${today === 0 ? "none sent yet" : `${today} sent`}.`
                          : keepSendingPromise(Number(cap) || state.dailyCap)}
                </CardDescription>
            </CardHeader>
            {blocker ? null : (
                <CardContent className="space-y-4">
                    {state.on && state.pausedAt ? (
                        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                            {state.pausedReason
                                ? `Paused by the daily run on ${formatAdminDateTime(state.pausedAt)}: ${state.pausedReason}. Resume sends to its Audience as it is now.`
                                : `Paused on ${formatAdminDateTime(state.pausedAt)}. Nothing goes until you resume it.`}
                        </p>
                    ) : null}
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="w-40">
                            <Field label="Daily cap" htmlFor="keep-cap" hint={`1 to ${KEEP_SENDING_MAX_CAP} people a day`}>
                                <Input
                                    id="keep-cap"
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={KEEP_SENDING_MAX_CAP}
                                    value={cap}
                                    onChange={(e) => setCap(e.target.value)}
                                />
                            </Field>
                        </div>
                        {state.on ? (
                            capChanged ? (
                                <Button variant="outline" onClick={() => change("cap", { dailyCap: Number(cap) })} disabled={busy !== null}>
                                    {spin("cap")}
                                    Save cap
                                </Button>
                            ) : null
                        ) : (
                            <Button onClick={() => change("on", { on: true, dailyCap: Number(cap) })} disabled={busy !== null}>
                                {spin("on") ?? <Repeat className="mr-1 h-4 w-4" />}
                                Keep sending
                            </Button>
                        )}
                    </div>
                    {state.on ? (
                        <div className="flex flex-wrap gap-2">
                            {state.pausedAt ? (
                                <Button onClick={() => change("resume", { paused: false })} disabled={busy !== null}>
                                    {spin("resume") ?? <Play className="mr-1 h-4 w-4" />}
                                    Resume
                                </Button>
                            ) : (
                                <Button variant="outline" onClick={() => change("pause", { paused: true })} disabled={busy !== null}>
                                    {spin("pause") ?? <Pause className="mr-1 h-4 w-4" />}
                                    Pause
                                </Button>
                            )}
                            <Button variant="ghost" onClick={() => change("off", { on: false })} disabled={busy !== null}>
                                {spin("off")}
                                Turn off
                            </Button>
                        </div>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                        Its email and Audience stay as they are. To send something different, duplicate the campaign.
                    </p>
                    {error ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    ) : null}
                </CardContent>
            )}
        </Card>
    );
}
