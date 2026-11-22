export { cn } from "cn";

export function getApiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error == null) return fallback;
  if (typeof error === "string") return error || fallback;
  if (error instanceof Error) return error.message || fallback;

  if (typeof error === "object") {
    const obj = error as Record<string, unknown>;

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

    if (typeof obj.message === "string" && obj.message) return obj.message;
    if (obj.error != null && obj.error !== error) {
      return getApiErrorMessage(obj.error, fallback);
    }
  }

  return fallback;
}
