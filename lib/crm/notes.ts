import { supabaseAdmin } from "@/lib/supabase/server";
import type { AdminContext } from "@/lib/auth/admin";
import { getWorkingAs, memberProfiles } from "@/lib/staff/working-as";
import type { CustomerNote } from "@/lib/crm/note-rules";

/**
 * Customer notes (CONTEXT.md; ADR 0027 (a)): dated, authored remarks by Staff
 * about a Customer, in `customer_notes`. Only the service role can read the
 * table, so every read and write goes through here from an Admin Panel route
 * or page that has already checked the caller.
 *
 * Notes are never edited; a correction is a new note. Deleting is soft, and
 * allowed to the author's login or to an Owner or Admin (`canDeleteNote`).
 */

type NoteRow = {
  id: string;
  body: string;
  author_profile_id: string | null;
  author_user_id: string | null;
  created_at: string;
};

const NOTE_COLUMNS = "id, body, author_profile_id, author_user_id, created_at";

/** Resolves author names: the profile's name, else the login's email. */
async function withAuthors(rows: NoteRow[]): Promise<CustomerNote[]> {
  const admin = supabaseAdmin();
  const profileIds = [...new Set(rows.map((r) => r.author_profile_id).filter((v): v is string => !!v))];
  const userIds = [
    ...new Set(rows.filter((r) => !r.author_profile_id).map((r) => r.author_user_id).filter((v): v is string => !!v)),
  ];
  const [profiles, members] = await Promise.all([
    profileIds.length ? admin.from("mp_staff").select("id, name").in("id", profileIds) : { data: [] },
    userIds.length ? admin.from("admin_users").select("auth_user_id, email").in("auth_user_id", userIds) : { data: [] },
  ]);
  const profileName = new Map(
    ((profiles.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]),
  );
  const memberEmail = new Map(
    ((members.data ?? []) as { auth_user_id: string; email: string }[]).map((m) => [m.auth_user_id, m.email]),
  );
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    authorName:
      (r.author_profile_id ? profileName.get(r.author_profile_id) : undefined) ??
      (r.author_user_id ? memberEmail.get(r.author_user_id) : undefined) ??
      null,
    authorUserId: r.author_user_id,
    legacy: !r.author_profile_id && !r.author_user_id,
  }));
}

/** A Customer's notes, newest first, without the deleted ones. */
export async function listCustomerNotes(customerId: string): Promise<CustomerNote[]> {
  const { data, error } = await supabaseAdmin()
    .from("customer_notes")
    .select(NOTE_COLUMNS)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return withAuthors((data ?? []) as NoteRow[]);
}

/**
 * The Staff profile a note is written or deleted as: the one chosen under
 * "Working as", or the login's only profile when it has just one. Attribution
 * only.
 */
export async function noteProfileFor(memberId: string): Promise<string | null> {
  const chosen = await getWorkingAs(memberId);
  if (chosen) return chosen.id;
  const profiles = await memberProfiles(memberId);
  return profiles.length === 1 ? profiles[0]!.id : null;
}

/** Writes a note as the signed-in Member. The caller has checked the Customer exists. */
export async function createCustomerNote(
  customerId: string,
  body: string,
  ctx: Pick<AdminContext, "userId" | "memberId">,
): Promise<CustomerNote> {
  const { data, error } = await supabaseAdmin()
    .from("customer_notes")
    .insert({
      customer_id: customerId,
      body,
      author_profile_id: await noteProfileFor(ctx.memberId),
      author_user_id: ctx.userId,
    })
    .select(NOTE_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save the note");
  const [note] = await withAuthors([data as NoteRow]);
  return note!;
}
