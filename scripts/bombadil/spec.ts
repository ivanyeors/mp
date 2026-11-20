// What scripts/bombadil/run checks and does. Bombadil loads this file itself,
// so the @antithesishq/bombadil imports are resolved by its own binary, not by
// node_modules (the package is deliberately not a dependency: it bundles three
// platforms' binaries, about 60 MB, into every install).

import { isAction } from "@antithesishq/bombadil/actions";
import { extract } from "@antithesishq/bombadil/browser";
import { defaultActions } from "@antithesishq/bombadil/browser/defaults";

// Bombadil's defaults: fail on an uncaught exception, an unhandled promise
// rejection, a console error, or an HTTP 4xx/5xx response.
export {
  noHttpErrorCodes,
  noUncaughtExceptions,
  noUnhandledPromiseRejections,
  noConsoleErrors,
} from "@antithesishq/bombadil/browser/defaults/properties";

// Clicks that waste the run rather than test the app:
// - Signing out. Signed in as the Owner, a run signed itself out within seven
//   steps and spent the rest on the login page. Most sign-out controls are
//   named ("Sign out" on /settings and /account, "Sign out and use a Staff
//   email" on the login page; English in every locale), but the dock's is a
//   form posting to /auth/signout and Bombadil clicks the unnamed div inside
//   its button, so clicks inside such a form or link are skipped by position.
// - The Next.js dev tools badge and its panel: dev-server chrome, not the app.
const SKIP_NAMED = /^(sign out|log out|open next\.js dev tools|close devtools panel)\b/i;

const signOutAreas = extract((state) =>
  Array.from(state.document.querySelectorAll('form[action*="/auth/signout"], a[href*="/auth/signout"]')).map((el) => {
    const r = el.getBoundingClientRect();
    return [r.left, r.top, r.right, r.bottom];
  }),
);

export const actions = defaultActions.filter((action) => {
  if (!isAction(action, "Click")) return true;
  const { fingerprint, point } = action.Click;
  const named = [fingerprint.accessibleName, fingerprint.textContent].some(
    (label) => label != null && SKIP_NAMED.test(label.trim()),
  );
  const x = typeof point.x === "number" ? point.x : point.x[0];
  const y = typeof point.y === "number" ? point.y : point.y[0];
  const inSignOut = signOutAreas.current.some(([l, t, r, b]) => x >= l && x <= r && y >= t && y <= b);
  return !named && !inSignOut;
});
