import Link from "next/link";
import { Info } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DocBlock, DocSection } from "@/lib/admin-docs/types";

export function DocArticle({ sections, to }: { sections: DocSection[]; to: (href: string) => string }) {
    return (
        <div className="space-y-10">
            <nav aria-labelledby="doc-contents" className="rounded-lg border p-4">
                <h2 id="doc-contents" className="text-sm font-medium">
                    Contents
                </h2>
                <ol className="mt-1 grid text-sm sm:grid-cols-2 md:mt-2 md:gap-1">
                    {sections.map((s, i) => (
                        <li key={s.id}>
                            <a
                                href={`#${s.id}`}
                                className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline max-md:-mx-2 max-md:flex max-md:min-h-11 max-md:items-center max-md:rounded-md max-md:px-2 max-md:active:bg-press md:active:opacity-60"
                            >
                                {i + 1}. {s.heading}
                            </a>
                        </li>
                    ))}
                </ol>
            </nav>

            {sections.map((s) => (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-20 space-y-3">
                    <h2 id={`${s.id}-title`} className="text-lg font-semibold tracking-tight">
                        {s.heading}
                    </h2>
                    {s.blocks.map((b, i) => (
                        <Block key={i} block={b} to={to} />
                    ))}
                </section>
            ))}
        </div>
    );
}

function Block({ block, to }: { block: DocBlock; to: (href: string) => string }) {
    switch (block.kind) {
        case "p":
            return <p className="max-w-prose text-sm leading-6">{block.text}</p>;
        case "list":
            return (
                <ul className="max-w-prose list-disc space-y-1 pl-5 text-sm leading-6">
                    {block.items.map((item, i) => (
                        <li key={i}>{item}</li>
                    ))}
                </ul>
            );
        case "steps":
            return (
                <ol className="max-w-prose list-decimal space-y-1 pl-5 text-sm leading-6">
                    {block.items.map((item, i) => (
                        <li key={i}>{item}</li>
                    ))}
                </ol>
            );
        case "table":
            return (
                <div className="overflow-x-auto rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {block.head.map((h) => (
                                    <TableHead key={h}>{h}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {block.rows.map((row, i) => (
                                <TableRow key={i}>
                                    {row.map((cell, j) => (
                                        <TableCell key={j} className={j === 0 ? "align-top font-medium" : "align-top whitespace-normal"}>
                                            {cell}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            );
        case "note":
            return (
                <p className="flex max-w-prose gap-2 rounded-lg border bg-muted/40 p-3 text-sm leading-6">
                    <Info className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span>{block.text}</span>
                </p>
            );
        case "links":
            return (
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm max-md:gap-y-0">
                    {block.items.map((l) => (
                        <Link
                            key={l.href + l.label}
                            href={to(l.href)}
                            className="underline underline-offset-4 active:opacity-60 max-md:inline-flex max-md:min-h-11 max-md:items-center"
                        >
                            {l.label}
                        </Link>
                    ))}
                </p>
            );
    }
}
