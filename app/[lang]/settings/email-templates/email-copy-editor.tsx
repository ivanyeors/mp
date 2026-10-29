"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Braces, ChevronLeft, Loader2, RotateCcw, Send } from "lucide-react";
import { RichText } from "@/components/block-editor/rich-text";
import { richTextFromWords, richTextWords, type RichTextVariable } from "@/components/block-editor/rich-text-doc";
import { RichTextInline } from "@/components/block-editor/rich-text-view";
import { VariablePalette } from "@/components/block-editor/variable-palette";
import { VariableTargets } from "@/components/block-editor/variable-targets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CopyField, EmailCopy, EmailCopySpec } from "@/lib/email/copy";
import type { SavedCopy } from "@/lib/email/copy-admin";
import { formatAdminDateTime } from "@/lib/format/admin-date";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import { previewEmailCopy, resetEmailCopy, saveEmailCopy, sendEmailCopyTest } from "./actions";
import { copyVariables, isLong, isOneLine } from "./copy-fields";

/** Where this page's Variables go: what the list says above its chips. */
const VARIABLES_HINT = "Drag one into a field, or click where it goes and choose it. Typing { in a field lists them too. Each email fills in its own value.";

/**
 * One field's words in the shared text input, plain (PRD-campaign-email-editor
 * slice 14): no bold, italic, links or lists, the email's Variables as chips.
 * It loads the stored string with each `{name}` as its chip and writes it back
 * the same way, so words nobody touched are saved as they were.
 */
function WordsInput({
    id,
    field,
    words,
    variables,
    invalid,
    describedBy,
    onChange,
}: {
    id: string;
    field: CopyField;
    words: string;
    variables: readonly RichTextVariable[];
    invalid: boolean;
    describedBy?: string;
    onChange: (words: string) => void;
}) {
    const value = useMemo(() => richTextFromWords(words, variables), [words, variables]);
    const long = isLong(field);
    return (
        <RichText
            id={id}
            singleLine={isOneLine(field)}
            aria-labelledby={`${id}-label`}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={value}
            variables={variables}
            className={long ? (field.multiline ? "min-h-32" : "min-h-16") : undefined}
            onChange={(next) => onChange(richTextWords(next))}
        />
    );
}

function Section({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
    return (
        <div className="space-y-4">
            {title ? (
                <div>
                    <p className="text-sm font-semibold">{title}</p>
                    {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
                </div>
            ) : null}
            {children}
        </div>
    );
}

/**
 * Admin Panel → Email templates → one email (PRD-email-templates). Each field
 * is a piece of the email's wording, with the original words one click away;
 * the preview shows the words as typed in any version of the email, with
 * sample data. A test sends what is on screen, saved or not.
 *
 * The email's placeholders are its Variables (PRD-campaign-email-editor slice
 * 14): chips listed beside the fields (in a sheet on a phone), dragged into a
 * field or pressed where the cursor is, or chosen from the list `{` opens.
 * Only this email's own are offered.
 */
export function EmailCopyEditor({
    spec,
    groupLabel,
    variants,
    saved,
    readError,
    staffEmail,
}: {
    spec: EmailCopySpec;
    groupLabel: string;
    /** The email's versions, the main one first. */
    variants: { id: string; label: string }[];
    saved: SavedCopy;
    readError: string | null;
    staffEmail: string;
}) {
    const router = useRouter();
    const locale = getLocaleFromPathname(usePathname() ?? "") ?? DEFAULT_LOCALE;
    const keys = useMemo(() => Object.keys(spec.fields), [spec]);

    const [values, setValues] = useState<EmailCopy>(saved.copy);
    const [savedValues, setSavedValues] = useState<EmailCopy>(saved.copy);
    const dirty = keys.some((k) => values[k] !== savedValues[k]);
    const differsFromOriginal = keys.some((k) => values[k] !== spec.fields[k].default);
    const savedEdited = keys.some((k) => savedValues[k] !== spec.fields[k].default);
    const set = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
    const [busy, setBusy] = useState<"save" | "reset" | "test" | null>(null);

    // ── Preview ────────────────────────────────────────────────────────────
    const [variant, setVariant] = useState(variants[0]?.id ?? "");
    const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
    useEffect(() => {
        let live = true;
        const timer = setTimeout(async () => {
            const res = await previewEmailCopy(spec.id, variant, values).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
            if (!live) return;
            if (res.ok) {
                setPreview({ subject: res.subject, html: res.html });
                setErrors({});
            } else {
                setErrors("fieldErrors" in res && res.fieldErrors ? res.fieldErrors : {});
            }
        }, 400);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [spec.id, variant, values]);

    const save = async () => {
        setBusy("save");
        setStatus(null);
        const res = await saveEmailCopy(spec.id, values);
        setBusy(null);
        if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            setStatus({ ok: false, text: res.error });
            return;
        }
        setSavedValues(values);
        setStatus({ ok: true, text: "Saved. Every email of this kind now sends with these words." });
        router.refresh();
    };

    const reset = async () => {
        if (!window.confirm(`Put "${spec.name}" back to its original words? Your edit is kept in the audit log.`)) return;
        setBusy("reset");
        setStatus(null);
        const res = await resetEmailCopy(spec.id);
        setBusy(null);
        if (!res.ok) return setStatus({ ok: false, text: res.error });
        const original = Object.fromEntries(keys.map((k) => [k, spec.fields[k].default]));
        setValues(original);
        setSavedValues(original);
        setStatus({ ok: true, text: "Back to the original words." });
        router.refresh();
    };

    const [testTo, setTestTo] = useState(staffEmail);
    const sendTest = async () => {
        setBusy("test");
        setStatus(null);
        const addresses = testTo.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
        const res = await sendEmailCopyTest(spec.id, variant, values, addresses);
        setBusy(null);
        if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            return setStatus({ ok: false, text: res.error });
        }
        setStatus({ ok: true, text: `Test sent to ${res.sent} address${res.sent === 1 ? "" : "es"}, with sample data.` });
    };

    // Fields for every version first, then each version's own.
    const sections = useMemo(() => {
        const out: { title?: string; keys: string[] }[] = [{ keys: keys.filter((k) => !spec.fields[k].group) }];
        for (const g of [...new Set(keys.map((k) => spec.fields[k].group).filter((g): g is string => Boolean(g)))]) {
            out.push({ title: g, keys: keys.filter((k) => spec.fields[k].group === g) });
        }
        return out.filter((s) => s.keys.length);
    }, [keys, spec]);

    // The email's placeholders, as the Variables every field offers.
    const variables = useMemo(() => copyVariables(spec), [spec]);
    const [variablesOpen, setVariablesOpen] = useState(false);

    const field = (k: string) => {
        const f = spec.fields[k];
        const id = `copy-${k}`;
        const changed = values[k] !== f.default;
        const note = errors[k] ?? f.hint;
        return (
            <div key={k} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                    <Label id={`${id}-label`}>
                        {f.label}
                        {f.optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
                    </Label>
                    {changed ? (
                        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => set(k, f.default)}>
                            Use the original words
                        </button>
                    ) : null}
                </div>
                <WordsInput
                    id={id}
                    field={f}
                    words={values[k] ?? ""}
                    variables={variables}
                    invalid={Boolean(errors[k])}
                    describedBy={note ? `${id}-note` : undefined}
                    onChange={(words) => set(k, words)}
                />
                {note ? (
                    <p id={`${id}-note`} className={cn("text-xs", errors[k] ? "text-destructive" : "text-muted-foreground")}>
                        {note}
                    </p>
                ) : null}
                {changed ? (
                    <p className="text-xs text-muted-foreground">
                        Original: {f.default ? <RichTextInline value={richTextFromWords(f.default, variables)} variables={variables} /> : "(empty)"}
                    </p>
                ) : null}
            </div>
        );
    };

    return (
        <VariableTargets>
            <div className="space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <Button variant="ghost" size="sm" className="self-start" asChild>
                        <Link href={withLocale("/settings/email-templates", locale)}>
                            <ChevronLeft className="mr-1 h-4 w-4" />
                            Email templates
                        </Link>
                    </Button>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h1 className="text-2xl font-semibold tracking-tight">{spec.name}</h1>
                        <Badge variant={savedEdited ? "default" : "outline"}>{savedEdited ? "Edited" : "Original words"}</Badge>
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    {groupLabel}. {spec.description}
                    {saved.updatedAt ? ` Last edited ${formatAdminDateTime(saved.updatedAt)}${saved.updatedBy ? ` by ${saved.updatedBy}` : ""}.` : ""}
                </p>
                {readError ? (
                    <p role="alert" className="text-sm text-destructive">
                        Couldn&apos;t read the saved words, so the originals are shown: {readError}
                    </p>
                ) : null}

                <div className={cn("grid gap-6", variables.length ? "lg:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)]" : "lg:grid-cols-2")}>
                    {/* On a laptop the Variables sit beside the fields; on a phone they open in a sheet from the Words card. */}
                    {variables.length ? (
                        <aside className="max-lg:hidden" aria-label="Variables">
                            <div className="sticky top-4 space-y-2">
                                <p className="text-sm font-medium">Variables</p>
                                <VariablePalette variables={variables} hint={VARIABLES_HINT} />
                            </div>
                        </aside>
                    ) : null}
                    <div className="min-w-0 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Words</CardTitle>
                                <CardDescription>
                                    Order details, amounts, addresses and links are added by the platform and stay as they are.
                                </CardDescription>
                                {variables.length ? (
                                    <CardAction className="lg:hidden">
                                        <Button type="button" variant="outline" size="sm" onClick={() => setVariablesOpen(true)}>
                                            <Braces className="mr-1 h-4 w-4" />
                                            Variables
                                        </Button>
                                    </CardAction>
                                ) : null}
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {sections.map((s, i) => (
                                    <Section
                                        key={s.title ?? i}
                                        title={s.title ?? (sections.length > 1 ? "In every version" : undefined)}
                                        note={s.title ? "Only in this version of the email." : undefined}
                                    >
                                        {s.keys.map(field)}
                                    </Section>
                                ))}

                                {status ? (
                                    <p role="status" className={status.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>
                                        {status.text}
                                    </p>
                                ) : null}
                                <div className="flex flex-wrap items-center gap-3">
                                    <Button onClick={save} disabled={!dirty || busy !== null}>
                                        {busy === "save" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                                        Save
                                    </Button>
                                    {savedEdited || differsFromOriginal ? (
                                        <Button variant="outline" onClick={reset} disabled={busy !== null || !savedEdited}>
                                            <RotateCcw className="mr-1 h-4 w-4" />
                                            Back to the original words
                                        </Button>
                                    ) : null}
                                    {!dirty ? <span className="text-xs text-muted-foreground">No unsaved changes</span> : null}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Send a test</CardTitle>
                                <CardDescription>
                                    Sends the words on screen, saved or not, with sample data and &ldquo;[Test]&rdquo; before the subject.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                <div className="flex-1 space-y-1.5">
                                    <Label htmlFor="copy-test">Send to</Label>
                                    <Input id="copy-test" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                                </div>
                                <Button variant="outline" onClick={sendTest} disabled={busy !== null}>
                                    {busy === "test" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                                    Send test
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="min-w-0">
                        <CardHeader className="space-y-3">
                            <CardTitle className="text-base">Preview</CardTitle>
                            {variants.length > 1 ? (
                                <Select value={variant} onValueChange={setVariant}>
                                    <SelectTrigger className="w-full justify-between" aria-label="Version">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {variants.map((v) => (
                                            <SelectItem key={v.id} value={v.id}>
                                                {v.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : null}
                            <CardDescription className="break-words">{preview ? `Subject: ${preview.subject}` : "With sample data."}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {preview ? (
                                <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[720px] w-full rounded-md border bg-white" />
                            ) : (
                                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rendering…
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Phones: a tap puts a Variable in where the cursor was, in the field last written in, and closes the sheet. */}
                {variables.length ? (
                    <Sheet open={variablesOpen} onOpenChange={setVariablesOpen}>
                        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
                            <SheetHeader>
                                <SheetTitle>Variables</SheetTitle>
                                <SheetDescription>Each email fills in its own value.</SheetDescription>
                            </SheetHeader>
                            <div className="px-4 pb-6">
                                <VariablePalette
                                    variables={variables}
                                    hint="Tap one to put it in where the cursor was, or type { in a field."
                                    draggable={false}
                                    onInserted={() => setVariablesOpen(false)}
                                />
                            </div>
                        </SheetContent>
                    </Sheet>
                ) : null}
            </div>
        </VariableTargets>
    );
}
