import { z } from "zod";
import {
  CHECKUP_LIMITS,
  CHECKUP_SETTING_KEYS,
  parseCheckupSettings,
  type CheckupReport,
  type CheckupSettings,
} from "./checkup";
import {
  isUsableReviewUrl,
  parseReviewRequestSettings,
  REVIEW_REQUEST_LIMITS,
  REVIEW_REQUEST_SETTING_KEYS,
  type ReviewRequestReport,
  type ReviewRequestSettings,
} from "./review-request";

export const AFTERCARE_SETTING_KEYS = [...REVIEW_REQUEST_SETTING_KEYS, ...CHECKUP_SETTING_KEYS] as const;
export type AftercareSettingKey = (typeof AFTERCARE_SETTING_KEYS)[number];

export type AftercareSettings = { reviewRequests: ReviewRequestSettings; checkups: CheckupSettings };

export function parseAftercareSettings(stored: Record<string, string | undefined>): AftercareSettings {
  return { reviewRequests: parseReviewRequestSettings(stored), checkups: parseCheckupSettings(stored) };
}

export const aftercareSettingsPatchSchema = z
  .object({
    review_requests_enabled: z.boolean().optional(),
    review_request_days_after: z
      .number()
      .int()
      .min(REVIEW_REQUEST_LIMITS.daysAfter.min)
      .max(REVIEW_REQUEST_LIMITS.daysAfter.max)
      .optional(),
    review_request_max_age_days: z
      .number()
      .int()
      .min(REVIEW_REQUEST_LIMITS.maxAgeDays.min)
      .max(REVIEW_REQUEST_LIMITS.maxAgeDays.max)
      .optional(),
    google_review_url: z.string().trim().max(500).optional(),
    checkup_reminders_enabled: z.boolean().optional(),
    checkup_months: z.number().int().min(CHECKUP_LIMITS.months.min).max(CHECKUP_LIMITS.months.max).optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: "Nothing to change" });
export type AftercareSettingsPatch = z.infer<typeof aftercareSettingsPatchSchema>;

export type AftercareSettingsChange =
  | { ok: true; next: AftercareSettings; rows: Array<{ key: AftercareSettingKey; value: string }> }
  | { ok: false; error: string };

export function applyAftercareSettingsPatch(
  current: AftercareSettings,
  patch: AftercareSettingsPatch,
): AftercareSettingsChange {
  const r = current.reviewRequests;
  const next: ReviewRequestSettings = {
    enabled: patch.review_requests_enabled ?? r.enabled,
    daysAfter: patch.review_request_days_after ?? r.daysAfter,
    maxAgeDays: patch.review_request_max_age_days ?? r.maxAgeDays,
    googleReviewUrl: patch.google_review_url ?? r.googleReviewUrl,
  };
  const checkups: CheckupSettings = {
    enabled: patch.checkup_reminders_enabled ?? current.checkups.enabled,
    months: patch.checkup_months ?? current.checkups.months,
  };
  if (patch.google_review_url !== undefined && next.googleReviewUrl && !isUsableReviewUrl(next.googleReviewUrl)) {
    return { ok: false, error: "The Google review link must be a full https:// address." };
  }
  if (next.maxAgeDays < next.daysAfter) {
    return {
      ok: false,
      error: `The last day (${next.maxAgeDays}) must be on or after the first day (${next.daysAfter}).`,
    };
  }

  const rows: Array<{ key: AftercareSettingKey; value: string }> = [];
  if (patch.review_requests_enabled !== undefined) rows.push({ key: "review_requests_enabled", value: String(next.enabled) });
  if (patch.review_request_days_after !== undefined) rows.push({ key: "review_request_days_after", value: String(next.daysAfter) });
  if (patch.review_request_max_age_days !== undefined) {
    rows.push({ key: "review_request_max_age_days", value: String(next.maxAgeDays) });
  }
  if (patch.google_review_url !== undefined) rows.push({ key: "google_review_url", value: next.googleReviewUrl });
  if (patch.checkup_reminders_enabled !== undefined) {
    rows.push({ key: "checkup_reminders_enabled", value: String(checkups.enabled) });
  }
  if (patch.checkup_months !== undefined) rows.push({ key: "checkup_months", value: String(checkups.months) });
  return { ok: true, next: { reviewRequests: next, checkups }, rows };
}

export type AftercareCardData = {
  settings: AftercareSettings;
  reviewRequests: {
    today: ReviewRequestReport;
    last30: { asked: number; opened: number; email: number; whatsapp: number };
    googleReviewsLinked: number;
  };
  checkups: {
    today: CheckupReport;
    last90: { sent: number; email: number; whatsapp: number; followedByBooking: number };
  };
  whatsapp: {
    senderConfigured: boolean;
    reviewTemplate: string | null;
    checkupTemplate: string | null;
  };
  openStopRequests: number;
};
