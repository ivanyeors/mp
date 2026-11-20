import assert from "node:assert/strict";
import {
  DEFAULT_SUPPORT_WHATSAPP,
  SUPPORT_WHATSAPP_DIGITS,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_URL,
  formatWhatsAppDisplay,
} from "./contact";

assert.equal(DEFAULT_SUPPORT_WHATSAPP, "6587805311");
assert.notEqual(DEFAULT_SUPPORT_WHATSAPP, "6588097571");

assert.equal(formatWhatsAppDisplay("6587805311"), "+65 8780 5311");
assert.equal(formatWhatsAppDisplay("6588097571"), "+65 8809 7571");

assert.equal(formatWhatsAppDisplay("14155550123"), "+14155550123");
assert.equal(formatWhatsAppDisplay("6512345"), "+6512345");

assert.match(SUPPORT_WHATSAPP_DIGITS, /^\d{8,15}$/);
assert.equal(SUPPORT_WHATSAPP_URL, `https://wa.me/${SUPPORT_WHATSAPP_DIGITS}`);
assert.equal(SUPPORT_WHATSAPP_DISPLAY, formatWhatsAppDisplay(SUPPORT_WHATSAPP_DIGITS));

console.log("contact.check.ts ok");
