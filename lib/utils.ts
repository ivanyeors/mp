import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize an API error value into a readable string suitable for `toast`,
 * `new Error`, or direct rendering.
 *
 * API routes commonly return Zod's `error.flatten()` shape
 * (`{ formErrors: string[], fieldErrors: Record<string, string[]> }`) in the
 * `error` field. Passing that object straight to a React child (e.g. sonner's
 * `toast.error`) throws "Objects are not valid as a React child". This flattens
 * any such value into a string and falls back to `fallback` when nothing usable
 * is found.
 */
export function getApiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error == null) return fallback;
  if (typeof error === "string") return error || fallback;
  if (error instanceof Error) return error.message || fallback;

  if (typeof error === "object") {
    const obj = error as Record<string, unknown>;

    // Zod flatten() shape
    const formErrors = obj.formErrors;
    if (Array.isArray(formErrors) && formErrors.length > 0) {
      return String(formErrors[0]);
    }

    const fieldErrors = (obj.fieldErrors ?? obj.errors) as
      | Record<string, unknown>
      | undefined;
    if (fieldErrors && typeof fieldErrors === "object") {
      const messages: string[] = [];
      for (const [field, msgs] of Object.entries(fieldErrors)) {
        if (Array.isArray(msgs) && msgs.length > 0) {
          messages.push(`${field}: ${msgs[0]}`);
        }
      }
      if (messages.length > 0) return messages.join("; ");
    }

    // Nested `{ error: ... }` or a plain message field
    if (typeof obj.message === "string" && obj.message) return obj.message;
    if (obj.error != null && obj.error !== error) {
      return getApiErrorMessage(obj.error, fallback);
    }
  }

  return fallback;
}
