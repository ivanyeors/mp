"use client";

import { useLayoutEffect, useRef, type ChangeEvent, type ComponentProps } from "react";
import { Textarea } from "@/components/ui/textarea";

export function SentenceField({ onChange, ...props }: ComponentProps<typeof Textarea>) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || CSS.supports("field-sizing", "content")) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight + 2}px`;
    }, [props.value]);
    return (
        <Textarea
            ref={ref}
            rows={1}
            className="min-h-9 resize-none max-md:min-h-11"
            onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
            }}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                if (/[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*[\r\n]+\s*/g, " ");
                onChange?.(e);
            }}
            {...props}
        />
    );
}
