import assert from "node:assert/strict";
import { openAdminPanelMenu, subscribeAdminPanelMenu } from "./admin-panel-menu";

let hits = 0;
const unsub = subscribeAdminPanelMenu(() => {
  hits += 1;
});
openAdminPanelMenu();
assert.equal(hits, 1);
unsub();
openAdminPanelMenu();
assert.equal(hits, 1);

console.log("admin-panel-menu.check.ts: ok");
