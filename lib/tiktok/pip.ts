const CLOSES_ON = ["/settings", "/account", "/auth", "/pay", "/shop/checkout"];

export function pipFollowsTo(basePathname: string): boolean {
  return !CLOSES_ON.some((prefix) => basePathname === prefix || basePathname.startsWith(`${prefix}/`));
}
