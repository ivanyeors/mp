/**
 * The configurator's first question asks a guest's email as well as their name
 * (ADR 0049), and a guest's Draft Result is not saved until it has one, so
 * every Draft Staff can see in Results is one they can reach.
 */

import type { MpConfigStep } from "@/lib/mp-config/flow-variant";
import { isNonEmptyString, type FieldCheck } from "@/lib/configurator/step-validation";

/** The step that asks for the name, and, for a guest, the email. */
export const FIRST_QUESTION_STEP: MpConfigStep = "name";

/**
 * Shaped like an address: something@domain.tld with no spaces. Loose on
 * purpose; the server's `z.email()` has the last word and the save says so.
 */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** The first question's email check: required, and shaped like an address. */
export function firstQuestionEmailCheck(email: string): FieldCheck {
  const touched = isNonEmptyString(email);
  return {
    key: "email",
    touched,
    valid: isPlausibleEmail(email),
    message: touched ? "Enter a valid email address" : "Enter your email",
  };
}

/**
 * The steps an Mbolster hand-off lands on (the rule graph's Flow route), with
 * the first question in front for a guest. The carried answers leave only the
 * questionnaire's later steps, which would otherwise skip the one place a
 * guest gives their email, and with it the save of their Draft.
 */
export function withFirstQuestion(steps: readonly MpConfigStep[], askEmail: boolean): MpConfigStep[] {
  if (!askEmail || steps.length === 0 || steps.includes(FIRST_QUESTION_STEP)) return [...steps];
  return [FIRST_QUESTION_STEP, ...steps];
}
