"use client";

import { useState } from "react";
import { AlertTriangle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const n = (v: number) => v.toLocaleString("en-SG");

export interface SendConfirmation {
    count: number;
    wave: string;
    subject: string;
    from: string | null;
    replyTo: string | null;
    audience: string;
    firstWave: boolean;
}

export const sendButtonLabel = (count: number) => `Send to ${n(count)} ${count === 1 ? "person" : "people"}`;

export function SendConfirmDialog({
    open,
    onOpenChange,
    details,
    onConfirm,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    details: SendConfirmation | null;
    onConfirm: () => void;
}) {
    const [tested, setTested] = useState(false);
    if (!details) return null;
    const canSend = !details.firstWave || tested;
    const close = () => {
        setTested(false);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
            <DialogContent
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement | null)?.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
                }}
            >
                <DialogHeader>
                    <DialogTitle>{sendButtonLabel(details.count)}?</DialogTitle>
                    <DialogDescription>This can&apos;t be undone. Each person gets this campaign once.</DialogDescription>
                </DialogHeader>
                <SendSummary details={details} />
                {details.firstWave ? (
                    <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm">
                        <p className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            Sending locks this email and its audience. To change it later, duplicate the campaign.
                        </p>
                        <label className="flex items-start gap-2">
                            <Checkbox checked={tested} onCheckedChange={(v) => setTested(v === true)} className="mt-0.5" />
                            I sent myself a test and it looked right
                        </label>
                    </div>
                ) : null}
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button data-cancel variant="outline" onClick={close}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            setTested(false);
                            onConfirm();
                        }}
                        disabled={!canSend}
                    >
                        <Send className="mr-1 h-4 w-4" />
                        {sendButtonLabel(details.count)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function SendSummary({ details }: { details: SendConfirmation }) {
    const rows: [string, string][] = [
        ["Email", details.subject],
        ["From", details.from ?? "not set"],
        ["Replies go to", details.replyTo ?? "not set"],
        ["Audience", details.audience],
        ["This wave", `${n(details.count)} ${details.count === 1 ? "person" : "people"} (wave ${details.wave})`],
    ];
    return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {rows.map(([k, v]) => (
                <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 break-words font-medium">{v}</dd>
                </div>
            ))}
        </dl>
    );
}
