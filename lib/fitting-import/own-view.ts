import { DRIVE_FIELDS, FORM_COLUMNS } from "./google-form-csv";
import type { FittingAnswersView } from "./view";

/*
 * The customer's own copy of their Fitting records (ADR 0039 h), made on the
 * server before anything reaches their browser. Pure.
 */

/** The upload questions' titles: a cell the import could not read is kept under one of them. */
const DRIVE_HEADERS: ReadonlySet<string> = new Set(DRIVE_FIELDS.flatMap((f) => FORM_COLUMNS[f].headers.map((h) => h.toLowerCase())));
const GOOGLE_FILE_LINK = /\b(?:drive|docs)\.google\.com\b|\bgoo\.gl\b/i;

/**
 * The customer's own copy of a Fitting record (ADR 0039 h): every answer, and
 * none of the Drive files. Picked field by field, so a field added to the Staff
 * view never reaches the customer by default. An unreadable upload cell, or a
 * newer form's upload question the import does not know, is a Drive link kept
 * in `otherAnswers`; it is left out too.
 */
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
