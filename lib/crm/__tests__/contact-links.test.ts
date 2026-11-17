import { describe, expect, it } from "vitest";
import { STAFF_MAILBOX, STAFF_MAIL_CC } from "@/lib/contact";
import {
  LINK_TEXT_MAX,
  contactDevice,
  emailLink,
  linkText,
  sentNote,
  telLink,
  whatsappDigits,
  whatsappLink,
} from "@/lib/crm/contact-links";

const FROM = { mailbox: "shop@example.com", cc: "copy@example.com" };
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";

describe("contactDevice", () => {
  it("reads the phone from the user agent", () => {
    expect(contactDevice(IPHONE)).toBe("iphone");
    expect(contactDevice(ANDROID)).toBe("android");
    expect(contactDevice(MAC)).toBe("computer");
    expect(contactDevice("")).toBe("computer");
  });

  it("reads an iPad that calls itself a Mac by its touch screen", () => {
    expect(contactDevice(MAC, 5)).toBe("iphone");
    expect(contactDevice(MAC, 0)).toBe("computer");
  });
});

describe("emailLink", () => {
  const message = { to: "mei.ling@example.com", subject: "Your pillow & you", body: "Hi Mei Ling,\nHow is it?" };

  it("opens Gmail compose in the Staff mailbox on a computer", () => {
    const link = emailLink(message, "computer", FROM);
    const url = new URL(link.href);
    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(url.searchParams.get("authuser")).toBe(FROM.mailbox);
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("to")).toBe("mei.ling@example.com");
    expect(url.searchParams.get("cc")).toBe(FROM.cc);
    expect(url.searchParams.get("su")).toBe("Your pillow & you");
    expect(url.searchParams.get("body")).toBe("Hi Mei Ling,\nHow is it?");
    expect(link.fallback).toBeNull();
  });

  it("percent-encodes every value", () => {
    const { href } = emailLink(message, "computer", FROM);
    expect(href).toContain("su=Your%20pillow%20%26%20you");
    expect(href).toContain("body=Hi%20Mei%20Ling%2C%0AHow%20is%20it%3F");
    expect(href).not.toContain(" ");
  });

  it("opens the Gmail app on an iPhone, with the phone's mail app as the fallback", () => {
    const link = emailLink(message, "iphone", FROM);
    expect(link.href.startsWith("googlegmail:///co?to=mei.ling%40example.com&cc=copy%40example.com&subject=")).toBe(true);
    expect(link.fallback).toBe(
      "mailto:mei.ling%40example.com?cc=copy%40example.com&subject=Your%20pillow%20%26%20you&body=Hi%20Mei%20Ling%2C%0AHow%20is%20it%3F",
    );
  });

  it("opens the default mail app on Android", () => {
    const link = emailLink(message, "android", FROM);
    expect(link.href.startsWith("mailto:mei.ling%40example.com?cc=copy%40example.com&subject=")).toBe(true);
    expect(link.fallback).toBeNull();
  });

  it("leaves out a subject and body that are empty, and keeps the Cc", () => {
    const blank = new URL(emailLink({ to: "a@example.com" }, "computer", FROM).href);
    expect([...blank.searchParams.keys()]).toEqual(["authuser", "view", "fs", "to", "cc"]);
    expect(emailLink({ to: "a@example.com", subject: " ", body: "" }, "android", FROM).href).toBe(
      "mailto:a%40example.com?cc=copy%40example.com",
    );
  });

  it("names the Staff mailbox and Cc from lib/contact.ts by default", () => {
    const url = new URL(emailLink({ to: "a@example.com" }, "computer").href);
    expect(url.searchParams.get("authuser")).toBe(STAFF_MAILBOX);
    expect(url.searchParams.get("cc")).toBe(STAFF_MAIL_CC);
  });
});

describe("whatsappLink", () => {
  it("gives a Singapore mobile its country code", () => {
    expect(whatsappDigits("8123 4567")).toBe("6581234567");
    expect(whatsappDigits("+65 8123 4567")).toBe("6581234567");
  });

  it("builds no link for a missing or invalid number", () => {
    expect(whatsappDigits(null)).toBeNull();
    expect(whatsappDigits("12")).toBeNull();
    expect(whatsappLink("12", "Hi", "computer")).toBeNull();
    expect(telLink("12")).toBeNull();
  });

  it("opens the chat on WhatsApp Web on a computer", () => {
    expect(whatsappLink("81234567", "Hi Mei Ling, how is it?", "computer")?.href).toBe(
      "https://web.whatsapp.com/send?phone=6581234567&text=Hi%20Mei%20Ling%2C%20how%20is%20it%3F",
    );
    expect(whatsappLink("81234567", "", "computer")?.href).toBe("https://web.whatsapp.com/send?phone=6581234567");
  });

  it("opens the app through wa.me on a phone", () => {
    expect(whatsappLink("81234567", "Hi", "iphone")?.href).toBe("https://wa.me/6581234567?text=Hi");
    expect(whatsappLink("81234567", null, "android")?.href).toBe("https://wa.me/6581234567");
  });

  it("dials the number in E.164", () => {
    expect(telLink("81234567")).toBe("tel:+6581234567");
  });
});

describe("linkText", () => {
  it("keeps a text that fits", () => {
    expect(linkText("  Hello  ")).toBe("Hello");
    expect(linkText(null)).toBe("");
  });

  it("cuts a long text at a word and marks it", () => {
    const long = Array.from({ length: 600 }, () => "word").join(" ");
    const cut = linkText(long);
    expect(cut.length).toBeLessThanOrEqual(LINK_TEXT_MAX);
    expect(cut.endsWith("word…")).toBe(true);
  });
});

describe("sentNote", () => {
  it("says what was sent and keeps the words", () => {
    expect(sentNote("email", { subject: "Your pillow", body: "Hi Mei Ling" }, 5000)).toBe(
      "Emailed them from Gmail.\nSubject: Your pillow\n\nHi Mei Ling",
    );
    expect(sentNote("whatsapp", { subject: "ignored", body: "Hi" }, 5000)).toBe("Messaged them on WhatsApp.\n\nHi");
  });

  it("is one line for a blank message", () => {
    expect(sentNote("whatsapp", {}, 5000)).toBe("Messaged them on WhatsApp.");
  });

  it("fits a note", () => {
    const note = sentNote("email", { body: "x".repeat(6000) }, 5000);
    expect(note.length).toBe(5000);
    expect(note.endsWith("…")).toBe(true);
  });
});
