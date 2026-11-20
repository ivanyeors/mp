import { z } from "zod";

export const NOTE_MAX_LENGTH = 5000;

export const NoteInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write the note first.")
    .max(NOTE_MAX_LENGTH, `A note is at most ${NOTE_MAX_LENGTH.toLocaleString("en")} characters.`),
});

export interface CustomerNote {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
  authorUserId: string | null;
  legacy: boolean;
}

export function canDeleteNote(
  viewer: { userId: string; grantsAll: boolean },
  note: Pick<CustomerNote, "authorUserId">,
): boolean {
  return viewer.grantsAll || (note.authorUserId !== null && note.authorUserId === viewer.userId);
}
