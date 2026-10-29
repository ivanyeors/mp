"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { previewStarters } from "./actions";

/**
 * A Starter's thumbnail (PRD-campaign-email-editor slice 08), or a blank
 * email's: the email as the real renderer draws it on its placeholders,
 * shrunk into a card, never a screenshot, so it can't drift from what the
 * Starter puts in. The renders are asked for once, when the first thumbnail
 * shows (the Start panel, the palette's Starters tab), not with the page; a
 * failed ask is asked again by the next thumbnail to show. In a frame that
 * runs nothing and can't be reached, and decorative: the card's words name it.
 * Loaded itself when the first thumbnail shows (`StarterThumbnail`).
 */

/** The frame's width before it is shrunk: the shell's 600px column with its padding, as the preview's Desktop. */
const FRAME_WIDTH = 640;

/** How much of the email a thumbnail shows, from its top: as tall as wide by 4 to 3, or 3 to 4. */
const RATIO = { portrait: 4 / 3, landscape: 3 / 4 } as const;

type Previews = Record<string, string>;

/** Every thumbnail's HTML, asked for once while the page is open. */
let asked: Promise<Previews | null> | null = null;

function loadPreviews(): Promise<Previews | null> {
    asked ??= Promise.resolve()
        .then(() => previewStarters())
        .then((r) => (r.ok ? r.previews : null))
        .catch(() => null)
        .then((previews) => {
            if (!previews) asked = null;
            return previews;
        });
    return asked;
}

export function ThumbnailFrame({ id, shape = "portrait", className }: { id: string; shape?: keyof typeof RATIO; className?: string }) {
    const [html, setHtml] = useState<string | null>(null);
    useEffect(() => {
        let live = true;
        void loadPreviews().then((previews) => {
            if (live) setHtml(previews?.[id] ?? null);
        });
        return () => {
            live = false;
        };
    }, [id]);

    const box = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const el = box.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const scale = width ? width / FRAME_WIDTH : 0.25;

    return (
        <div
            ref={box}
            data-thumbnail={id}
            className={cn("relative w-full overflow-hidden rounded-sm border bg-white", shape === "portrait" ? "aspect-[3/4]" : "aspect-[4/3]", className)}
        >
            {html ? (
                <iframe
                    title=""
                    srcDoc={html}
                    sandbox=""
                    loading="lazy"
                    tabIndex={-1}
                    className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white"
                    // The email in light, as its card is, as the preview's Light toggle asks for it.
                    style={{ width: FRAME_WIDTH, height: FRAME_WIDTH * RATIO[shape], transform: `scale(${scale})`, colorScheme: "light" }}
                />
            ) : (
                <div className="absolute inset-0 animate-pulse bg-muted" />
            )}
        </div>
    );
}
