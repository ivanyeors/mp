/**
 * A request from the server to an address someone typed, that cannot reach
 * anything but the public internet (PRD-campaign-email-editor slice 11, the
 * check that an email's links answer). Server only.
 *
 * A link Staff type could name this server's own network: a cloud metadata
 * address, a database, an internal service. So a request goes out only:
 *
 *  - to an https address on the default port, with no user name or password
 *    in it (`publicHttpsUrl`);
 *  - to a host whose every address is public (`isPublicAddress`). The name is
 *    resolved by the lookup the connection itself uses (`publicLookup`), so a
 *    name that answers differently between a check and the connect still
 *    reaches no private address;
 *  - never past a redirect: the answer is the status, and a 3xx is not
 *    followed, so a public page that redirects to a private one reaches
 *    nothing;
 *  - with a short timeout, reading no body.
 */
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import https from "node:https";
import net from "node:net";

/** How long one request may take before it counts as no answer. */
export const PUBLIC_REQUEST_TIMEOUT_MS = 5000;

/** Why a request was not made, or not answered: the address is not a public one. */
export class NotPublicAddressError extends Error {
  readonly code = "ENOTPUBLIC";
}

// Addresses that are not the public internet: this host, private networks,
// carrier NAT, link-local (cloud metadata), documentation, benchmarking,
// multicast and reserved ranges (IANA special-purpose registries).
const PRIVATE_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
// IPv6 is public only inside global unicast, 2000::/3, and outside these:
// documentation, Teredo and 6to4 (which carry an IPv4 address of any kind),
// and the IETF's own assignments.
const PRIVATE_V6: [string, number][] = [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
];

const privateV4 = new net.BlockList();
for (const [a, p] of PRIVATE_V4) privateV4.addSubnet(a, p, "ipv4");
const privateV6 = new net.BlockList();
for (const [a, p] of PRIVATE_V6) privateV6.addSubnet(a, p, "ipv6");
const globalV6 = new net.BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

/** Pure — `address` (an IPv4 or IPv6 literal) is on the public internet. Anything else, a name included, is not. */
export function isPublicAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "");
  const kind = net.isIP(ip);
  if (kind === 4) return !privateV4.check(ip, "ipv4");
  if (kind === 6) return globalV6.check(ip, "ipv6") && !privateV6.check(ip, "ipv6");
  return false;
}

/** Names that only mean something inside a network. */
const LOCAL_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|home\.arpa)$/i;

/**
 * Pure — `raw` as a URL a request may go to, or null: https, the default
 * port, no user name or password, and a public address or a name with a dot
 * that is not a local one. Whether the name resolves to public addresses is
 * checked when the request connects.
 */
export function publicHttpsUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
  const host = url.hostname.replace(/\.$/, "");
  if (net.isIP(host.replace(/^\[|\]$/g, ""))) return isPublicAddress(host) ? url : null;
  if (!host.includes(".") || LOCAL_NAME.test(host)) return null;
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
/** `dns.lookup`, as `net.connect` calls it. */
export type Lookup = (hostname: string, options: LookupOptions, callback: LookupCallback) => void;

const systemLookup: Lookup = (hostname, options, callback) =>
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => callback(err, addresses));

/**
 * A lookup for a connection that refuses every name with any address that is
 * not public: the connection then fails before it is made. `lookup` is the
 * system's unless a test passes its own.
 */
export function publicLookup(lookup: Lookup = systemLookup): Lookup {
  return (hostname, options, callback) => {
    lookup(hostname, { ...options, all: true }, (err, found) => {
      if (err) return callback(err, "");
      const addresses = (Array.isArray(found) ? found : [{ address: found, family: net.isIP(found) }]) as LookupAddress[];
      if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) {
        return callback(new NotPublicAddressError(`${hostname} is not a public address`), "");
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

/**
 * Asks `raw` for its status, with a HEAD or a GET, and resolves to it as soon
 * as it answers, reading none of its body; a redirect is the status, never
 * followed. Rejects when the address is not a public https one, when it does
 * not answer within `timeoutMs`, or when it cannot be reached.
 */
export function publicRequest(
  raw: string,
  { method = "HEAD", timeoutMs = PUBLIC_REQUEST_TIMEOUT_MS, lookup }: { method?: "HEAD" | "GET"; timeoutMs?: number; lookup?: Lookup } = {},
): Promise<{ status: number }> {
  const url = publicHttpsUrl(raw);
  if (!url) return Promise.reject(new NotPublicAddressError(`${raw} is not a public https address`));
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        // A fresh connection each time, so every one is made through the lookup below.
        agent: false,
        lookup: publicLookup(lookup),
        headers: { "user-agent": "Mpillow link check (+https://mpillow.com)", accept: "*/*" },
      },
      (res) => {
        clearTimeout(timer);
        resolve({ status: res.statusCode ?? 0 });
        res.destroy();
      },
    );
    const timer = setTimeout(() => req.destroy(new Error(`no answer within ${timeoutMs / 1000} seconds`)), timeoutMs);
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end();
  });
}
