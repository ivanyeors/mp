/**
 * A Fitting record as the Customer page and the customer's own Profile show it
 * (ADR 0042). Type-only and pure, so the browser shares it with the server
 * reader (`records.ts`).
 */
import type { DriveSlot } from "./google-form-csv";

export type FittingFileView = {
  /** Its position in `drive_files`: the photo route serves files by it, never by a Drive id from the browser. */
  index: number;
  slot: DriveSlot;
  /** The Drive id, for the Open in Drive link. */
  fileId: string;
};

/**
 * What was recorded at one fitting: the part both Staff and the customer see
 * (ADR 0042 h). No Drive file, and nothing about how the import found the
 * Customer.
 */
export type FittingAnswersView = {
  id: string;
  fittedAt: string;
  shoulderLengthIn: number | null;
  neckToBackIn: number | null;
  headToBackIn: number | null;
  neckLengthIn: number | null;
  recommendedSize: string | null;
  configurationType: string | null;
  profileSide: string | null;
  sleeperType: string | null;
  sleepSymptoms: string[];
  bloodPressure: string | null;
  acidReflux: boolean | null;
  earDiscomfortSideSleep: boolean | null;
  bedFirmness: string | null;
  usesBolster: boolean | null;
  ageGroup: string | null;
  gender: string | null;
  discoverySource: string | null;
  referredBy: string | null;
  /** The Staff profile's name when the form's name matched one, else as typed. */
  servicedBy: string | null;
  notes: string | null;
  otherAnswers: [string, string][];
};

/** The whole record, as Staff see it on the Customer page. */
export type FittingRecordView = FittingAnswersView & {
  importedAt: string;
  createdCustomer: boolean;
  matchedBy: "email" | "phone";
  nameOnForm: string | null;
  emailOnForm: string | null;
  mobileOnForm: string | null;
  files: FittingFileView[];
};

export const DRIVE_SLOT_LABELS: Record<DriveSlot, string> = {
  back_photo: "Back photo",
  side_photo: "Side photo",
  back_sleep_preview: "Back sleep preview",
  side_sleep_preview: "Side sleep preview",
  customisation_form: "Customisation form",
};

/** `Mpillow M · T12 · M-LN`: what was recommended, in the form's own codes. */
export function fittingLabel(f: Pick<FittingAnswersView, "recommendedSize" | "configurationType" | "profileSide">): string {
  const parts = [f.recommendedSize ? `Mpillow ${f.recommendedSize}` : null, f.configurationType, f.profileSide].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Fitting";
}

/** `2.5 in`, keeping the form's own precision. */
export function inches(n: number | null): string {
  return n === null ? "—" : `${Number(n.toFixed(2))} in`;
}

export function yesNo(b: boolean | null): string {
  return b === null ? "—" : b ? "Yes" : "No";
}

/** A Drive file's own page, for opening it where it lives. */
export const driveFileUrl = (fileId: string) => `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;

/** The Staff-only preview of one of a Fitting record's files. */
export const fittingFileSrc = (customerId: string, fittingId: string, index: number, size: "thumb" | "full") =>
  `/api/settings/customers/${customerId}/fittings/${fittingId}/files/${index}?size=${size}`;

