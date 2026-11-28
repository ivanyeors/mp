"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import type { PreflightCheck } from "@/lib/customer-migration/wave-sender";
import { checkBoard, sendingRows } from "@/lib/email-campaigns/send-flow";
import { REST_PERIOD_TEXT } from "@/lib/email-campaigns/rules";
import { KEEP_SENDING_RESERVE, KEEP_SENDING_TIME } from "@/lib/email-campaigns/keep-sending";
import type { SendingStatus } from "@/lib/email-campaigns/sender";
import { checkCampaignReadiness } from "./actions";
import { AllowanceMeters, CheckBoardView } from "./send-parts";

export function SendingStatusCard({
    status,
    origin,
    keptSending = 0,
}: {
    status: SendingStatus | null;
    origin: string;
    keptSending?: number;
}) {
    const [full, setFull] = useState<PreflightCheck[] | null>(null);
    const [checking, setChecking] = useState(false);
    const runAll = async () => {
        setChecking(true);
        try {
            setFull((await checkCampaignReadiness()).checks);
        } catch (e) {
            setFull([{ key: "transport", ok: false, detail: e instanceof Error ? e.message : String(e) }]);
        } finally {
            setChecking(false);
        }
    };

    const rows = status ? sendingRows(status.checks, status.sender, origin) : [];
    const failing = rows.filter((r) => !r.ok).length;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                        <CardTitle className="text-base">Sending</CardTitle>
                        <InfoTip label="About sending">
                            <p>
                                Campaign email goes through Resend, from its own subdomain, never the mailbox
                                that sends orders. The Resend key is kept in Vercel and is never shown here.
                            </p>
                            <p>
                                Resend&apos;s free plan sends 100 emails a day and 3,000 a month, tests
                                included. A wave never goes past what is left; the rest go in the next one.
                            </p>
                        </InfoTip>
                    </div>
                    <Button variant="outline" size="sm" onClick={runAll} disabled={checking}>
                        {checking ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                        Run every check
                    </Button>
                </div>
                {status ? null : <CardDescription>The sending setup could not be read.</CardDescription>}
            </CardHeader>
            {status ? (
                <CardContent className="space-y-5">
                    <CheckBoardView
                        board={checkBoard(rows)}
                        headline={failing === 0 ? "Ready to send" : `${failing} thing${failing === 1 ? "" : "s"} to set up before sending`}
                    />
                    <div className="grid gap-5 md:grid-cols-2">
                        {status.allowance ? (
                            <AllowanceMeters allowance={status.allowance} />
                        ) : (
                            <p role="alert" className="text-sm text-destructive">
                                The send limit could not be counted{status.allowanceError ? `: ${status.allowanceError}` : ""}.
                            </p>
                        )}
                        <div className="space-y-3">
                            <p className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Rest period. </span>
                                {REST_PERIOD_TEXT} Someone resting is skipped, not failed, and a later wave reaches them.
                            </p>
                            {keptSending > 0 || (status.keptToday ?? 0) > 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">Kept sending. </span>
                                    {keptSending === 0
                                        ? "No campaign keeps sending now"
                                        : `${keptSending} campaign${keptSending === 1 ? " keeps" : "s keep"} sending at ${KEEP_SENDING_TIME} each day`}
                                    {status.keptToday === null
                                        ? "; today's could not be counted."
                                        : `; ${status.keptToday === 0 ? "none" : status.keptToday} sent today.`}{" "}
                                    They leave {KEEP_SENDING_RESERVE} of the day for tests and your own waves.
                                </p>
                            ) : null}
                        </div>
                    </div>
                    {full ? (
                        <div className="space-y-3 rounded-lg border p-3">
                            <p className="text-sm font-medium">Every check, with the live site</p>
                            <CheckBoardView board={checkBoard(full)} />
                        </div>
                    ) : null}
                </CardContent>
            ) : null}
        </Card>
    );
}
