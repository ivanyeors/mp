function isOpaque(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  return /^[{[]/.test(trimmed);
}

const SERVER_FAULT =
  "Something went wrong on our end, so we couldn't send that email. Please try again — if it keeps happening, contact support.";

const UNKNOWN_FAULT =
  "We couldn't complete that request. Please try again — if it keeps happening, contact support.";

export function authErrorMessage(error: {
  message?: string | null;
  status?: number | null;
}): string {
  const message = error.message ?? "";
  const status = error.status ?? 0;

  if (status >= 500) return SERVER_FAULT;
  if (isOpaque(message)) return status > 0 ? SERVER_FAULT : UNKNOWN_FAULT;
  return message;
}
