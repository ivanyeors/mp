import type { MpConfigStep } from "@/lib/mp-config/flow-variant";
import { isNonEmptyString, type FieldCheck } from "@/lib/configurator/step-validation";

export const FIRST_QUESTION_STEP: MpConfigStep = "name";

export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function firstQuestionEmailCheck(email: string): FieldCheck {
  const touched = isNonEmptyString(email);
  return {
    key: "email",
    touched,
    valid: isPlausibleEmail(email),
    message: touched ? "Enter a valid email address" : "Enter your email",
  };
}

export function withFirstQuestion(steps: readonly MpConfigStep[], askEmail: boolean): MpConfigStep[] {
  if (!askEmail || steps.length === 0 || steps.includes(FIRST_QUESTION_STEP)) return [...steps];
  return [FIRST_QUESTION_STEP, ...steps];
}
