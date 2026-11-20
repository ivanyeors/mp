import { DRIVE_FIELDS, FORM_COLUMNS } from "./google-form-csv";
import type { FittingAnswersView } from "./view";

const DRIVE_HEADERS: ReadonlySet<string> = new Set(DRIVE_FIELDS.flatMap((f) => FORM_COLUMNS[f].headers.map((h) => h.toLowerCase())));
const GOOGLE_FILE_LINK = /\b(?:drive|docs)\.google\.com\b|\bgoo\.gl\b/i;

export function toOwnFittingView(r: FittingAnswersView): FittingAnswersView {
  return {
    id: r.id,
    fittedAt: r.fittedAt,
    shoulderLengthIn: r.shoulderLengthIn,
    neckToBackIn: r.neckToBackIn,
    headToBackIn: r.headToBackIn,
    neckLengthIn: r.neckLengthIn,
    recommendedSize: r.recommendedSize,
    configurationType: r.configurationType,
    profileSide: r.profileSide,
    sleeperType: r.sleeperType,
    sleepSymptoms: [...r.sleepSymptoms],
    bloodPressure: r.bloodPressure,
    acidReflux: r.acidReflux,
    earDiscomfortSideSleep: r.earDiscomfortSideSleep,
    bedFirmness: r.bedFirmness,
    usesBolster: r.usesBolster,
    ageGroup: r.ageGroup,
    gender: r.gender,
    discoverySource: r.discoverySource,
    referredBy: r.referredBy,
    servicedBy: r.servicedBy,
    notes: r.notes,
    otherAnswers: r.otherAnswers.filter(
      ([q, a]) => !DRIVE_HEADERS.has(q.trim().toLowerCase()) && !GOOGLE_FILE_LINK.test(a),
    ),
  };
}
