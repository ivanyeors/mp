"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    readUnsubscribedList,
    type DefaultConsentCounts,
} from "@/lib/customer-migration/default-consent";
import { MAX_FILE_BYTES } from "@/lib/customer-migration/preview";
import { previewDefaultConsent, subscribeImportedByDefault } from "./actions";

const int = new Intl.NumberFormat("en-SG");
const people = (n: number) => `${int.format(n)} ${n === 1 ? "customer" : "customers"}`;

/** The list given: a file read in this tab, or the owner's word that there is none. */
type List = { kind: "file"; name: string; emails: string[]; rows: number; skipped: number } | { kind: "none" };

type Phase =
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "ready"; counts: DefaultConsentCounts }
    | { kind: "running"; counts: DefaultConsentCounts }
    | { kind: "done"; counts: DefaultConsentCounts }
    | { kind: "error"; error: string };

/**
 * *Subscribe imported customers* (owner, 2026-10-31; ADR 0037): every imported
 * customer starts subscribed to marketing email, except the people who
 * unsubscribed in Shopify. Shopify's export says "no" for them and for people
 * nobody asked alike, so nothing runs until the owner gives Shopify's
 * unsubscribed list, or says nobody is on it. The preview and the run are the
 * same SQL function, so the numbers shown are the numbers written.
 */
export function DefaultConsentCard({ counts }: { counts: DefaultConsentCounts | null }) {
    const router = useRouter();
    const [list, setList] = useState<List | null>(null);
    const [phase, setPhase] = useState<Phase>({ kind: "idle" });
    const [fileError, setFileError] = useState<string | null>(null);

    if (counts === null) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Subscribe imported customers</CardTitle>
                    <CardDescription>
                        Could not read the imported customers&apos; marketing choices. Reload the page.
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }
    if (counts.imported === 0) return null;

    const emails = list?.kind === "file" ? list.emails : [];

    const check = async (next: List | null) => {
        setList(next);
        if (!next) {
            setPhase({ kind: "idle" });
            return;
        }
        setPhase({ kind: "checking" });
        const res = await previewDefaultConsent(next.kind === "file" ? next.emails : []);
        setPhase(res.ok ? { kind: "ready", counts: res.counts } : { kind: "error", error: res.error });
    };

    // Read in this tab; only the emails go to the server, to keep those people unsubscribed.
    const onPick = async (input: HTMLInputElement) => {
        const file = input.files?.[0];
        input.value = "";
        setFileError(null);
        if (!file) return;
        if (file.size > MAX_FILE_BYTES) {
            setFileError("This file is over 20 MB. Export it again from Shopify as a Plain CSV file.");
            return;
        }
        try {
            const read = readUnsubscribedList(await file.text());
            if (!read.ok) {
                setFileError(read.error);
                return;
            }
            await check({ kind: "file", name: file.name, emails: read.emails, rows: read.rows, skipped: read.skipped });
        } catch {
            setFileError("This file could not be read. Pick it again.");
        }
    };

    const run = async () => {
        if (phase.kind !== "ready") return;
        setPhase({ kind: "running", counts: phase.counts });
        const res = await subscribeImportedByDefault(emails);
        if (!res.ok) {
            setPhase({ kind: "error", error: res.error });
            return;
        }
        setPhase({ kind: "done", counts: res.counts });
        setList(null);
        router.refresh();
    };

    const preview = phase.kind === "ready" || phase.kind === "running" ? phase.counts : null;
    const changes = preview ? preview.toSubscribe + preview.toUnsubscribe : 0;
    const busy = phase.kind === "checking" || phase.kind === "running";

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Subscribe imported customers</CardTitle>
                <CardDescription>
                    Imported customers start subscribed to marketing email, unless they unsubscribed. Shopify&apos;s
                    export says &ldquo;no&rdquo; both for people nobody asked and for people who unsubscribed, so give
                    Shopify&apos;s list of the people who unsubscribed first. They stay unsubscribed.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm">
                    <span className="font-medium">{int.format(counts.toSubscribe)}</span> of{" "}
                    {int.format(counts.imported)} imported customers are not subscribed yet.{" "}
                    <span className="text-muted-foreground">
                        {int.format(counts.alreadySubscribed)} {counts.alreadySubscribed === 1 ? "is" : "are"}{" "}
                        subscribed, and {int.format(counts.stayUnsubscribed)} unsubscribed here.
                    </span>
                </p>

                {phase.kind === "done" ? (
                    <div
                        role="status"
                        className="flex items-start gap-3 rounded-lg border border-emerald-300/60 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-100"
                    >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <p>
                            Subscribed {people(phase.counts.subscribed ?? 0)}
                            {phase.counts.unsubscribed
                                ? `, and unsubscribed ${people(phase.counts.unsubscribed)} on Shopify's list`
                                : ""}
                            . Each one&apos;s history says how. Run this again after the next import.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="grid gap-1.5">
                            <Label htmlFor="shopify-unsubscribed">Shopify&apos;s unsubscribed list</Label>
                            <p className="text-sm text-muted-foreground">
                                In Shopify admin: Customers → filter Email subscription status is Unsubscribed →
                                Export → Plain CSV file.
                            </p>
                            <Input
                                id="shopify-unsubscribed"
                                type="file"
                                accept=".csv"
                                disabled={busy || list?.kind === "none"}
                                onChange={(e) => void onPick(e.currentTarget)}
                                className="max-w-md"
                            />
                            {list?.kind === "file" && (
                                <p className="text-sm text-muted-foreground">
                                    {list.name}: {int.format(list.emails.length)} emails
                                    {list.skipped ? `, ${int.format(list.skipped)} rows without one` : ""}.
                                </p>
                            )}
                            {fileError && <p className="text-sm text-destructive">{fileError}</p>}
                            <p className="flex items-start gap-2 text-sm text-muted-foreground">
                                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                                Only the emails are sent, to keep those people unsubscribed. The file is not stored.
                            </p>
                        </div>

                        <div className="flex items-start gap-2">
                            <Checkbox
                                id="nobody-unsubscribed"
                                checked={list?.kind === "none"}
                                disabled={busy || list?.kind === "file"}
                                onCheckedChange={(v) => void check(v === true ? { kind: "none" } : null)}
                            />
                            <Label htmlFor="nobody-unsubscribed" className="font-normal">
                                Nobody has unsubscribed in Shopify
                            </Label>
                        </div>

                        {phase.kind === "checking" && (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Counting…
                            </p>
                        )}

                        {preview && (
                            <ul className="list-disc space-y-1 pl-5 text-sm">
                                {list?.kind === "file" && (
                                    <li>
                                        {int.format(preview.listed)} on Shopify&apos;s list, of whom{" "}
                                        {int.format(preview.listedCustomers)} are customers here:{" "}
                                        {people(preview.toUnsubscribe)} will be unsubscribed.
                                    </li>
                                )}
                                <li>
                                    {people(preview.toSubscribe)} will be subscribed. Every marketing email has a
                                    one-click unsubscribe.
                                </li>
                            </ul>
                        )}

                        {phase.kind === "error" && (
                            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                                {phase.error}
                            </p>
                        )}

                        <Button disabled={phase.kind !== "ready" || changes === 0} onClick={() => void run()}>
                            {phase.kind === "running" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                            {preview && preview.toSubscribe === 0 && preview.toUnsubscribe > 0
                                ? `Unsubscribe ${people(preview.toUnsubscribe)}`
                                : `Subscribe ${people(preview?.toSubscribe ?? counts.toSubscribe)}`}
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
