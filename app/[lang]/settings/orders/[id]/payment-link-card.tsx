"use client";

import { useState } from "react";
import { Check, Copy, Link2, Loader2, QrCode, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QrSvg } from "@/components/ui/qr-svg";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getClientPublicOrigin } from "@/lib/site-url";
import { payLinkPath, payLinkState, type PayLinkState } from "@/lib/staff-orders/shared";

export type PaymentLinkCardData = {
    token: string;
    expiresAt: string;
    createdByEmail: string | null;
    lastSentAt: string | null;
    lastSentTo: string | null;
    sendCount: number;
    locale: string;
};

const STATE_LABEL: Record<PayLinkState, string> = {
    payable: "Awaiting payment",
    paid: "Paid",
    expired: "Expired",
    closed: "Closed",
};

const date = (iso: string) =>
    new Intl.DateTimeFormat("en-SG", {
        timeZone: "Asia/Singapore",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(iso));

export function PaymentLinkCard({
    orderId,
    order,
    link,
}: {
    orderId: string;
    order: { status: string; paid_at: string | null };
    link: PaymentLinkCardData;
}) {
    const [data, setData] = useState(link);
    const [sending, setSending] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showQr, setShowQr] = useState(false);

    const state = payLinkState(order, { expires_at: data.expiresAt }, new Date());
    const locale = isSupportedLocale(data.locale) ? data.locale : DEFAULT_LOCALE;
    const url = `${getClientPublicOrigin()}${withLocale(payLinkPath(data.token), locale)}`;
    const usable = state === "payable" || state === "expired";

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {}
    };

    const resend = async () => {
        setSending(true);
        try {
            const res = await fetch(`/api/staff-orders/${orderId}/send`, { method: "POST" });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not send the link");
            setData((d) => ({
                ...d,
                expiresAt: json.expires_at,
                lastSentAt: new Date().toISOString(),
                lastSentTo: json.sent_to,
                sendCount: d.sendCount + 1,
            }));
            toast.success(`Payment link emailed to ${json.sent_to}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not send the link");
        } finally {
            setSending(false);
        }
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Payment link
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={state === "payable" ? "secondary" : state === "paid" ? "default" : "outline"}>
                        {STATE_LABEL[state]}
                    </Badge>
                    {state === "payable" ? (
                        <span className="text-muted-foreground">until {date(data.expiresAt)}</span>
                    ) : state === "expired" ? (
                        <span className="text-muted-foreground">on {date(data.expiresAt)}</span>
                    ) : null}
                </div>

                <p className="text-muted-foreground">
                    {data.lastSentAt && data.lastSentTo
                        ? `Emailed to ${data.lastSentTo}, ${date(data.lastSentAt)}${data.sendCount > 1 ? ` (${data.sendCount} times)` : ""}.`
                        : "Not emailed yet."}
                    {data.createdByEmail ? ` Made by ${data.createdByEmail}.` : ""}
                </p>

                {usable ? (
                    <>
                        <div className="flex gap-2">
                            <Input
                                readOnly
                                value={url}
                                suppressHydrationWarning
                                aria-label="Payment link"
                                onFocus={(e) => e.currentTarget.select()}
                                className="text-xs"
                            />
                            <Button type="button" variant="outline" size="icon" onClick={() => void copy()} aria-label="Copy link">
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => setShowQr((v) => !v)}
                                aria-pressed={showQr}
                                aria-label="Show QR code"
                            >
                                <QrCode className="h-4 w-4" />
                            </Button>
                        </div>
                        {showQr ? (
                            <div className="flex flex-col items-center gap-1">
                                <div className="rounded-md bg-white p-2">
                                    <QrSvg text={url} px={144} label="Payment link QR code" />
                                </div>
                                <p className="text-xs text-muted-foreground">Scan to pay on a phone</p>
                            </div>
                        ) : null}
                        <Button type="button" variant="secondary" className="w-full" onClick={() => void resend()} disabled={sending}>
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {state === "expired" ? "Renew and email again" : "Email the link again"}
                        </Button>
                        <p className="text-xs text-muted-foreground">Sending it again gives it another 7 days.</p>
                    </>
                ) : null}
            </CardContent>
        </Card>
    );
}
