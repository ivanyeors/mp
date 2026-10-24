import { z } from "zod";

/**
 * The parts of Customer notes (lib/crm/notes.ts) the Admin Panel's browser code
 * shares with the routes: the input rule, the shape, and who may delete.
 */

export const NOTE_MAX_LENGTH = 5000;

export const NoteInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write the note first.")
    .max(NOTE_MAX_LENGTH, `A note is at most ${NOTE_MAX_LENGTH.toLocaleString("en")} characters.`),
});

/** A note as the Customer detail shows it. */
export interface CustomerNote {
  id: string;
  body: string;
  createdAt: string;
  /** The author's Staff profile, else their login's email; null when unknown. */
  authorName: string | null;
  /** The author's login: who, besides an Owner or Admin, may delete it. */
  authorUserId: string | null;
  /**
   * Moved from the old `customers.notes` box, so it has no author. Its date is
   * the Customer's last update before the move: shown as "Notes before {date}".
   */
  legacy: boolean;
}

/**
 * Who may delete a note: its author's login, or an Owner or Admin
 * (`AdminContext.grantsAll`). Decided by the login, never by the "Working as"
 * profile, which is attribution only.
 */
export function canDeleteNote(
  viewer: { userId: string; grantsAll: boolean },
  note: Pick<CustomerNote, "authorUserId">,
): boolean {
  return viewer.grantsAll || (note.authorUserId !== null && note.authorUserId === viewer.userId);
}
