import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import https from "node:https";
import net from "node:net";

export const PUBLIC_REQUEST_TIMEOUT_MS = 5000;

export class NotPublicAddressError extends Error {
  readonly code = "ENOTPUBLIC";
}

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

export function isPublicAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "");
  const kind = net.isIP(ip);
  if (kind === 4) return !privateV4.check(ip, "ipv4");
  if (kind === 6) return globalV6.check(ip, "ipv6") && !privateV6.check(ip, "ipv6");
  return false;
}

const LOCAL_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|home\.arpa)$/i;

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
export type Lookup = (hostname: string, options: LookupOptions, callback: LookupCallback) => void;

const systemLookup: Lookup = (hostname, options, callback) =>
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => callback(err, addresses));

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
