"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { PresetPicker } from "@/components/block-editor/preset-picker";

export type PreviewDevice = "desktop" | "mobile";
export type PreviewScheme = "light" | "dark";

export const INBOX_CUT = { sender: 20, subject: 35, preview: 45 } as const;

const FRAME_WIDTH: Record<PreviewDevice, number> = { desktop: 640, mobile: 375 };
const VIEW_HEIGHT = 680;

export function inboxCut(text: string, max: number): string {
    const t = text.replace(/\s+/g, " ").trim();
    return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function senderName(from: string | null): string | null {
    if (!from) return null;
    const named = /^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/.exec(from);
    return (named?.[1] || from).trim() || null;
}

function inboxLineOf(html: string): string {
    if (typeof DOMParser === "undefined") return "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    const first = doc.body.firstElementChild as HTMLElement | null;
    const hidden = first && /display:\s*none/i.test(first.getAttribute("style") ?? "") ? first : null;
    return (hidden?.textContent ?? "").replace(/[\u200c\u00a0]/g, " ").replace(/\s+/g, " ").trim();
}

const HIGHLIGHT = "mp-editor-selected";

export function EmailPreview({
    html,
    subject,
    from,
    error,
    device,
    onDevice,
    scheme,
    onScheme,
    selected,
    onSelectBlock,
}: {
    html: string | null;
    subject: string;
    from: string | null;
    error: string | null;
    device: PreviewDevice;
    onDevice: (d: PreviewDevice) => void;
    scheme: PreviewScheme;
    onScheme: (s: PreviewScheme) => void;
    selected: string | null;
    onSelectBlock: (id: string) => void;
}) {
    const box = useRef<HTMLDivElement>(null);
    const frame = useRef<HTMLIFrameElement>(null);
    const [width, setWidth] = useState<number>(FRAME_WIDTH.desktop);
    useEffect(() => {
        const el = box.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || FRAME_WIDTH.desktop));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const frameWidth = FRAME_WIDTH[device];
    const scale = Math.min(1, width / frameWidth);
    const preview = html ? inboxLineOf(html) : "";
    const sender = senderName(from) ?? "Mpillow";

    const latest = useRef({ onSelectBlock, selected });
    useEffect(() => {
        latest.current = { onSelectBlock, selected };
    });
    const wire = () => {
        const doc = frame.current?.contentDocument;
        if (!doc) return;
        doc.addEventListener("click", (e) => {
            const target = e.target instanceof doc.defaultView!.Element ? e.target : null;
            if (target?.closest("a")) e.preventDefault();
            const id = target?.closest("[data-block-id]")?.getAttribute("data-block-id");
            if (id) latest.current.onSelectBlock(id);
        });
        const style = doc.createElement("style");
        style.textContent = `.${HIGHLIGHT}{outline:2px solid #2563eb;outline-offset:4px;border-radius:4px}[data-block-id]{cursor:pointer}`;
        doc.head?.append(style);
        mark(doc, latest.current.selected);
    };
    useEffect(() => {
        const doc = frame.current?.contentDocument;
        if (doc) mark(doc, selected);
    }, [selected]);

    return (
        <div className="space-y-3">
            <div className="rounded-lg border bg-background p-3" aria-label="How the inbox lists it">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Inbox</p>
                <div className="flex items-start gap-3">
                    <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {sender.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 text-sm">
                        <p className="truncate font-semibold">{inboxCut(sender, INBOX_CUT.sender)}</p>
                        <p className="truncate font-medium" title={subject}>
                            {subject ? inboxCut(subject, INBOX_CUT.subject) : <span className="italic text-muted-foreground">No subject yet</span>}
                        </p>
                        <p className="truncate text-muted-foreground" title={preview}>
                            {preview ? inboxCut(preview, INBOX_CUT.preview) : "\u00a0"}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <PresetPicker
                    label="Show on"
                    value={device}
                    options={[
                        { value: "desktop", label: "Desktop" },
                        { value: "mobile", label: "Mobile" },
                    ]}
                    onChange={onDevice}
                />
                <PresetPicker
                    label="Mode"
                    value={scheme}
                    options={[
                        { value: "light", label: "Light" },
                        { value: "dark", label: "Dark" },
                    ]}
                    onChange={onScheme}
                />
            </div>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <div ref={box} className="overflow-hidden rounded-md border bg-muted/30" style={{ height: VIEW_HEIGHT }}>
                {html ? (
                    <iframe
                        ref={frame}
                        title="Email preview"
                        srcDoc={html}
                        sandbox="allow-same-origin"
                        onLoad={wire}
                        className="block border-0 bg-white"
                        style={{
                            width: frameWidth,
                            height: VIEW_HEIGHT / scale,
                            transform: `scale(${scale})`,
                            transformOrigin: "top left",
                            marginLeft: Math.max(0, (width - frameWidth * scale) / 2),
                            colorScheme: scheme,
                        }}
                    />
                ) : (
                    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rendering…
                    </div>
                )}
            </div>
        </div>
    );
}

function mark(doc: Document, selected: string | null) {
    for (const el of doc.querySelectorAll(`.${HIGHLIGHT}`)) el.classList.remove(HIGHLIGHT);
    if (!selected) return;
    doc.querySelector(`[data-block-id="${selected}"]`)?.classList.add(HIGHLIGHT);
}
