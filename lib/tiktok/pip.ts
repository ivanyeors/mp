/**
 * Which pages the floating TikTok player (components/tiktok/tiktok-pip.tsx)
 * does not follow the visitor to.
 */

/** Path prefixes the player closes on. */
const CLOSES_ON = ["/settings", "/account", "/auth", "/pay", "/shop/checkout"];

/**
 * Whether the player keeps playing when the visitor moves to this page (a path
 * without its locale). It follows them around the site, the shop and the
 * configurators, and closes on the Admin Panel, the account and sign-in
 * screens, and paying, where a video in the corner only gets in the way.
 */
export function pipFollowsTo(basePathname: string): boolean {
  return !CLOSES_ON.some((prefix) => basePathname === prefix || basePathname.startsWith(`${prefix}/`));
}
