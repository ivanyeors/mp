/**
 * Slice 04/05 self-check: dock session role → Menu pill + Admin Panel dock path.
 */
import assert from "node:assert/strict";
import {
  isAdminPanelDockPath,
  landingAuthPill,
  resolveDockSessionRole,
} from "./dock-chrome";

assert.equal(resolveDockSessionRole(false, false), "guest");
assert.equal(resolveDockSessionRole(true, false), "customer");
assert.equal(resolveDockSessionRole(true, true), "staff");
// Staff wins even if caller only has staff flag (session implied by admin API).
assert.equal(resolveDockSessionRole(false, true), "staff");

assert.deepEqual(landingAuthPill("guest"), {
  label: "Sign in",
  href: "/account/login",
});
assert.deepEqual(landingAuthPill("customer"), {
  label: "Profile",
  href: "/account",
});
assert.deepEqual(landingAuthPill("staff"), {
  label: "Admin Panel",
  href: "/settings",
});

assert.equal(isAdminPanelDockPath("/settings"), true);
assert.equal(isAdminPanelDockPath("/settings/orders"), true);
assert.equal(isAdminPanelDockPath("/settings/login"), false);
assert.equal(isAdminPanelDockPath("/account"), false);
assert.equal(isAdminPanelDockPath("/"), false);
assert.equal(isAdminPanelDockPath("/shop"), false);

console.log("dock-chrome.check.ts: ok");
