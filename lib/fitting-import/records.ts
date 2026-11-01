import { supabaseAdmin } from "@/lib/supabase/server";
import { DRIVE_SLOTS, type DriveSlot } from "./google-form-csv";
import { toOwnFittingView } from "./own-view";
import type { FittingAnswersView, FittingFileView, FittingRecordView } from "./view";

/**
 * Reading Fitting records (ADR 0039), server-only. `customer_fittings` is the
 * service role's alone; the Customer page and the timeline call these after
 * checking `customers`, and the Profile calls `listOwnFittings` with the
 * session's own Customer.
 */

const COLUMNS =
  "id, customer_id, fitted_at, imported_at, created_customer, matched_by, name_on_form, email_on_form, mobile_on_form, shoulder_length_in, neck_to_back_in, head_to_back_in, neck_length_in, recommended_size, configuration_type, profile_side, sleeper_type, sleep_symptoms, blood_pressure, acid_reflux, ear_discomfort_side_sleep, bed_firmness, uses_bolster, age_group, gender, discovery_source, referred_by, serviced_by, serviced_by_staff_id, notes, drive_files, other_answers";

export type FittingRow = {
  id: string;
  customer_id: string;
  fitted_at: string;
  imported_at: string;
  created_customer: boolean;
  matched_by: "email" | "phone";
  name_on_form: string | null;
  email_on_form: string | null;
  mobile_on_form: string | null;
  shoulder_length_in: number | string | null;
  neck_to_back_in: number | string | null;
  head_to_back_in: number | string | null;
  neck_length_in: number | string | null;
  recommended_size: string | null;
  configuration_type: string | null;
  profile_side: string | null;
  sleeper_type: string | null;
  sleep_symptoms: string[] | null;
  blood_pressure: string | null;
  acid_reflux: boolean | null;
  ear_discomfort_side_sleep: boolean | null;
  bed_firmness: string | null;
  uses_bolster: boolean | null;
  age_group: string | null;
  gender: string | null;
  discovery_source: string | null;
  referred_by: string | null;
  serviced_by: string | null;
  serviced_by_staff_id: string | null;
  notes: string | null;
  drive_files: unknown;
  other_answers: unknown;
};

const SLOTS: ReadonlySet<string> = new Set(Object.values(DRIVE_SLOTS));

/** `drive_files` as stored, keeping each file's position: the photo route serves files by it. */
export function driveFilesOf(value: unknown): FittingFileView[] {
  if (!Array.isArray(value)) return [];
  const out: FittingFileView[] = [];
  value.forEach((f, index) => {
    const slot = (f as { slot?: unknown })?.slot;
    const fileId = (f as { file_id?: unknown })?.file_id;
    if (typeof slot === "string" && SLOTS.has(slot) && typeof fileId === "string" && /^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
      out.push({ index, slot: slot as DriveSlot, fileId });
    }
  });
  return out;
}

/** numeric comes back from PostgREST as a number or a string. */
const num = (v: number | string | null): number | null => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function toFittingView(row: FittingRow, staffNames: ReadonlyMap<string, string>): FittingRecordView {
  const other =
    row.other_answers && typeof row.other_answers === "object" && !Array.isArray(row.other_answers)
      ? Object.entries(row.other_answers as Record<string, unknown>).flatMap(([k, v]) =>
          typeof v === "string" ? [[k, v] as [string, string]] : [],
        )
      : [];
  return {
    id: row.id,
    fittedAt: row.fitted_at,
    importedAt: row.imported_at,
    createdCustomer: row.created_customer,
    matchedBy: row.matched_by,
    nameOnForm: row.name_on_form,
    emailOnForm: row.email_on_form,
    mobileOnForm: row.mobile_on_form,
    shoulderLengthIn: num(row.shoulder_length_in),
    neckToBackIn: num(row.neck_to_back_in),
    headToBackIn: num(row.head_to_back_in),
    neckLengthIn: num(row.neck_length_in),
    recommendedSize: row.recommended_size,
    configurationType: row.configuration_type,
    profileSide: row.profile_side,
    sleeperType: row.sleeper_type,
    sleepSymptoms: row.sleep_symptoms ?? [],
    bloodPressure: row.blood_pressure,
    acidReflux: row.acid_reflux,
    earDiscomfortSideSleep: row.ear_discomfort_side_sleep,
    bedFirmness: row.bed_firmness,
    usesBolster: row.uses_bolster,
    ageGroup: row.age_group,
    gender: row.gender,
    discoverySource: row.discovery_source,
    referredBy: row.referred_by,
    servicedBy: (row.serviced_by_staff_id && staffNames.get(row.serviced_by_staff_id)) || row.serviced_by,
    notes: row.notes,
    files: driveFilesOf(row.drive_files),
    otherAnswers: other,
  };
}

/** A Customer has a handful; past this many, the oldest are not shown. */
export const FITTINGS_SHOWN = 50;

/** A Customer's Fitting records, newest first. Throws on a read error. */
export async function listCustomerFittings(customerId: string): Promise<FittingRecordView[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("customer_fittings")
    .select(COLUMNS)
    .eq("customer_id", customerId)
    .order("fitted_at", { ascending: false })
    .limit(FITTINGS_SHOWN);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as FittingRow[];

  const staffIds = [...new Set(rows.flatMap((r) => (r.serviced_by_staff_id ? [r.serviced_by_staff_id] : [])))];
  const staff = staffIds.length
    ? await db.from("mp_staff").select("id, name").in("id", staffIds)
    : { data: [] as { id: string; name: string }[] };
  const names = new Map(((staff.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  return rows.map((r) => toFittingView(r, names));
}

/**
 * The signed-in customer's own Fitting records for their Profile (ADR 0039 h),
 * newest first: every answer, no Drive file. Keyed by the Customer the session
 * is linked to, never by anything the request names. Throws on a read error.
 */
export async function listOwnFittings(customerId: string): Promise<FittingAnswersView[]> {
  return (await listCustomerFittings(customerId)).map(toOwnFittingView);
}

/**
 * The Drive id of one file of one Customer's Fitting record, or null. The
 * photo route asks for nothing else, so it can never be used to read a Drive
 * file that is not on a Fitting record of that Customer.
 */
export async function fittingDriveFileId(customerId: string, fittingId: string, index: number): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("customer_fittings")
    .select("drive_files")
    .eq("id", fittingId)
    .eq("customer_id", customerId)
    .maybeSingle<{ drive_files: unknown }>();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return driveFilesOf(data.drive_files).find((f) => f.index === index)?.fileId ?? null;
}
