import { z } from "zod";
import {
  DROP_OFF_REASONS,
  DROP_OFF_TEXT_MAX,
  REASONS_FOR_STEP,
  SITE_DROP_OFF_STEPS,
  TEXT_REASONS,
} from "@/lib/analytics/drop-off/reasons";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const optionalText = z
  .string()
  .max(DROP_OFF_TEXT_MAX)
  .optional()
  .nullable()
  .transform((v) => v?.replace(CONTROL_CHARS, "").trim() || null);

export const SiteDropOffAnswerSchema = z
  .object({
    step: z.enum(SITE_DROP_OFF_STEPS),
    reason: z.enum(DROP_OFF_REASONS),
    text: optionalText,
    path: z.string().min(1).max(200),
    visitId: z.string().uuid().optional().nullable(),
    visitorId: z.string().uuid().optional().nullable(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (!REASONS_FOR_STEP[a.step].includes(a.reason)) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Not an answer for this step." });
    }
  })
  .transform((a) => ({ ...a, text: TEXT_REASONS.includes(a.reason) ? a.text : null }));
export type SiteDropOffAnswer = z.output<typeof SiteDropOffAnswerSchema>;

export const DeclineReasonSchema = z
  .object({
    reason: z.enum(DROP_OFF_REASONS),
    text: optionalText,
  })
  .superRefine((a, ctx) => {
    if (!REASONS_FOR_STEP.quote_decline.includes(a.reason)) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Not an answer for a decline." });
    }
  })
  .transform((a) => ({ ...a, text: TEXT_REASONS.includes(a.reason) ? a.text : null }));
export type DeclineReason = z.output<typeof DeclineReasonSchema>;
