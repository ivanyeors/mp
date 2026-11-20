"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy, Mail, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NOTE_MAX_LENGTH } from "@/lib/crm/note-rules";
import {
    contactDevice,
    emailLink,
    sentNote,
    telLink,
    whatsappLink,
    type ContactDevice,
    type SentChannel,
} from "@/lib/crm/contact-links";
import { cn } from "@/lib/utils";

type Message = { subject?: string | null; body?: string | null };

type Shortcuts = {
    device: ContactDevice;
    email: string;
    phone: string | null;
    openEmail: (message?: Message) => void;
    openWhatsApp: (text?: string | null) => void;
    emailOpens: string;
    whatsappOpens: string | null;
};

const ShortcutsContext = createContext<Shortcuts | null>(null);

export function useShortcuts(): Shortcuts {
    const value = useContext(ShortcutsContext);
    if (!value) throw new Error("useShortcuts needs a CustomerShortcutsProvider");
    return value;
}

const subscribeToNothing = () => () => {};

const IPHONE_FALLBACK_MS = 1500;

export function CustomerShortcutsProvider({
    customerId,
    email,
    phone,
    canLog,
    onLogged,
    children,
}: {
    customerId: string;
    email: string;
    phone: string | null;
    canLog: boolean;
    onLogged: () => void;
    children: ReactNode;
}) {
    const device = useSyncExternalStore<ContactDevice>(
        subscribeToNothing,
        () => contactDevice(navigator.userAgent, navigator.maxTouchPoints),
        () => "computer",
    );

    const onLoggedRef = useRef(onLogged);
    useEffect(() => {
        onLoggedRef.current = onLogged;
    }, [onLogged]);

    const reachable = whatsappLink(phone, null, device) !== null;

    const askIfSent = useCallback(
        (channel: SentChannel, message: Message) => {
            if (!canLog) return;
            const what = channel === "email" ? "email" : "WhatsApp message";
            const id = toast(`Did you send the ${what}?`, {
                description: "Sent it adds a note to the journey, so the next person knows.",
                duration: Infinity,
                action: {
                    label: "Sent it",
                    onClick: () => {
                        void (async () => {
                            try {
                                const res = await fetch(`/api/shop/customers/${customerId}/notes`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ body: sentNote(channel, message, NOTE_MAX_LENGTH) }),
                                });
                                if (!res.ok) {
                                    const payload = await res.json().catch(() => null);
                                    throw new Error(typeof payload?.error === "string" ? payload.error : "Could not add it to the journey");
                                }
                                toast.success("Added to the journey");
                                onLoggedRef.current();
                            } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Could not add it to the journey");
                            }
                        })();
                    },
                },
                cancel: { label: "Didn't send", onClick: () => toast.dismiss(id) },
            });
        },
        [canLog, customerId],
    );

    const openEmail = useCallback(
        (message: Message = {}) => {
            const link = emailLink({ to: email, ...message }, device);
            if (device === "computer") {
                window.open(link.href, "_blank", "noopener,noreferrer");
            } else {
                window.location.href = link.href;
                if (link.fallback) {
                    const fallback = link.fallback;
                    window.setTimeout(() => {
                        if (document.visibilityState === "visible") window.location.href = fallback;
                    }, IPHONE_FALLBACK_MS);
                }
            }
            askIfSent("email", message);
        },
        [askIfSent, device, email],
    );

    const openWhatsApp = useCallback(
        (text?: string | null) => {
            const link = whatsappLink(phone, text, device);
            if (!link) return;
            window.open(link.href, "_blank", "noopener,noreferrer");
            askIfSent("whatsapp", { body: text });
        },
        [askIfSent, device, phone],
    );

    const value = useMemo<Shortcuts>(
        () => ({
            device,
            email,
            phone: reachable ? phone : null,
            openEmail,
            openWhatsApp,
            emailOpens: emailLink({ to: email }, device).opens,
            whatsappOpens: whatsappLink(phone, null, device)?.opens ?? null,
        }),
        [device, email, phone, reachable, openEmail, openWhatsApp],
    );

    return <ShortcutsContext.Provider value={value}>{children}</ShortcutsContext.Provider>;
}

type ButtonSize = "sm" | "default";

export function EmailButton({ size = "sm", className }: { size?: ButtonSize; className?: string }) {
    const { openEmail, emailOpens } = useShortcuts();
    return (
        <Button type="button" variant="outline" size={size} className={className} title={`Opens ${emailOpens}`} onClick={() => openEmail()}>
            <Mail className="h-4 w-4" />
            Email
        </Button>
    );
}

export function WhatsAppButton({ size = "sm", className }: { size?: ButtonSize; className?: string }) {
    const { phone, openWhatsApp, whatsappOpens } = useShortcuts();
    if (!phone) return null;
    return (
        <Button
            type="button"
            variant="outline"
            size={size}
            className={className}
            title={whatsappOpens ? `Opens ${whatsappOpens}` : undefined}
            onClick={() => openWhatsApp()}
        >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
        </Button>
    );
}

export function CallButton({ className }: { className?: string }) {
    const { phone } = useShortcuts();
    const href = telLink(phone);
    if (!href) return null;
    return (
        <Button asChild variant="outline" size="sm" className={className}>
            <a href={href}>
                <Phone className="h-4 w-4" />
                Call
            </a>
        </Button>
    );
}

export function CopyButton({
    text,
    label = "Copy",
    variant = "ghost",
    className,
}: {
    text: string;
    label?: string;
    variant?: "ghost" | "outline";
    className?: string;
}) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            toast.error("Could not copy. Select the text and copy it by hand.");
        }
    };
    return (
        <Button type="button" variant={variant} size="sm" className={cn(className)} onClick={() => void copy()} disabled={!text}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : label}
        </Button>
    );
}
