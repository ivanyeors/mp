/**
 * Rules for the floating TikTok player (components/tiktok/tiktok-pip.tsx):
 * which corner it docks to, and which pages it does not follow the visitor to.
 */

export type PipCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const DEFAULT_PIP_CORNER: PipCorner = "bottom-right";

/** The corner nearest to where a dragged player was let go, from its centre. */
export function nearestPipCorner(
  centre: { x: number; y: number },
  viewport: { width: number; height: number },
): PipCorner {
  const vertical = centre.y < viewport.height / 2 ? "top" : "bottom";
  const horizontal = centre.x < viewport.width / 2 ? "left" : "right";
  return `${vertical}-${horizontal}`;
}

/** The same edge on the other side: what the player's "move" button does. */
export function otherSidePipCorner(corner: PipCorner): PipCorner {
  const [vertical, horizontal] = corner.split("-") as ["top" | "bottom", "left" | "right"];
  return `${vertical}-${horizontal === "left" ? "right" : "left"}`;
}

/** Path prefixes the player closes on. */
const CLOSES_ON = ["/settings", "/account", "/auth", "/pay", "/shop/checkout"];

/**
 * Whether the player keeps playing when the visitor moves to this page (a path
 * without its locale). It follows them around the shop and the configurators,
 * which is where its buttons lead, and closes on the Admin Panel, the account
 * and sign-in screens, and paying, where a video in the corner only gets in
 * the way.
 */
export function pipFollowsTo(basePathname: string): boolean {
  return !CLOSES_ON.some((prefix) => basePathname === prefix || basePathname.startsWith(`${prefix}/`));
}
