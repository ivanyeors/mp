import type { LookupAddress } from "node:dns";
import { describe, expect, it } from "vitest";
import { isPublicAddress, NotPublicAddressError, publicHttpsUrl, publicLookup, publicRequest, type Lookup } from "../public-request";

describe("isPublicAddress", () => {
  it("refuses this host, private networks, link-local, carrier NAT, documentation and reserved ranges", () => {
    for (const ip of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.10",
      "192.0.2.4",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "::ffff:10.0.0.1",
      "::ffff:127.0.0.1",
      "2001:db8::1",
      "2002:0a00:0001::1",
      "[::1]",
      "example.com",
      "",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("takes public IPv4 and global IPv6", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111", "[2a00:1450:4001:80b::200e]"]) expect(isPublicAddress(ip), ip).toBe(true);
  });
});

describe("publicHttpsUrl", () => {
  it("takes an https address on the default port, by name or public address", () => {
    for (const u of ["https://example.com/a?b=1", "https://shop.example.co.uk:443/", "https://93.184.216.34/", "https://example.com./"]) expect(publicHttpsUrl(u), u).not.toBeNull();
  });

  it("refuses http, another port, a user name, a local name and a private address", () => {
    for (const u of [
      "http://example.com/",
      "ftp://example.com/",
      "https://example.com:8443/",
      "https://user:pass@example.com/",
      "https://localhost/",
      "https://printer.local/",
      "https://db.internal/",
      "https://intranet/",
      "https://10.0.0.5/",
      "https://[::1]/",
      "https://[fd00::5]/",
      "not a url",
    ]) {
      expect(publicHttpsUrl(u), u).toBeNull();
    }
  });
});

const resolver =
  (names: Record<string, string[]>): Lookup =>
  (hostname, _options, callback) => {
    const found = names[hostname];
    if (!found) return callback(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }), "");
    callback(null, found.map((address): LookupAddress => ({ address, family: address.includes(":") ? 6 : 4 })));
  };
const lookUp = (lookup: Lookup, hostname: string, all: boolean) =>
  new Promise<{ err: NodeJS.ErrnoException | null; address: unknown; family?: number }>((resolve) =>
    lookup(hostname, { all }, (err, address, family) => resolve({ err, address, family })),
  );

describe("publicLookup", () => {
  const lookup = publicLookup(
    resolver({ "shop.example.com": ["93.184.216.34", "2606:4700:4700::1111"], "rebind.example.com": ["93.184.216.34", "10.0.0.7"], "meta.example.com": ["169.254.169.254"] }),
  );

  it("answers a public name the way the connection asked: every address, or the first", async () => {
    expect(await lookUp(lookup, "shop.example.com", true)).toMatchObject({ err: null, address: [{ address: "93.184.216.34", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }] });
    expect(await lookUp(lookup, "shop.example.com", false)).toMatchObject({ err: null, address: "93.184.216.34", family: 4 });
  });

  it("refuses a name with any address that is not public, and passes on a failed lookup", async () => {
    for (const name of ["rebind.example.com", "meta.example.com"]) {
      const { err } = await lookUp(lookup, name, false);
      expect(err, name).toBeInstanceOf(NotPublicAddressError);
      expect(err?.code).toBe("ENOTPUBLIC");
    }
    expect((await lookUp(lookup, "nowhere.example.com", false)).err?.message).toContain("ENOTFOUND");
  });
});

describe("publicRequest", () => {
  it("refuses an address that is not public https before making any connection", async () => {
    await expect(publicRequest("http://example.com/")).rejects.toBeInstanceOf(NotPublicAddressError);
    await expect(publicRequest("https://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(NotPublicAddressError);
  });

  it("refuses, as it connects, a public-looking name that resolves to a private address", async () => {
    const lookup = resolver({ "inside.example.com": ["10.0.0.7"] });
    await expect(publicRequest("https://inside.example.com/", { lookup, timeoutMs: 1000 })).rejects.toBeInstanceOf(NotPublicAddressError);
  });
});
