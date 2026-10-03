import { describe, expect, it } from "vitest";
import { trackingStatusKey } from "@/lib/shipping/easyship-webhook";

describe("trackingStatusKey", () => {
  it.each([
    ["In Transit to Customer", "in_transit"],
    ["Out for Delivery", "out_for_delivery"],
    ["Failed Delivery Attempt", "unsuccessful_delivery_attempt"],
    ["Delivered", "delivered"],
    ["Exception", "exception"],
    ["Lost by Courier", "exception"],
    ["Pending", null],
    [null, null],
  ])("%s → %s", (status, key) => expect(trackingStatusKey(status)).toBe(key));
});
