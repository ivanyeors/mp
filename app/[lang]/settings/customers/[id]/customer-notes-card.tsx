"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatAdminDateMY, formatAdminDateTimeMY } from "@/lib/format/admin-date";
import { NOTE_MAX_LENGTH, canDeleteNote, type CustomerNote } from "@/lib/crm/note-rules";

export type CustomerNotesViewer = {
    userId: string;
    /** Owner or Admin: may delete anyone's note. */
    grantsAll: boolean;
    /** May add and delete notes. */
    canEdit: boolean;
};

async function readError(res: Response, fallback: string): Promise<string> {
    const payload = await res.json().catch(() => null);
    return typeof payload?.error === "string" ? payload.error : fallback;
}

/**
 * Customer notes (ADR 0028 (a)): Staff-only, newest first, each with its author
 * and date. Never edited — a correction is a new note — and deleted only by the
 * author or an Owner or Admin. The customer cannot read them.
 */
export function CustomerNotesCard({
    customerId,
    initialNotes,
    viewer,
}: {
    customerId: string;
    /** null when the server could not read them: the card offers to try again. */
    initialNotes: CustomerNote[] | null;
    viewer: CustomerNotesViewer;
}) {
    const [notes, setNotes] = useState<CustomerNote[] | null>(initialNotes);
    const [reloading, setReloading] = useState(false);
    const [draft, setDraft] = useState("");
    const [adding, setAdding] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const reload = async () => {
        setReloading(true);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/notes`);
            if (!res.ok) throw new Error(await readError(res, "Could not load notes"));
            setNotes(((await res.json()).rows ?? []) as CustomerNote[]);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not load notes");
        } finally {
            setReloading(false);
        }
    };

    const addNote = async () => {
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
            setNotes((prev) => [row, ...(prev ?? [])]);
            setDraft("");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not save the note");
        } finally {
            setAdding(false);
        }
    };

    const deleteNote = async (note: CustomerNote) => {
        if (!window.confirm("Delete this note? Staff will no longer see it.")) return;
        setDeletingId(note.id);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/notes/${note.id}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error(await readError(res, "Could not delete the note"));
            setNotes((prev) => (prev ?? []).filter((n) => n.id !== note.id));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not delete the note");
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base">Notes</CardTitle>
                <p className="text-xs text-muted-foreground">Only Staff can read these.</p>
            </CardHeader>
            <CardContent className="space-y-4">
                {viewer.canEdit ? (
                    <div className="space-y-2">
                        <Textarea
                            aria-label="New note"
                            placeholder="Add a note about this customer…"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            maxLength={NOTE_MAX_LENGTH}
                            rows={3}
                            className="resize-none"
                        />
                        <Button
                            size="sm"
                            onClick={addNote}
                            disabled={adding || !draft.trim()}
                        >
                            {adding ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Plus className="mr-2 h-4 w-4" />
                            )}
                            Add note
                        </Button>
                    </div>
                ) : null}

                {notes === null ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Could not load notes.</span>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void reload()}
                            disabled={reloading}
                        >
                            {reloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Try again
                        </Button>
                    </div>
                ) : notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No notes yet.</p>
                ) : (
                    <ul className="space-y-3">
                        {notes.map((note) => (
                            <li key={note.id} className="rounded-lg border p-3 text-sm space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-xs text-muted-foreground">
                                        {note.legacy ? (
                                            <>Notes before {formatAdminDateMY(note.createdAt)}</>
                                        ) : (
                                            <>
                                                <span className="font-medium text-foreground">
                                                    {note.authorName ?? "Staff"}
                                                </span>
                                                {" · "}
                                                {formatAdminDateTimeMY(note.createdAt)}
                                            </>
                                        )}
                                    </p>
                                    {viewer.canEdit && canDeleteNote(viewer, note) ? (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="-mr-1 -mt-1 h-7 w-7 shrink-0 text-muted-foreground"
                                            onClick={() => void deleteNote(note)}
                                            disabled={deletingId === note.id}
                                            aria-label="Delete note"
                                            title="Delete note"
                                        >
                                            {deletingId === note.id ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-3.5 w-3.5" />
                                            )}
                                        </Button>
                                    ) : null}
                                </div>
                                <p className="whitespace-pre-wrap break-words">{note.body}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
