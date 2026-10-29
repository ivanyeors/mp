"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BellOff, Loader2, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { formatAdminDateMY } from "@/lib/format/admin-date";
import {
    PREFERENCE_NOTE_MAX,
    WHATSAPP_MARKETING_OFF_NOTICE,
    changedBy,
    describeStopRequest,
    describeSwitch,
    type AftercarePreference,
    type AftercareView,
} from "@/lib/aftercare/state";

const LABEL: Record<AftercarePreference, string> = {
    aftercare_email: "Aftercare by email",
    aftercare_whatsapp: "Aftercare by WhatsApp",
};

const CHANNEL: Record<AftercarePreference, string> = {
    aftercare_email: "Email",
    aftercare_whatsapp: "WhatsApp",
};

type Pending = { preference: AftercarePreference; value: boolean };

/**
 * The manual switch (PRD customer-crm slice 13): Aftercare by email and by
 * WhatsApp, each with its last change, for a customer who asks to stop by
 * email reply, on WhatsApp or in person. Every change is recorded with who,
 * how and when, and listed below.
 *
 * Seeing it needs `customers`; the switches work only with `customers-edit`.
 * A view-only role sees the same switches, disabled, and the same history.
 *
 * Its own fetch, like the orders and addresses panels beside it, unless the
 * page hands it `initialView`.
 *
 * It sits directly under slice 11's Contact and sign-in card rather than
 * inside it (CRM 11 build notes): that card only reads facts, and these
 * switches change things, with a dialog, a note and a history of their own.
 */
export function AftercareCard({
    customerId,
    canEdit,
    initialView,
}: {
    customerId: string;
    canEdit: boolean;
    initialView?: AftercareView;
}) {
    const [view, setView] = useState<AftercareView | null>(initialView ?? null);
    const [loading, setLoading] = useState(!initialView);
    const hydrated = useRef(Boolean(initialView));
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pending, setPending] = useState<Pending | null>(null);
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/aftercare`);
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setLoadError(json?.error ?? "Could not load aftercare settings.");
                return;
            }
            setView(json.view as AftercareView);
        } catch {
            setLoadError("Could not load aftercare settings.");
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    useEffect(() => {
        if (hydrated.current) {
            hydrated.current = false;
            return;
        }
        load();
    }, [load]);

    const ask = (preference: AftercarePreference, value: boolean) => {
        setNote("");
        setSaveError(null);
        setPending({ preference, value });
    };

    // Turning WhatsApp on records the customer's consent: Staff say how, when
    // and to what they agreed. Every other change takes an optional note.
    const noteRequired = pending?.preference === "aftercare_whatsapp" && pending.value;

    const confirm = async () => {
        if (!pending) return;
        if (noteRequired && !note.trim()) {
            setSaveError("Say how and when the customer agreed, and to what.");
            return;
        }
        setSaving(true);
        setSaveError(null);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/aftercare`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    preference: pending.preference,
                    value: pending.value,
                    ...(note.trim() ? { note: note.trim() } : {}),
                }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setSaveError(json?.error ?? "Could not save that change.");
                return;
            }
            if (json.view) setView(json.view as AftercareView);
            else await load();
            setPending(null);
        } catch {
            setSaveError("Could not save that change.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <BellOff className="h-4 w-4" />
                    Aftercare
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading && !view ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : loadError && !view ? (
                    <p className="text-sm text-destructive">{loadError}</p>
                ) : view ? (
                    <>
                        <SwitchRow
                            icon={<Mail className="h-3.5 w-3.5" />}
                            label={LABEL.aftercare_email}
                            id="aftercare-email-switch"
                            on={view.email.on}
                            status={describeSwitch("aftercare_email", view.email.on, view.email.last)}
                            canEdit={canEdit}
                            onChange={(value) => ask("aftercare_email", value)}
                        />
                        <SwitchRow
                            icon={<MessageCircle className="h-3.5 w-3.5" />}
                            label={LABEL.aftercare_whatsapp}
                            id="aftercare-whatsapp-switch"
                            on={view.whatsapp.on}
                            status={describeSwitch("aftercare_whatsapp", view.whatsapp.on, view.whatsapp.last)}
                            canEdit={canEdit}
                            onChange={(value) => ask("aftercare_whatsapp", value)}
                        >
                            {view.whatsapp.stopRequestedAt ? (
                                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                    {describeStopRequest(view.whatsapp.stopRequestedAt)}
                                </p>
                            ) : null}
                            {view.whatsapp.marketingOff ? (
                                <p className="text-xs text-muted-foreground">{WHATSAPP_MARKETING_OFF_NOTICE}</p>
                            ) : null}
                        </SwitchRow>

                        <div className="space-y-2 border-t pt-3">
                            <p className="text-xs font-medium text-muted-foreground">History</p>
                            {view.history.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No changes yet.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {view.history.map((e, i) => (
                                        <li key={`${e.createdAt}-${i}`} className="text-xs">
                                            <p>
                                                <span className="font-medium">
                                                    {CHANNEL[e.preference]} {e.toValue ? "on" : "off"}
                                                </span>{" "}
                                                <span className="text-muted-foreground">
                                                    · {changedBy(e)} · {formatAdminDateMY(e.createdAt)}
                                                </span>
                                            </p>
                                            {e.note ? <p className="text-muted-foreground">{e.note}</p> : null}
                                            {e.wording ? (
                                                <p className="text-muted-foreground italic">
                                                    Agreed to: “{e.wording}”
                                                </p>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </>
                ) : null}
            </CardContent>

            <Dialog open={pending !== null} onOpenChange={(open) => !open && !saving && setPending(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {pending
                                ? `Turn ${pending.value ? "on" : "off"} ${LABEL[pending.preference].toLowerCase()}?`
                                : ""}
                        </DialogTitle>
                        <DialogDescription>
                            {noteRequired
                                ? "WhatsApp needs the customer's own agreement. Record how and when they agreed, and to what."
                                : "Add a note if it helps, for example how the customer asked."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <Label htmlFor="aftercare-note">
                            Note{" "}
                            {noteRequired ? null : (
                                <span className="text-muted-foreground font-normal">(optional)</span>
                            )}
                        </Label>
                        <Textarea
                            id="aftercare-note"
                            value={note}
                            maxLength={PREFERENCE_NOTE_MAX}
                            rows={3}
                            className="resize-none"
                            placeholder={
                                noteRequired
                                    ? "agreed at the studio on 20 Oct to the review request and the paid yearly check-up"
                                    : "asked on WhatsApp"
                            }
                            onChange={(e) => setNote(e.target.value)}
                        />
                        {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPending(null)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button onClick={confirm} disabled={saving || (noteRequired && !note.trim())}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {pending?.value ? "Switch on" : "Switch off"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

function SwitchRow({
    icon,
    label,
    id,
    on,
    status,
    canEdit,
    onChange,
    children,
}: {
    icon: ReactNode;
    label: string;
    id: string;
    on: boolean;
    status: string;
    canEdit: boolean;
    onChange: (value: boolean) => void;
    children?: ReactNode;
}) {
    return (
        <div className="space-y-1">
            {/* The whole label row toggles the switch: a 44px target on a phone. */}
            <div className="flex items-center justify-between gap-3">
                <Label
                    htmlFor={id}
                    className={`flex flex-1 items-center gap-1.5 text-sm font-medium max-md:-ml-2 max-md:min-h-11 max-md:rounded-md max-md:pl-2 ${
                        canEdit ? "cursor-pointer transition-colors active:bg-press" : ""
                    }`}
                >
                    {icon}
                    {label}
                </Label>
                <Switch
                    id={id}
                    checked={on}
                    disabled={!canEdit}
                    title={canEdit ? undefined : "Changing this needs the \"Customers: make changes\" permission"}
                    onCheckedChange={onChange}
                />
            </div>
            <p className="text-xs text-muted-foreground">{status}</p>
            {children}
        </div>
    );
}
