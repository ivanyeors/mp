import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applicantLogoFolder, isStoredLogoUrl, partnerLogoFolder } from "@/lib/partner-upload/urls";

const ORIGIN = "https://proj.supabase.co";
const MEDIA = `${ORIGIN}/storage/v1/object/public/media/`;
const PARTNER = "3f6c1d2e-8a4b-4c5d-9e7f-0a1b2c3d4e5f";
const OTHER_PARTNER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const USER = "6b1f0c4e-2d3a-4b5c-8d9e-0f1a2b3c4d5e";
const OTHER_USER = "0c9d8e7f-6a5b-4c3d-9e2f-1a0b9c8d7e6f";

describe("partnerLogoFolder", () => {
  it("is partner-logos/{partnerId}/", () => {
    expect(partnerLogoFolder(PARTNER)).toBe(`partner-logos/${PARTNER}/`);
    expect(partnerLogoFolder("abc")).toBe("partner-logos/abc/");
  });
});

describe("applicantLogoFolder", () => {
  it("is partner-logos/applicants/{authUserId}/", () => {
    expect(applicantLogoFolder(USER)).toBe(`partner-logos/applicants/${USER}/`);
  });

  it("is the shared partner-logos/applicants/ folder without an id", () => {
    expect(applicantLogoFolder()).toBe("partner-logos/applicants/");
    expect(applicantLogoFolder(undefined)).toBe("partner-logos/applicants/");
    expect(applicantLogoFolder("")).toBe("partner-logos/applicants/");
  });

  it("never collides with a partner's own folder", () => {
    expect(applicantLogoFolder(USER)).not.toBe(partnerLogoFolder(USER));
  });
});

describe("isStoredLogoUrl (explicit storage origin)", () => {
  const applicant = applicantLogoFolder(USER);
  const partner = partnerLogoFolder(PARTNER);

  it("accepts a public media object in the folder on our storage origin", () => {
    expect(isStoredLogoUrl(`${MEDIA}${applicant}logo.webp`, applicant, ORIGIN)).toBe(true);
    expect(isStoredLogoUrl(`${MEDIA}${partner}1731740000-logo.webp`, partner, ORIGIN)).toBe(true);
  });

  it("accepts the storage origin given with a trailing slash or path", () => {
    expect(isStoredLogoUrl(`${MEDIA}${applicant}logo.webp`, applicant, `${ORIGIN}/`)).toBe(true);
    expect(isStoredLogoUrl(`${MEDIA}${applicant}logo.webp`, applicant, `${ORIGIN}/rest/v1`)).toBe(true);
  });

  it("is false for null, undefined, empty and garbage URLs", () => {
    for (const url of [null, undefined, "", "   ", "not a url", "logo.webp", "//proj.supabase.co/x", "http://"]) {
      expect(isStoredLogoUrl(url, applicant, ORIGIN), String(url)).toBe(false);
    }
  });

  it("is false for a bare path with no origin, even the right one", () => {
    expect(isStoredLogoUrl(`/storage/v1/object/public/media/${applicant}logo.webp`, applicant, ORIGIN)).toBe(false);
  });

  it("is false on another host serving the same path", () => {
    expect(
      isStoredLogoUrl(`https://evil.example/storage/v1/object/public/media/${applicant}logo.webp`, applicant, ORIGIN),
    ).toBe(false);
    expect(
      isStoredLogoUrl(
        `https://other-proj.supabase.co/storage/v1/object/public/media/${applicant}logo.webp`,
        applicant,
        ORIGIN,
      ),
    ).toBe(false);
  });

  it("is false on look-alike hosts", () => {
    const path = `/storage/v1/object/public/media/${applicant}logo.webp`;
    for (const url of [
      `https://proj.supabase.co.evil.example${path}`,
      `https://proj.supabase.co@evil.example${path}`,
      `https://evilproj.supabase.co${path}`,
      `https://xproj.supabase.co${path}`,
      `https://evil.example/https://proj.supabase.co${path}`,
      `https://evil.example${path}?u=https://proj.supabase.co`,
    ]) {
      expect(isStoredLogoUrl(url, applicant, ORIGIN), url).toBe(false);
    }
  });

  it("is false on the same host with a different scheme or port", () => {
    const path = `/storage/v1/object/public/media/${applicant}logo.webp`;
    expect(isStoredLogoUrl(`http://proj.supabase.co${path}`, applicant, ORIGIN)).toBe(false);
    expect(isStoredLogoUrl(`https://proj.supabase.co:8443${path}`, applicant, ORIGIN)).toBe(false);
    expect(isStoredLogoUrl(`https://proj.supabase.co${path}`, applicant, "https://proj.supabase.co:8443")).toBe(false);
    expect(isStoredLogoUrl(`https://proj.supabase.co${path}`, applicant, "http://proj.supabase.co")).toBe(false);
  });

  it("accepts a local storage origin with a port when the URL matches it exactly", () => {
    const local = "http://127.0.0.1:54321";
    const url = `${local}/storage/v1/object/public/media/${applicant}logo.webp`;
    expect(isStoredLogoUrl(url, applicant, local)).toBe(true);
    expect(isStoredLogoUrl(url, applicant, "http://127.0.0.1:54322")).toBe(false);
  });

  it("is false for another user's applicant folder", () => {
    expect(isStoredLogoUrl(`${MEDIA}${applicantLogoFolder(OTHER_USER)}logo.webp`, applicant, ORIGIN)).toBe(false);
  });

  it("is false for another partner's folder", () => {
    expect(isStoredLogoUrl(`${MEDIA}${partnerLogoFolder(OTHER_PARTNER)}logo.webp`, partner, ORIGIN)).toBe(false);
  });

  it("does not take an applicant's upload as a partner's logo, or the reverse", () => {
    expect(isStoredLogoUrl(`${MEDIA}${applicant}logo.webp`, partner, ORIGIN)).toBe(false);
    expect(isStoredLogoUrl(`${MEDIA}${partner}logo.webp`, applicant, ORIGIN)).toBe(false);
  });

  it("is false for the same folder in a different bucket or a non-public object path", () => {
    for (const url of [
      `${ORIGIN}/storage/v1/object/public/other/${applicant}logo.webp`,
      `${ORIGIN}/storage/v1/object/public/media-private/${applicant}logo.webp`,
      `${ORIGIN}/storage/v1/object/public/${applicant}logo.webp`,
      `${ORIGIN}/storage/v1/object/sign/media/${applicant}logo.webp`,
      `${ORIGIN}/storage/v1/object/authenticated/media/${applicant}logo.webp`,
      `${ORIGIN}/media/${applicant}logo.webp`,
      `${ORIGIN}/${applicant}logo.webp`,
    ]) {
      expect(isStoredLogoUrl(url, applicant, ORIGIN), url).toBe(false);
    }
  });

  it("is false for a folder-prefix trick (partner-logos/abc/ must not take partner-logos/abcd/)", () => {
    const folder = partnerLogoFolder("abc");
    expect(isStoredLogoUrl(`${MEDIA}partner-logos/abc/x.webp`, folder, ORIGIN)).toBe(true);
    expect(isStoredLogoUrl(`${MEDIA}partner-logos/abcd/x.webp`, folder, ORIGIN)).toBe(false);
    expect(isStoredLogoUrl(`${MEDIA}partner-logos/abc-evil/x.webp`, folder, ORIGIN)).toBe(false);
    expect(
      isStoredLogoUrl(`${MEDIA}${applicantLogoFolder(`${USER}x`)}logo.webp`, applicantLogoFolder(USER), ORIGIN),
    ).toBe(false);
  });

  it("is false when the path climbs out of the folder with ..", () => {
    const other = applicantLogoFolder(OTHER_USER);
    for (const url of [
      `${MEDIA}${applicant}../${OTHER_USER}/logo.webp`,
      `${MEDIA}${applicant}../../${partnerLogoFolder(PARTNER)}logo.webp`,
      `${MEDIA}${applicant}..%2F${OTHER_USER}%2Flogo.webp`,
      `${MEDIA}${applicant}%2e%2e/${OTHER_USER}/logo.webp`,
      `${MEDIA}${applicant}%2E%2E%2F${OTHER_USER}%2Flogo.webp`,
      `${MEDIA}${applicant}x/..%2F..%2F..%2F${other}logo.webp`,
      `${MEDIA}${applicant}../../../../other/${applicant}logo.webp`,
    ]) {
      expect(isStoredLogoUrl(url, applicant, ORIGIN), url).toBe(false);
    }
  });

  it("is false when no storage origin is available", () => {
    const url = `${MEDIA}${applicant}logo.webp`;
    expect(isStoredLogoUrl(url, applicant, "")).toBe(false);
  });

  it("is false when the storage origin itself is not a URL", () => {
    const url = `${MEDIA}${applicant}logo.webp`;
    expect(isStoredLogoUrl(url, applicant, "proj.supabase.co")).toBe(false);
    expect(isStoredLogoUrl(url, applicant, "not a url")).toBe(false);
  });
});

describe("isStoredLogoUrl (storage origin from NEXT_PUBLIC_SUPABASE_URL)", () => {
  const KEY = "NEXT_PUBLIC_SUPABASE_URL";
  const had = Object.prototype.hasOwnProperty.call(process.env, KEY);
  const saved = process.env[KEY];
  const applicant = applicantLogoFolder(USER);

  beforeEach(() => {
    delete process.env[KEY];
  });

  afterEach(() => {
    if (had) process.env[KEY] = saved;
    else delete process.env[KEY];
  });

  it("defaults to the project's Supabase URL", () => {
    process.env[KEY] = ORIGIN;
    expect(isStoredLogoUrl(`${MEDIA}${applicant}logo.webp`, applicant)).toBe(true);
    expect(
      isStoredLogoUrl(`https://evil.example/storage/v1/object/public/media/${applicant}logo.webp`, applicant),
    ).toBe(false);
  });

  it("reads the env at call time, not at import time", () => {
    process.env[KEY] = "https://other-proj.supabase.co";
    expect(isStoredLogoUrl(`${MEDIA}${applicant}logo.webp`, applicant)).toBe(false);
    process.env[KEY] = ORIGIN;
    expect(isStoredLogoUrl(`${MEDIA}${applicant}logo.webp`, applicant)).toBe(true);
  });

  it("is false when the env is unset and no origin is passed", () => {
    expect(isStoredLogoUrl(`${MEDIA}${applicant}logo.webp`, applicant)).toBe(false);
    expect(isStoredLogoUrl(`${MEDIA}${applicant}logo.webp`, applicant, undefined)).toBe(false);
  });

  it("is false when the env is empty", () => {
    process.env[KEY] = "";
    expect(isStoredLogoUrl(`${MEDIA}${applicant}logo.webp`, applicant)).toBe(false);
  });

  it("lets an explicit origin win over the env", () => {
    process.env[KEY] = "https://other-proj.supabase.co";
    expect(isStoredLogoUrl(`${MEDIA}${applicant}logo.webp`, applicant, ORIGIN)).toBe(true);
  });
});
