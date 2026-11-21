"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { previewStarters } from "./actions";

const FRAME_WIDTH = 640;

const RATIO = { portrait: 4 / 3, landscape: 3 / 4 } as const;

type Previews = Record<string, string>;

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

export function ThumbnailFrame({
    id,
    shape = "portrait",
    className,
    html: given,
}: {
    id: string;
    shape?: keyof typeof RATIO;
    className?: string;
    html?: string | null;
}) {
    const [loaded, setHtml] = useState<string | null>(null);
    const own = given !== undefined;
    useEffect(() => {
        if (own) return;
        let live = true;
        void loadPreviews().then((previews) => {
            if (live) setHtml(previews?.[id] ?? null);
        });
        return () => {
            live = false;
        };
    }, [id, own]);
    const html = own ? given : loaded;

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
                    loading={own ? "eager" : "lazy"}
                    tabIndex={-1}
                    className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white"
                    style={{ width: FRAME_WIDTH, height: FRAME_WIDTH * RATIO[shape], transform: `scale(${scale})`, colorScheme: "light" }}
                />
            ) : (
                <div className={cn("absolute inset-0 bg-muted", !(own && given === null) && "animate-pulse")} />
            )}
        </div>
    );
}
