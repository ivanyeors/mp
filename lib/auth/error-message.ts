/**
 * Supabase's client builds an AuthError message from the response body, falling
 * back to `JSON.stringify(body)` when GoTrue answers without a `msg` /
 * `error_description`. A 500 whose body is `{}` therefore reaches the UI as the
 * literal string "{}" — a red blob that tells the user nothing and, worse,
 * tells us nothing either. (That is exactly how a single NULL
 * `auth.users.recovery_token` presented: every magic-link request for that one
 * account rendered "{}".)
 *
 * Keep GoTrue's real sentences — "Email rate limit exceeded", "Token has
 * expired or is invalid" — and replace only the ones that carry no meaning.
 */

/** A message is useless if it is blank or is just a serialised object/array. */
function isOpaque(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  return /^[{[]/.test(trimmed);
}

const SERVER_FAULT =
  "Something went wrong on our end, so we couldn't send that email. Please try again — if it keeps happening, contact support.";

const UNKNOWN_FAULT =
  "We couldn't complete that request. Please try again — if it keeps happening, contact support.";

/**
 * Human-readable text for an auth failure, for rendering to the signed-out
 * user. `status` is the HTTP status from the auth response when known.
 */
export function authErrorMessage(error: {
  message?: string | null;
  status?: number | null;
}): string {
  const message = error.message ?? "";
  const status = error.status ?? 0;

  // A 5xx is a fault on our side whatever GoTrue chose to say about it; its
  // internal wording ("error finding user: sql: Scan error on column…") is a
  // leak, not an instruction the user can act on.
  if (status >= 500) return SERVER_FAULT;
  if (isOpaque(message)) return status > 0 ? SERVER_FAULT : UNKNOWN_FAULT;
  return message;
}
