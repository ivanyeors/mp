import type { DriveSlot } from "./google-form-csv";

export type FittingFileView = {
  index: number;
  slot: DriveSlot;
  fileId: string;
};

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
  servicedBy: string | null;
  notes: string | null;
  otherAnswers: [string, string][];
};

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

export type FittingMeasurementKey = "shoulderLengthIn" | "neckToBackIn" | "headToBackIn" | "neckLengthIn";

export const FITTING_MEASUREMENTS: readonly { letter: string; label: string; key: FittingMeasurementKey; icon: string }[] = [
  { letter: "A", label: "Shoulder length", key: "shoulderLengthIn", icon: "/shoulder-length.svg" },
  { letter: "B", label: "Neck to back", key: "neckToBackIn", icon: "/neck-to-back.svg" },
  { letter: "C", label: "Head to back", key: "headToBackIn", icon: "/head-to-back.svg" },
  { letter: "D", label: "Neck length", key: "neckLengthIn", icon: "/neck-length.svg" },
];

export function fittingLabel(f: Pick<FittingAnswersView, "recommendedSize" | "configurationType" | "profileSide">): string {
  const parts = [f.recommendedSize ? `Mpillow ${f.recommendedSize}` : null, f.configurationType, f.profileSide].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Fitting";
}

export function inches(n: number | null): string {
  return n === null ? "—" : `${Number(n.toFixed(2))} in`;
}

export function yesNo(b: boolean | null): string {
  return b === null ? "—" : b ? "Yes" : "No";
}

export const driveFileUrl = (fileId: string) => `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;

export const fittingFileSrc = (customerId: string, fittingId: string, index: number, size: "thumb" | "full") =>
  `/api/settings/customers/${customerId}/fittings/${fittingId}/files/${index}?size=${size}`;

