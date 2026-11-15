"use client";

import { useEffect, useRef, useState } from "react";
import { ListTodo, Loader2, Mail, MessageCircle, Plus, RefreshCw, Sparkles, StickyNote, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addDays } from "@/lib/readjustment/eligibility";
import { FOLLOW_UP_TITLE_MAX, type CustomerFollowUp, type CustomerFollowUpsData } from "@/lib/crm/followup-rules";
import { NOTE_MAX_LENGTH, type CustomerNote } from "@/lib/crm/note-rules";
import { MESSAGE_INTENTS, MESSAGE_INTENT_LABELS, type MessageChannel, type MessageIntent } from "@/lib/crm/suggest-message";
import { cn } from "@/lib/utils";
import { announceFollowUpsChanged } from "../followup-parts";
import { CopyButton, useShortcuts } from "./customer-shortcuts";

export type ComposerMode = "note" | "followup" | "email" | "whatsapp";

const MODES: Array<{ key: ComposerMode; label: string; icon: LucideIcon }> = [
    { key: "note", label: "Note", icon: StickyNote },
    { key: "followup", label: "Follow-up", icon: ListTodo },
    { key: "email", label: "Email", icon: Mail },
    { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
];

async function readError(res: Response, fallback: string): Promise<string> {
    const payload = await res.json().catch(() => null);
    return typeof payload?.error === "string" ? payload.error : fallback;
}

/**
 * The Journey's composer (PRD-customer-page-journey slices 04 and 05): one
 * place to add to the story. Four modes:
 *
 *  - **Note**: a Customer note (ADR 0028 (a)), as the Notes card added one.
 *  - **Follow-up**: a dated to-do for a Staff profile, as the Follow-ups card
 *    added one.
 *  - **Email** and **WhatsApp**: a message to the customer, drafted by Claude
 *    on request, edited here, and sent from the Staff member's own Gmail or
 *    WhatsApp (./customer-shortcuts). The platform sends nothing.
 *
 * Rendered only for `customers-edit`: every mode writes or drafts, and the
 * routes refuse without it. The header's buttons choose a mode from outside
 * (`mode`, `focusSignal`).
 */
export function JourneyComposer({
    customerId,
    mode,
    onModeChange,
    focusSignal,
    followUps,
    onNoteAdded,
    onFollowUpAdded,
}: {
    customerId: string;
    mode: ComposerMode;
    onModeChange: (mode: ComposerMode) => void;
    /** Changes when a header button asked for this mode: the field takes the cursor. */
    focusSignal: number;
    /** Who a follow-up may be for, and today; null until read. */
    followUps: CustomerFollowUpsData | null;
    onNoteAdded: (note: CustomerNote) => void;
    onFollowUpAdded: (followUp: CustomerFollowUp) => void;
}) {
    const { phone } = useShortcuts();
    const modes = MODES.filter((m) => m.key !== "whatsapp" || phone);
    const noteRef = useRef<HTMLTextAreaElement>(null);
    const titleRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (focusSignal === 0) return;
        (mode === "note" ? noteRef.current : mode === "followup" ? titleRef.current : null)?.focus({ preventScroll: true });
    }, [focusSignal, mode]);

    return (
        <Card id="composer" className="scroll-mt-28 gap-0 overflow-hidden py-0">
            <div role="tablist" aria-label="Add to the journey" className="flex border-b bg-muted/40">
                {modes.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={mode === key}
                        onClick={() => onModeChange(key)}
                        className={cn(
                            "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 px-2 text-sm font-medium outline-none transition-colors sm:flex-none sm:px-4",
                            "focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-press",
                            mode === key
                                ? "bg-card text-foreground shadow-[inset_0_-2px_0_var(--primary)]"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <Icon className="h-4 w-4 max-sm:hidden" />
                        {label}
                    </button>
                ))}
            </div>
            <div className="p-[var(--card-px,1.5rem)] py-4">
                {mode === "note" ? <NoteForm customerId={customerId} inputRef={noteRef} onAdded={onNoteAdded} /> : null}
                {mode === "followup" ? (
                    <FollowUpForm customerId={customerId} inputRef={titleRef} data={followUps} onAdded={onFollowUpAdded} />
                ) : null}
                {mode === "email" ? <MessageForm key="email" customerId={customerId} channel="email" /> : null}
                {mode === "whatsapp" ? <MessageForm key="whatsapp" customerId={customerId} channel="whatsapp" /> : null}
            </div>
        </Card>
    );
}

function NoteForm({
    customerId,
    inputRef,
    onAdded,
}: {
    customerId: string;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
    onAdded: (note: CustomerNote) => void;
}) {
    const [draft, setDraft] = useState("");
    const [adding, setAdding] = useState(false);

    const add = async () => {
        const body = draft.trim();
        if (!body) return;
        setAdding(true);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/notes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body }),
            });
            if (!res.ok) throw new Error(await readError(res, "Could not save the note"));
            const { row } = (await res.json()) as { row: CustomerNote };
            setDraft("");
            onAdded(row);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not save the note");
        } finally {
            setAdding(false);
        }
    };

    return (
        <div className="space-y-3">
            <Textarea
                ref={inputRef}
                aria-label="New note"
                placeholder="Add a note about this customer…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={NOTE_MAX_LENGTH}
                rows={3}
                className="resize-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Only Staff can read notes. A saved note joins the journey.</p>
                <Button size="sm" onClick={() => void add()} disabled={adding || !draft.trim()}>
                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add note
                </Button>
            </div>
        </div>
    );
}

/** The profile you work as, when it may be given one; otherwise nobody (the picker asks). */
function defaultAssignee(data: CustomerFollowUpsData | null): string {
    if (!data?.me) return "";
    return data.assignees.some((p) => p.id === data.me!.id) ? data.me.id : "";
}

function FollowUpForm({
    customerId,
    inputRef,
    data,
    onAdded,
}: {
    customerId: string;
    inputRef: React.RefObject<HTMLInputElement | null>;
    data: CustomerFollowUpsData | null;
    onAdded: (followUp: CustomerFollowUp) => void;
}) {
    const [title, setTitle] = useState("");
    // Empty until chosen: the defaults (tomorrow in Singapore, the profile you work as) follow the data.
    const [dueChoice, setDueChoice] = useState("");
    const [assigneeChoice, setAssigneeChoice] = useState("");
    const [adding, setAdding] = useState(false);
    const dueOn = dueChoice || (data ? addDays(data.today, 1) : "");
    const assignee = assigneeChoice || defaultAssignee(data);

    const add = async () => {
        if (!title.trim() || !dueOn || !assignee) return;
        setAdding(true);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/followups`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: title.trim(), dueOn, assignedToProfileId: assignee }),
            });
            if (!res.ok) throw new Error(await readError(res, "Could not save the follow-up"));
            const { row } = (await res.json()) as { row: CustomerFollowUp };
            setTitle("");
            announceFollowUpsChanged();
            onAdded(row);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not save the follow-up");
        } finally {
            setAdding(false);
        }
    };

    if (!data) {
        return (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading who a follow-up can be for…
            </p>
        );
    }

    return (
        <div className="space-y-3">
            <Input
                ref={inputRef}
                id="followup-title"
                aria-label="New follow-up"
                placeholder="e.g. Call about her second pillow"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={FOLLOW_UP_TITLE_MAX}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        void add();
                    }
                }}
            />
            <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                    <Label htmlFor="followup-due" className="text-xs text-muted-foreground">
                        Due
                    </Label>
                    <Input id="followup-due" type="date" value={dueOn} onChange={(e) => setDueChoice(e.target.value)} className="w-40" />
                </div>
                <div className="min-w-0 space-y-1">
                    <Label className="text-xs text-muted-foreground">For</Label>
                    <Select value={assignee} onValueChange={setAssigneeChoice}>
                        <SelectTrigger aria-label="Assign to" className="w-44 min-w-0">
                            <SelectValue placeholder="Who is it for?" />
                        </SelectTrigger>
                        <SelectContent sheetTitle="Assign to">
                            {data.assignees.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Button size="sm" className="ml-auto" onClick={() => void add()} disabled={adding || !title.trim() || !dueOn || !assignee}>
                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add follow-up
                </Button>
            </div>
        </div>
    );
}

/**
 * Email or WhatsApp: pick what it is about, press *Generate suggestion* to
 * have Claude draft it through the API, edit, then open it in Gmail or
 * WhatsApp with the text filled in. Choosing a subject drafts nothing: Claude
 * is called only on that press (owner, 2026-11-15). Blank is always there:
 * the buttons work with nothing drafted.
 */
function MessageForm({ customerId, channel }: { customerId: string; channel: MessageChannel }) {
    const { device, openEmail, openWhatsApp, emailOpens, whatsappOpens } = useShortcuts();
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [intent, setIntent] = useState<MessageIntent>("check_in");
    const [drafting, setDrafting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [drafted, setDrafted] = useState(false);

    const draft = async () => {
        setDrafting(true);
        setError(null);
        try {
            const res = await fetch(`/api/settings/customers/${customerId}/suggest-message`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ channel, intent }),
            });
            if (!res.ok) throw new Error(await readError(res, "Could not draft a message"));
            const payload = (await res.json()) as { subject: string | null; body: string };
            setSubject(payload.subject ?? "");
            setBody(payload.body);
            setDrafted(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not draft a message");
        } finally {
            setDrafting(false);
        }
    };

    const open = () => (channel === "email" ? openEmail({ subject, body }) : openWhatsApp(body));
    const whole = channel === "email" && subject.trim() ? `Subject: ${subject.trim()}\n\n${body}` : body;

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                    Claude can suggest a message for you to edit. Nothing is drafted until you press Generate suggestion.
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="What the message is about">
                    {MESSAGE_INTENTS.map((key) => (
                        <Button
                            key={key}
                            type="button"
                            size="sm"
                            variant={intent === key ? "secondary" : "outline"}
                            aria-pressed={intent === key}
                            className={cn("h-8 rounded-full px-3 text-xs", intent === key && "border border-foreground/40")}
                            disabled={drafting}
                            onClick={() => setIntent(key)}
                        >
                            {MESSAGE_INTENT_LABELS[key]}
                        </Button>
                    ))}
                </div>
                <Button type="button" size="sm" variant={drafted ? "ghost" : "default"} disabled={drafting} onClick={() => void draft()}>
                    {drafting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : drafted ? (
                        <RefreshCw className="h-4 w-4" />
                    ) : (
                        <Sparkles className="h-4 w-4" />
                    )}
                    {drafted ? "Generate again" : "Generate suggestion"}
                </Button>
            </div>

            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error} You can still write it yourself below.
                </p>
            ) : null}

            {channel === "email" ? (
                <Input aria-label="Subject" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            ) : null}
            <Textarea
                aria-label={channel === "email" ? "Email" : "WhatsApp message"}
                placeholder={channel === "email" ? "Write the email, or generate a suggestion above…" : "Write the message, or generate a suggestion above…"}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={channel === "email" ? 7 : 4}
                className="resize-y"
            />
            {drafted ? <p className="text-xs text-muted-foreground">Drafted by Claude. Check every fact before you send it.</p> : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                    Opens {channel === "email" ? emailOpens : (whatsappOpens ?? "WhatsApp")}.
                </p>
                <div className="flex flex-wrap gap-2">
                    <CopyButton text={whole} variant="outline" />
                    <Button type="button" size="sm" onClick={open}>
                        {channel === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                        {channel === "email" ? (device === "android" ? "Open in mail app" : "Open in Gmail") : "Open WhatsApp"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
